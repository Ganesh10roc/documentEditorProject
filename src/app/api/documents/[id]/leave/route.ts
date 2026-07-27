import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/session";
import { leaveDocument } from "@/server/services/members";
import { handle, ok } from "@/server/http/responses";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** POST /api/documents/:id/leave — a non-owner removes their own access. */
export function POST(_req: NextRequest, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    await leaveDocument(user.id, id);
    return ok({ ok: true });
  });
}
