"use client";

import { useEffect, useState } from "react";
import type { WebsocketProvider } from "y-websocket";
import { initials } from "@/lib/utils";

interface Peer {
  clientId: number;
  name: string;
  color: string;
}

/**
 * Live presence roster driven by the WebSocket provider's awareness. Shows an
 * avatar per connected collaborator (colour matches their live cursor). Renders
 * nothing when real-time isn't configured (HTTP-only mode).
 */
export function PresenceBar({
  provider,
  selfClientId,
}: {
  provider: WebsocketProvider | null;
  selfClientId?: number;
}) {
  const [peers, setPeers] = useState<Peer[]>([]);

  useEffect(() => {
    if (!provider) {
      setPeers([]);
      return;
    }
    const awareness = provider.awareness;

    const read = () => {
      const list: Peer[] = [];
      awareness.getStates().forEach((state, clientId) => {
        const u = (state as { user?: { name?: string; color?: string } }).user;
        if (u?.name) {
          list.push({
            clientId,
            name: u.name,
            color: u.color ?? "var(--accent)",
          });
        }
      });
      setPeers(list);
    };

    read();
    awareness.on("change", read);
    return () => awareness.off("change", read);
  }, [provider]);

  if (!provider || peers.length === 0) return null;

  const shown = peers.slice(0, 5);
  const extra = peers.length - shown.length;

  return (
    <div
      className="flex items-center -space-x-2"
      aria-label={`${peers.length} collaborator${peers.length === 1 ? "" : "s"} online`}
    >
      {shown.map((p) => (
        <span
          key={p.clientId}
          className="grid h-7 w-7 place-items-center rounded-full border-2 border-[var(--bg)] text-[10px] font-semibold text-white"
          style={{ background: p.color }}
          title={
            p.clientId === selfClientId ? `${p.name} (you)` : p.name
          }
        >
          {initials(p.name)}
        </span>
      ))}
      {extra > 0 && (
        <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-[var(--bg)] bg-[var(--surface-2)] text-[10px] font-semibold text-[var(--text-muted)]">
          +{extra}
        </span>
      )}
    </div>
  );
}
