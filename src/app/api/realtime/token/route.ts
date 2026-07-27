import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { requireUser } from "@/server/auth/session";
import { getDocument } from "@/server/services/documents";
import { fail, handle, ok } from "@/server/http/responses";
import { requireUuid } from "@/server/http/params";
import { env } from "@/lib/env";

export const runtime = "nodejs";

const secret = new TextEncoder().encode(env.AUTH_SECRET);

/**
 * GET /api/realtime/token?doc=<id>
 *
 * Issues a short-lived JWT the browser uses to authenticate to the WebSocket
 * relay. The user's role on the document is baked in and signed, so the relay
 * can enforce "viewers are read-only" without a database round-trip.
 * getDocument throws NotFound (→ 404) if the caller is not a member.
 *
 * The token carries a frozen role/membership, so a demotion or removal only
 * takes effect on the relay when the current token expires. The TTL below bounds
 * that revocation window. Persistence is unaffected: all writes still go through
 * the HTTP API under RLS, so a stale role here can never write to the database.
 */
export function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const docParam = req.nextUrl.searchParams.get("doc");
    if (!docParam) return fail(400, "bad_request", "Missing doc parameter");
    const docId = requireUuid(docParam);

    const doc = await getDocument(user.id, docId); // 404 if not a member

    const token = await new SignJWT({
      userId: user.id,
      name: user.name || user.email,
      docId,
      role: doc.role,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      // Covers a typical editing session while bounding the revocation window to
      // 30 min. If it expires mid-session the socket simply stops relaying live
      // cursors — editing continues over HTTP sync (the source of truth).
      .setExpirationTime("30m")
      .sign(secret);

    return ok({ token });
  });
}
