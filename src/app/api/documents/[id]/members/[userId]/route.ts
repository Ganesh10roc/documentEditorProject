import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { removeMember, updateMemberRole } from "@/server/services/members";
import { handle, ok } from "@/server/http/responses";
import { requireUuid } from "@/server/http/params";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; userId: string }> };

// Only editor/viewer are grantable here — matching addMemberSchema. Ownership
// is not transferable via this generic endpoint (prevents accidental co-owners).
const bodySchema = z.object({ role: z.enum(["editor", "viewer"]) });

/** PATCH /api/documents/:id/members/:userId — change role (owner only). */
export function PATCH(req: NextRequest, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id: rawId, userId: rawUserId } = await params;
    const id = requireUuid(rawId);
    const userId = requireUuid(rawUserId);
    const { role } = bodySchema.parse(await req.json());
    await updateMemberRole(user.id, id, userId, role);
    return ok({ ok: true });
  });
}

/** DELETE /api/documents/:id/members/:userId — revoke access (owner only). */
export function DELETE(_req: NextRequest, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id: rawId, userId: rawUserId } = await params;
    const id = requireUuid(rawId);
    const userId = requireUuid(rawUserId);
    await removeMember(user.id, id, userId);
    return ok({ ok: true });
  });
}
