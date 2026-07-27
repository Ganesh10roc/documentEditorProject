"use client";

import { Check, CloudOff, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import type { ConnectionStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";

const CONFIG: Record<
  ConnectionStatus,
  { label: string; color: string; Icon: typeof Check; spin?: boolean }
> = {
  offline: { label: "Offline — edits saved locally", color: "var(--text-muted)", Icon: CloudOff },
  connecting: { label: "Connecting…", color: "var(--warning)", Icon: Loader2, spin: true },
  syncing: { label: "Syncing…", color: "var(--accent)", Icon: RefreshCw, spin: true },
  synced: { label: "All changes saved", color: "var(--success)", Icon: Check },
  error: { label: "Sync error — retrying", color: "var(--danger)", Icon: TriangleAlert },
};

export function ConnectionStatusBadge({
  status,
  pending,
  className,
}: {
  status: ConnectionStatus;
  pending?: number;
  className?: string;
}) {
  const { label, color, Icon, spin } = CONFIG[status];
  const showPending = (pending ?? 0) > 0 && status !== "synced";
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
        className
      )}
      style={{ color }}
      role="status"
      aria-live="polite"
    >
      <Icon size={14} className={spin ? "animate-spin" : undefined} aria-hidden />
      <span>{label}</span>
      {showPending && (
        <span
          className="rounded-full bg-[var(--surface-2)] px-1.5 text-[10px] text-[var(--text-muted)]"
          title={`${pending} local change(s) queued`}
        >
          {pending}
        </span>
      )}
    </div>
  );
}
