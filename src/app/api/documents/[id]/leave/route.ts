import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/session";
import { leaveDocument } from "@/server/services/members";
import { handle, ok } from "@/server/http/responses";
import { requireUuid } from "@/server/http/params";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** POST /api/documents/:id/leave — a non-owner removes their own access. */
export function POST(_req: NextRequest, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id: rawId } = await params;
    const id = requireUuid(rawId);
    await leaveDocument(user.id, id);
    return ok({ ok: true });
  });
}
