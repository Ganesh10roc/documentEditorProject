import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/session";
import { pull, sync } from "@/server/services/sync";
import { syncPullSchema, syncPushSchema } from "@/server/validation/sync";
import { fail, handle, ok, tooLarge } from "@/server/http/responses";
import { rateLimit } from "@/server/http/rate-limit";
import { requireUuid } from "@/server/http/params";
import { env } from "@/lib/env";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/documents/:id/sync?since=N — pull remote changes only.
 * Used by the client's polling loop while online.
 */
export function GET(req: NextRequest, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id: rawId } = await params;
    const id = requireUuid(rawId);
    // Throttle the poll/read path too — it also triggers opportunistic compaction.
    const rl = rateLimit(`pull:${user.id}:${id}`, 120, 10_000);
    if (!rl.allowed) return fail(429, "rate_limited", "Slow down");

    const { since } = syncPullSchema.parse({
      since: req.nextUrl.searchParams.get("since") ?? 0,
    });
    const result = await pull(user.id, id, since);
    return ok(result);
  });
}

/**
 * POST /api/documents/:id/sync — push local changes and pull remote in one
 * round trip. This is the hot path; it is defended at three layers against a
 * malicious oversized payload OOMing the server:
 *   1. Content-Length header check (reject before reading the body)
 *   2. Actual byte-length check on the raw text (header can lie / be absent)
 *   3. Zod schema bounds (batch count + per-update decoded size)
 * plus a per-user/document rate limit.
 */
export function POST(req: NextRequest, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id: rawId } = await params;
    const id = requireUuid(rawId);

    // Layer 0: rate limit the write path.
    const rl = rateLimit(`sync:${user.id}:${id}`, 60, 10_000);
    if (!rl.allowed) return fail(429, "rate_limited", "Slow down");

    const max = env.MAX_SYNC_PAYLOAD_BYTES;

    // Layer 1: trust-but-verify the declared size.
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > max) return tooLarge();

    // Layer 2: read the raw body and measure its actual size before parsing.
    const raw = await req.text();
    if (Buffer.byteLength(raw, "utf8") > max) return tooLarge();

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return fail(400, "bad_json", "Body is not valid JSON");
    }

    // Layer 3: strict schema — bounds batch count and per-update decoded size.
    const { since, updates } = syncPushSchema.parse(json);

    const result = await sync(user.id, id, since, updates);
    return ok(result);
  });
}
