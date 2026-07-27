import type { Role } from "@/lib/constants";
import { cn } from "@/lib/utils";

const STYLES: Record<Role, string> = {
  owner: "bg-[var(--accent)]/15 text-[var(--accent)]",
  editor: "bg-[var(--success)]/15 text-[var(--success)]",
  viewer: "bg-[var(--surface-2)] text-[var(--text-muted)]",
};

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        STYLES[role],
        className
      )}
    >
      {role}
    </span>
  );
}
