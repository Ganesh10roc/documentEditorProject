import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/session";
import { addMember, listMembers } from "@/server/services/members";
import { addMemberSchema } from "@/server/validation/documents";
import { handle, ok } from "@/server/http/responses";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** GET /api/documents/:id/members — collaborators + roles. */
export function GET(_req: NextRequest, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const members = await listMembers(user.id, id);
    return ok({ members });
  });
}

/** POST /api/documents/:id/members — share by email (owner only). */
export function POST(req: NextRequest, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const { email, role } = addMemberSchema.parse(await req.json());
    const member = await addMember(user.id, id, email, role);
    return ok({ member }, { status: 201 });
  });
}
