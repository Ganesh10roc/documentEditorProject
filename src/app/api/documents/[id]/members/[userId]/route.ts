import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { removeMember, updateMemberRole } from "@/server/services/members";
import { ROLES } from "@/lib/constants";
import { handle, ok } from "@/server/http/responses";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; userId: string }> };

const bodySchema = z.object({ role: z.enum(ROLES) });

/** PATCH /api/documents/:id/members/:userId — change role (owner only). */
export function PATCH(req: NextRequest, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id, userId } = await params;
    const { role } = bodySchema.parse(await req.json());
    await updateMemberRole(user.id, id, userId, role);
    return ok({ ok: true });
  });
}

/** DELETE /api/documents/:id/members/:userId — revoke access (owner only). */
export function DELETE(_req: NextRequest, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id, userId } = await params;
    await removeMember(user.id, id, userId);
    return ok({ ok: true });
  });
}
