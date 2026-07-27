/**
 * Palimpsest real-time relay.
 *
 * A small, persistent y-websocket server for LIVE collaboration — sub-second
 * update propagation, live cursors, and presence. It is intentionally NOT the
 * source of truth: durability + offline sync are handled by the Next.js app's
 * HTTP sync engine (Postgres). This server is a stateless in-memory relay.
 *
 * Security:
 *  - Every connection must present a short-lived JWT (issued by the app at
 *    /api/realtime/token) signed with the shared AUTH_SECRET. Unauthenticated
 *    upgrades are rejected with 401.
 *  - The token carries the user's role on the document. VIEWERS ARE READ-ONLY:
 *    their inbound document updates are dropped, so they can watch live but can
 *    never push — enforced here at the real-time layer, mirroring the API + RLS.
 *
 * Env: AUTH_SECRET (required, shared with the app), PORT (Railway provides it).
 */
import http from "node:http";
import { WebSocketServer } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { jwtVerify } from "jose";

const PORT = process.env.PORT || 8080;
if (!process.env.AUTH_SECRET) {
  console.error("FATAL: AUTH_SECRET is required (must match the Next.js app).");
  process.exit(1);
}
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET);

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const PING_TIMEOUT = 30_000;
const WS_OPEN = 1;

/** docId -> Room. Rooms are created on demand and GC'd when the last peer leaves. */
const rooms = new Map();

class Room {
  constructor(name) {
    this.name = name;
    this.doc = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    this.awareness.setLocalState(null);
    /** conn -> Set<awarenessClientId> that connection controls */
    this.conns = new Map();

    // Broadcast document updates to every peer except the originator.
    this.doc.on("update", (update, origin) => {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MESSAGE_SYNC);
      syncProtocol.writeUpdate(enc, update);
      const msg = encoding.toUint8Array(enc);
      this.conns.forEach((_ids, conn) => {
        if (conn !== origin) send(conn, msg);
      });
    });

    // Broadcast awareness (cursors/presence) changes to every peer.
    this.awareness.on("update", ({ added, updated, removed }) => {
      const changed = added.concat(updated, removed);
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        enc,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed)
      );
      const msg = encoding.toUint8Array(enc);
      this.conns.forEach((_ids, conn) => send(conn, msg));
    });
  }
}

function getRoom(name) {
  let room = rooms.get(name);
  if (!room) {
    room = new Room(name);
    rooms.set(name, room);
  }
  return room;
}

function send(conn, msg) {
  if (conn.readyState !== WS_OPEN) {
    try { conn.close(); } catch {}
    return;
  }
  try {
    conn.send(msg);
  } catch {
    try { conn.close(); } catch {}
  }
}

function handleMessage(conn, room, role, bytes) {
  const decoder = decoding.createDecoder(bytes);
  const messageType = decoding.readVarUint(decoder);

  if (messageType === MESSAGE_SYNC) {
    // Peek the sync sub-type on a fresh decoder to enforce read-only viewers.
    const peek = decoding.createDecoder(bytes);
    decoding.readVarUint(peek); // messageType
    const syncType = decoding.readVarUint(peek);
    const isWrite =
      syncType === syncProtocol.messageYjsSyncStep2 ||
      syncType === syncProtocol.messageYjsUpdate;
    if (isWrite && role === "viewer") {
      return; // read-only: silently drop a viewer's document edits
    }
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MESSAGE_SYNC);
    syncProtocol.readSyncMessage(decoder, enc, room.doc, conn);
    // A reply is only produced for SyncStep1 (the server returns its state).
    if (encoding.length(enc) > 1) send(conn, encoding.toUint8Array(enc));
  } else if (messageType === MESSAGE_AWARENESS) {
    awarenessProtocol.applyAwarenessUpdate(
      room.awareness,
      decoding.readVarUint8Array(decoder),
      conn
    );
  }
}

function closeConn(room, conn) {
  const ids = room.conns.get(conn);
  if (ids !== undefined) {
    room.conns.delete(conn);
    awarenessProtocol.removeAwarenessStates(
      room.awareness,
      Array.from(ids),
      null
    );
    if (room.conns.size === 0) {
      room.doc.destroy();
      rooms.delete(room.name);
    }
  }
  try { conn.close(); } catch {}
}

async function authenticate(req) {
  try {
    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("token");
    const docId = url.pathname.replace(/^\/+/, "") || url.searchParams.get("doc");
    if (!token || !docId) return null;
    const { payload } = await jwtVerify(token, SECRET, { algorithms: ["HS256"] });
    if (payload.docId !== docId) return null;
    return {
      docId,
      role: payload.role,
      userId: payload.userId,
      name: payload.name,
    };
  } catch {
    return null;
  }
}

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("palimpsest realtime: ok");
});

const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (conn, _req, auth) => {
  const room = getRoom(auth.docId);
  room.conns.set(conn, new Set());

  // Record which awareness client ids this connection controls, so we can clear
  // its cursor/presence when it disconnects.
  const trackAwareness = ({ added, removed }, origin) => {
    if (origin !== conn) return;
    const ids = room.conns.get(conn);
    if (!ids) return;
    added.forEach((id) => ids.add(id));
    removed.forEach((id) => ids.delete(id));
  };
  room.awareness.on("update", trackAwareness);

  conn.on("message", (data, isBinary) => {
    void isBinary;
    const bytes =
      data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    try {
      handleMessage(conn, room, auth.role, bytes);
    } catch (err) {
      console.error("message error:", err);
      closeConn(room, conn);
    }
  });

  // Keep-alive: drop dead connections so rooms don't leak.
  let alive = true;
  conn.on("pong", () => { alive = true; });
  const ping = setInterval(() => {
    if (!alive) {
      clearInterval(ping);
      closeConn(room, conn);
      return;
    }
    alive = false;
    try { conn.ping(); } catch { clearInterval(ping); closeConn(room, conn); }
  }, PING_TIMEOUT);

  conn.on("close", () => {
    clearInterval(ping);
    room.awareness.off("update", trackAwareness);
    closeConn(room, conn);
  });

  // 1) Kick off the sync handshake (server → client state vector).
  {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(enc, room.doc);
    send(conn, encoding.toUint8Array(enc));
  }
  // 2) Send the current presence roster to the newcomer.
  const states = room.awareness.getStates();
  if (states.size > 0) {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      enc,
      awarenessProtocol.encodeAwarenessUpdate(
        room.awareness,
        Array.from(states.keys())
      )
    );
    send(conn, encoding.toUint8Array(enc));
  }
});

server.on("upgrade", async (req, socket, head) => {
  const auth = await authenticate(req);
  if (!auth) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) =>
    wss.emit("connection", ws, req, auth)
  );
});

server.listen(PORT, () => {
  console.log(`Palimpsest realtime relay listening on :${PORT}`);
});
