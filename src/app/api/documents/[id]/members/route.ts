import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/session";
import { addMember, listMembers } from "@/server/services/members";
import { listInvites } from "@/server/services/invites";
import { getDocument } from "@/server/services/documents";
import { addMemberSchema } from "@/server/validation/documents";
import { handle, ok } from "@/server/http/responses";
import { requireUuid } from "@/server/http/params";
import { sendInviteEmail, sendShareNotification } from "@/server/email";
import { emailEnabled } from "@/lib/env";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** GET /api/documents/:id/members — collaborators + roles. */
export function GET(_req: NextRequest, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id: rawId } = await params;
    const id = requireUuid(rawId);
    const members = await listMembers(user.id, id);
    const invites = await listInvites(user.id, id);
    return ok({ members, invites });
  });
}

/** POST /api/documents/:id/members — share by email (owner only). */
export function POST(req: NextRequest, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id: rawId } = await params;
    const id = requireUuid(rawId);
    const { email, role } = addMemberSchema.parse(await req.json());
    const result = await addMember(user.id, id, email, role);

    // Best-effort email. Awaited (serverless drops floating promises after the
    // response) but can never fail the request — the sender swallows errors.
    // Skipped entirely when email isn't configured.
    if (emailEnabled) {
      const doc = await getDocument(user.id, id);
      const inviterName = user.name || user.email;
      if (result.kind === "member") {
        await sendShareNotification({
          to: result.member.email,
          inviterName,
          documentTitle: doc.title,
          documentId: id,
          role: result.member.role,
        });
      } else {
        await sendInviteEmail({
          to: result.email,
          inviterName,
          documentTitle: doc.title,
          role: result.role,
        });
      }
    }

    return ok(result, { status: 201 });
  });
}
