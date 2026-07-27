import * as Y from "yjs";
import type { ConnectionStatus, Role } from "@/lib/constants";
import {
  SYNC_BACKOFF_BASE_MS,
  SYNC_BACKOFF_MAX_MS,
  SYNC_DEBOUNCE_MS,
  SYNC_MAX_BATCH,
  SYNC_PULL_INTERVAL_MS,
  canEdit,
} from "@/lib/constants";
import { idbGet, idbSet } from "@/client/local/idb";
import { isOnline, onConnectivityChange } from "./connectivity";

// --- base64 <-> Uint8Array (browser-safe, no Buffer) -----------------------
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const REMOTE_ORIGIN = "palimpsest-remote";

interface SyncState {
  since: number;
  outbox: string[]; // base64 Yjs updates awaiting server acknowledgement
}

export interface SyncEngineOptions {
  documentId: string;
  ydoc: Y.Doc;
  role: Role;
  onStatus?: (status: ConnectionStatus) => void;
  onPending?: (count: number) => void;
}

/**
 * Drives synchronisation for a single document.
 *
 * Local edits are captured into a durable IndexedDB **outbox** and pushed to
 * the server on a debounce (coalescing rapid keystrokes), on an interval, and
 * immediately on reconnect. Because Yjs updates are commutative and idempotent,
 * pushing a batch and re-applying the server's merged response can never lose
 * or corrupt offline work — the merge is deterministic. Viewers never push.
 */
export class SyncEngine {
  private readonly documentId: string;
  private readonly ydoc: Y.Doc;
  private readonly role: Role;
  private readonly onStatus?: (s: ConnectionStatus) => void;
  private readonly onPending?: (n: number) => void;

  private since = 0;
  private outbox: string[] = [];

  // Origins whose updates must NOT be pushed over HTTP again — e.g. the
  // WebSocket provider. The originating client already persists its own edits;
  // relayed copies would otherwise be redundantly re-pushed by every receiver.
  private readonly ignoredOrigins = new Set<unknown>();

  private started = false;
  private flushing = false;
  private flushQueued = false;
  private backoff = 0;
  private status: ConnectionStatus = "connecting";

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pullTimer: ReturnType<typeof setInterval> | null = null;
  private backoffTimer: ReturnType<typeof setTimeout> | null = null;
  private disposeConnectivity: (() => void) | null = null;
  private readonly updateHandler: (u: Uint8Array, origin: unknown) => void;

  constructor(opts: SyncEngineOptions) {
    this.documentId = opts.documentId;
    this.ydoc = opts.ydoc;
    this.role = opts.role;
    this.onStatus = opts.onStatus;
    this.onPending = opts.onPending;

    // Capture only genuinely local edits (skip server pulls and WS-relayed ones).
    this.updateHandler = (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE_ORIGIN || this.ignoredOrigins.has(origin)) return;
      if (!canEdit(this.role)) return; // viewers never enqueue
      this.outbox.push(toBase64(update));
      void this.persist();
      this.onPending?.(this.outbox.length);
      this.scheduleFlush();
    };
  }

  private key() {
    return `doc:${this.documentId}`;
  }

  private async persist() {
    const state: SyncState = { since: this.since, outbox: this.outbox };
    await idbSet(this.key(), state);
  }

  private setStatus(s: ConnectionStatus) {
    if (s === this.status) return;
    this.status = s;
    this.onStatus?.(s);
  }

  async start() {
    if (this.started) return;
    this.started = true;

    // Restore durable state from a previous session (offline work included).
    const saved = await idbGet<SyncState>(this.key());
    if (saved) {
      this.since = saved.since ?? 0;
      this.outbox = saved.outbox ?? [];
      this.onPending?.(this.outbox.length);
    }

    this.ydoc.on("update", this.updateHandler);

    this.disposeConnectivity = onConnectivityChange((online) => {
      if (online) {
        this.setStatus("connecting");
        void this.sync();
      } else {
        this.setStatus("offline");
      }
    });

    // Poll for remote changes while online (covers other collaborators' edits).
    this.pullTimer = setInterval(() => {
      if (isOnline()) void this.pull();
    }, SYNC_PULL_INTERVAL_MS);

    // Initial reconciliation: pull remote, then flush any queued local work.
    await this.sync();
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    this.ydoc.off("update", this.updateHandler);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.pullTimer) clearInterval(this.pullTimer);
    if (this.backoffTimer) clearTimeout(this.backoffTimer);
    this.disposeConnectivity?.();
  }

  /** Number of local edits not yet acknowledged by the server. */
  pendingCount() {
    return this.outbox.length;
  }

  /** Register an update origin (e.g. the WebSocket provider) to not re-push. */
  ignoreOrigin(origin: unknown) {
    this.ignoredOrigins.add(origin);
  }

  private scheduleFlush() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => void this.flush(), SYNC_DEBOUNCE_MS);
  }

  /** Full reconciliation: pull remote, then push local. */
  async sync() {
    await this.pull();
    await this.flush();
  }

  /** Fetch and apply remote changes we haven't seen. */
  async pull() {
    if (!isOnline()) {
      this.setStatus("offline");
      return;
    }
    try {
      const res = await fetch(
        `/api/documents/${this.documentId}/sync?since=${this.since}`,
        { method: "GET" }
      );
      if (!res.ok) return this.handleHttpError(res.status);
      const { data } = await res.json();
      this.applyMerged(data.merged, data.seq);
      this.settle();
    } catch {
      this.setStatus("offline");
    }
  }

  /** Push queued local edits (no-op for viewers or an empty outbox). */
  async flush(): Promise<void> {
    if (!canEdit(this.role) || this.outbox.length === 0) {
      this.settle();
      return;
    }
    if (!isOnline()) {
      this.setStatus("offline");
      return;
    }
    if (this.flushing) {
      this.flushQueued = true; // coalesce concurrent flushes
      return;
    }

    this.flushing = true;
    this.setStatus("syncing");

    // Snapshot the batch we're sending; edits made during the request append
    // to the end of the outbox and are preserved for the next flush.
    const batch = this.outbox.slice(0, SYNC_MAX_BATCH);

    try {
      const res = await fetch(`/api/documents/${this.documentId}/sync`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ since: this.since, updates: batch }),
      });

      if (!res.ok) {
        this.flushing = false;
        return this.handleHttpError(res.status);
      }

      const { data } = await res.json();
      // Drop exactly the updates we sent; keep anything queued during the request.
      this.outbox.splice(0, batch.length);
      this.applyMerged(data.merged, data.seq);
      await this.persist();
      this.onPending?.(this.outbox.length);
      this.backoff = 0;
      this.flushing = false;

      if (this.outbox.length > 0 || this.flushQueued) {
        this.flushQueued = false;
        void this.flush(); // more work arrived — keep draining
      } else {
        this.settle();
      }
    } catch {
      this.flushing = false;
      this.scheduleBackoff();
    }
  }

  private applyMerged(mergedB64: string | null, seq: number) {
    // A response can resolve after stop()/teardown — never touch a doc that may
    // already be destroyed.
    if (!this.started) return;
    if (mergedB64) {
      const update = fromBase64(mergedB64);
      // Tag as remote so the update handler doesn't re-enqueue it.
      Y.applyUpdate(this.ydoc, update, REMOTE_ORIGIN);
    }
    if (typeof seq === "number" && seq > this.since) {
      this.since = seq;
      void this.persist();
    }
  }

  private settle() {
    this.setStatus(this.outbox.length > 0 ? "syncing" : "synced");
  }

  private handleHttpError(status: number) {
    // 401 → session expired; 403 → viewer tried to push; both are terminal-ish.
    if (status === 401 || status === 403) {
      this.setStatus("error");
      return;
    }
    // 429 / 5xx → transient; back off and retry.
    this.scheduleBackoff();
  }

  private scheduleBackoff() {
    this.setStatus("error");
    this.backoff = Math.min(
      this.backoff ? this.backoff * 2 : SYNC_BACKOFF_BASE_MS,
      SYNC_BACKOFF_MAX_MS
    );
    if (this.backoffTimer) clearTimeout(this.backoffTimer);
    this.backoffTimer = setTimeout(() => {
      this.backoffTimer = null;
      // Guard: the engine may have been stopped during the backoff window.
      if (this.started && isOnline()) void this.sync();
    }, this.backoff);
  }
}
