import { z } from "zod";
import { NotFoundError } from "@/server/errors";

const uuidSchema = z.string().uuid();

/**
 * Validate a dynamic route/query parameter that must be a UUID. A malformed
 * value would otherwise reach Postgres as `eq(<uuid col>, '…')` and throw
 * `invalid input syntax for type uuid` — a generic 500. Rejecting it here as a
 * clean 404 means an unguessable/garbage id behaves like "not found", which is
 * both correct and avoids leaking a stack trace path.
 */
export function requireUuid(value: string | null | undefined): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw new NotFoundError();
  return parsed.data;
}

/**
 * Best-effort client IP for coarse rate-limiting. `x-forwarded-for` can be a
 * comma-separated chain (client, proxy1, proxy2…); the left-most is the client
 * as set by the platform edge (Vercel). Normalising to that single value keeps
 * the throttle bucket stable instead of splintering per proxy hop.
 */
export function clientIp(xForwardedFor: string | null): string {
  if (!xForwardedFor) return "unknown";
  return xForwardedFor.split(",")[0]!.trim() || "unknown";
}
