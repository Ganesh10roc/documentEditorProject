import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/session";
import { removeInvite } from "@/server/services/invites";
import { handle, ok } from "@/server/http/responses";
import { requireUuid } from "@/server/http/params";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; inviteId: string }> };

/** DELETE /api/documents/:id/invites/:inviteId — revoke a pending invite (owner). */
export function DELETE(_req: NextRequest, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id: rawId, inviteId: rawInviteId } = await params;
    const id = requireUuid(rawId);
    const inviteId = requireUuid(rawInviteId);
    await removeInvite(user.id, id, inviteId);
    return ok({ ok: true });
  });
}
