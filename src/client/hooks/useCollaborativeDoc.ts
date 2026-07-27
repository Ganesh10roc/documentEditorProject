"use client";

import { useEffect, useState } from "react";
import type * as Y from "yjs";
import type { WebsocketProvider } from "y-websocket";
import type { ConnectionStatus, Role } from "@/lib/constants";
import {
  acquireDoc,
  releaseDoc,
  type AcquiredDoc,
  type RealtimeUser,
} from "@/client/local/doc-manager";
import type { SyncEngine } from "@/client/sync/sync-engine";

export interface CollaborativeDoc {
  /** The shared Y.Doc — bind the editor to its `prosemirror` XML fragment. */
  ydoc: Y.Doc | null;
  /** The sync engine — call `engine.sync()` to force a reconciliation. */
  engine: SyncEngine | null;
  /** WebSocket provider for live cursors/presence, or null (HTTP-only mode). */
  provider: WebsocketProvider | null;
  /** True once the local (IndexedDB) copy has loaded — the UI is now editable. */
  ready: boolean;
  /** Live connection status for the indicator. */
  status: ConnectionStatus;
  /** Count of local edits not yet acknowledged by the server. */
  pending: number;
}

/**
 * React binding for the local-first engine. Acquires a shared, reference-counted
 * document and subscribes to its status/pending/provider signals. Never blocks
 * the UI on the network: `ready` flips as soon as the local copy loads, and the
 * WebSocket provider (if configured) arrives asynchronously afterwards.
 */
export function useCollaborativeDoc(
  documentId: string,
  role: Role,
  user?: RealtimeUser
): CollaborativeDoc {
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [engine, setEngine] = useState<SyncEngine | null>(null);
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let handle: AcquiredDoc | null = null;
    const unsubs: Array<() => void> = [];

    handle = acquireDoc(documentId, role, user);
    setYdoc(handle.ydoc);
    setEngine(handle.engine);
    setProvider(handle.getProvider());
    setStatus(handle.getStatus());
    setPending(handle.getPending());
    unsubs.push(handle.subscribeStatus(setStatus));
    unsubs.push(handle.subscribePending(setPending));
    unsubs.push(handle.subscribeProvider(setProvider));

    handle.whenReady.then(() => {
      if (!cancelled) setReady(true);
    });

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
      releaseDoc(documentId);
    };
    // user identity is stable for the session; re-acquire only on doc/role change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, role]);

  return { ydoc, engine, provider, ready, status, pending };
}
