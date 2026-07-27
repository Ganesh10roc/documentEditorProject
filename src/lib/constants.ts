/**
 * Shared, isomorphic constants. Safe to import from both server and client.
 * No secrets, no environment access.
 */

export const ROLES = ["owner", "editor", "viewer"] as const;
export type Role = (typeof ROLES)[number];

/** Ordered by privilege — higher index means more capability. */
export const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  editor: 1,
  owner: 2,
};

export function canEdit(role: Role | null | undefined): boolean {
  return role === "owner" || role === "editor";
}

export function isOwner(role: Role | null | undefined): boolean {
  return role === "owner";
}

// --- Sync engine tuning ----------------------------------------------------
/** Debounce window (ms) for coalescing rapid keystrokes into one flush. */
export const SYNC_DEBOUNCE_MS = 600;
/** How often (ms) to poll the server for remote updates while online. */
export const SYNC_PULL_INTERVAL_MS = 4000;
/** Max updates batched into a single push request. */
export const SYNC_MAX_BATCH = 200;
/** Base backoff (ms) for retrying failed pushes; grows exponentially. */
export const SYNC_BACKOFF_BASE_MS = 1000;
export const SYNC_BACKOFF_MAX_MS = 30000;

// --- Payload safety limits (mirror server-side hard caps) ------------------
/** Reject any single Yjs update larger than this (base64-decoded bytes). */
export const MAX_SINGLE_UPDATE_BYTES = 256 * 1024; // 256 KiB
/** Reject a sync batch with more than this many updates. */
export const MAX_BATCH_UPDATES = 500;

export type ConnectionStatus =
  | "offline"
  | "connecting"
  | "synced"
  | "syncing"
  | "error";
