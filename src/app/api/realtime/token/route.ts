import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { requireUser } from "@/server/auth/session";
import { getDocument } from "@/server/services/documents";
import { fail, handle, ok } from "@/server/http/responses";
import { env } from "@/lib/env";

export const runtime = "nodejs";

const secret = new TextEncoder().encode(env.AUTH_SECRET);

/**
 * GET /api/realtime/token?doc=<id>
 *
 * Issues a short-lived (2 min) JWT the browser uses to authenticate to the
 * WebSocket relay. The user's role on the document is baked in and signed, so
 * the relay can enforce "viewers are read-only" without a database round-trip.
 * getDocument throws NotFound (→ 404) if the caller is not a member.
 */
export function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const docId = req.nextUrl.searchParams.get("doc");
    if (!docId) return fail(400, "bad_request", "Missing doc parameter");

    const doc = await getDocument(user.id, docId); // 404 if not a member

    const token = await new SignJWT({
      userId: user.id,
      name: user.name || user.email,
      docId,
      role: doc.role,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      // Long enough to cover an editing session (WebSocket reconnects reuse the
      // same token). Persistence stays gated by the HTTP API + RLS, so even a
      // stale role here can never write to the database.
      .setExpirationTime("8h")
      .sign(secret);

    return ok({ token });
  });
}
