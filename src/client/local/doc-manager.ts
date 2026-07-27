import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { WebsocketProvider } from "y-websocket";
import type { ConnectionStatus, Role } from "@/lib/constants";
import { SyncEngine } from "@/client/sync/sync-engine";

export interface RealtimeUser {
  name: string;
  color: string;
}

/**
 * Registry of live documents, keyed by id and reference-counted. Multiple
 * components (the editor, the history panel, the presence bar) can `acquire`
 * the same document and share ONE Y.Doc, ONE IndexedDB persistence, ONE sync
 * engine, and ONE WebSocket provider — preventing duplicate outboxes and
 * double-pushing. The doc is torn down only when the last consumer releases it.
 *
 * The WebSocket provider is OPTIONAL: it is created only when NEXT_PUBLIC_WS_URL
 * is configured. Without it the app runs on HTTP sync alone (no live cursors),
 * so real-time collaboration degrades gracefully rather than breaking.
 */
interface DocEntry {
  ydoc: Y.Doc;
  persistence: IndexeddbPersistence;
  engine: SyncEngine;
  provider: WebsocketProvider | null;
  whenReady: Promise<void>;
  status: ConnectionStatus;
  pending: number;
  refs: number;
  statusListeners: Set<(s: ConnectionStatus) => void>;
  pendingListeners: Set<(n: number) => void>;
  providerListeners: Set<(p: WebsocketProvider | null) => void>;
}

const registry = new Map<string, DocEntry>();

export interface AcquiredDoc {
  ydoc: Y.Doc;
  engine: SyncEngine;
  whenReady: Promise<void>;
  getStatus: () => ConnectionStatus;
  getPending: () => number;
  getProvider: () => WebsocketProvider | null;
  subscribeStatus: (fn: (s: ConnectionStatus) => void) => () => void;
  subscribePending: (fn: (n: number) => void) => () => void;
  subscribeProvider: (fn: (p: WebsocketProvider | null) => void) => () => void;
}

export function acquireDoc(
  documentId: string,
  role: Role,
  user?: RealtimeUser
): AcquiredDoc {
  let entry = registry.get(documentId);

  if (!entry) {
    const ydoc = new Y.Doc();
    // y-indexeddb is the primary local source of truth: it loads the document
    // from the browser before any network call, so the UI is editable offline
    // and on first paint. `whenReady` resolves once that local load completes.
    const persistence = new IndexeddbPersistence(
      `palimpsest-doc-${documentId}`,
      ydoc
    );

    const created: DocEntry = {
      ydoc,
      persistence,
      engine: undefined as unknown as SyncEngine, // assigned below
      provider: null,
      whenReady: persistence.whenSynced.then(() => undefined),
      status: "connecting",
      pending: 0,
      refs: 0,
      statusListeners: new Set(),
      pendingListeners: new Set(),
      providerListeners: new Set(),
    };

    created.engine = new SyncEngine({
      documentId,
      ydoc,
      role,
      onStatus: (s) => {
        created.status = s;
        created.statusListeners.forEach((fn) => fn(s));
      },
      onPending: (n) => {
        created.pending = n;
        created.pendingListeners.forEach((fn) => fn(n));
      },
    });

    // Start syncing (and, if configured, connect the WebSocket) once the local
    // doc has loaded — never block the UI on the network.
    created.whenReady.then(() => {
      created.engine.start();
      void setupRealtime(documentId, created, user);
    });

    registry.set(documentId, created);
    entry = created;
  }

  entry.refs += 1;
  const e = entry;

  return {
    ydoc: e.ydoc,
    engine: e.engine,
    whenReady: e.whenReady,
    getStatus: () => e.status,
    getPending: () => e.pending,
    getProvider: () => e.provider,
    subscribeStatus: (fn) => {
      e.statusListeners.add(fn);
      return () => e.statusListeners.delete(fn);
    },
    subscribePending: (fn) => {
      e.pendingListeners.add(fn);
      return () => e.pendingListeners.delete(fn);
    },
    subscribeProvider: (fn) => {
      e.providerListeners.add(fn);
      return () => e.providerListeners.delete(fn);
    },
  };
}

/**
 * Fetch a signed realtime token and open the WebSocket provider for live
 * collaboration. No-op when NEXT_PUBLIC_WS_URL is unset or the token request
 * fails — the app keeps working on HTTP sync alone.
 */
async function setupRealtime(
  documentId: string,
  entry: DocEntry,
  user?: RealtimeUser
) {
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
  if (!wsUrl || entry.provider) return;
  try {
    const res = await fetch(`/api/realtime/token?doc=${documentId}`);
    if (!res.ok) return;
    const { data } = await res.json();

    // The doc may have been released (and is queued for destruction) while the
    // token request was in flight — never open a socket on a dying doc.
    if (entry.refs <= 0 || registry.get(documentId) !== entry) return;

    const provider = new WebsocketProvider(wsUrl, documentId, entry.ydoc, {
      params: { token: data.token },
    });
    if (user) {
      provider.awareness.setLocalStateField("user", {
        name: user.name,
        color: user.color,
      });
    }
    // Updates arriving over the socket must not be re-pushed over HTTP.
    entry.engine.ignoreOrigin(provider);

    entry.provider = provider;
    entry.providerListeners.forEach((fn) => fn(provider));
  } catch {
    // Realtime is best-effort; HTTP sync remains the source of truth.
  }
}

export function releaseDoc(documentId: string): void {
  const entry = registry.get(documentId);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs > 0) return;

  // Last consumer gone — tear down. Delay slightly so a fast unmount/remount
  // (e.g. React strict-mode double-invoke) reuses the entry instead of thrashing.
  setTimeout(() => {
    const current = registry.get(documentId);
    if (!current || current.refs > 0) return;
    current.engine.stop();
    current.provider?.destroy();
    current.persistence.destroy();
    current.ydoc.destroy();
    registry.delete(documentId);
  }, 1000);
}
