import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/session";
import { getSnapshotText } from "@/server/services/versions";
import { handle, ok } from "@/server/http/responses";
import { requireUuid } from "@/server/http/params";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; versionId: string }> };

/** GET /api/documents/:id/versions/:versionId — full snapshot text. */
export function GET(_req: NextRequest, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id: rawId, versionId: rawVersionId } = await params;
    const id = requireUuid(rawId);
    const versionId = requireUuid(rawVersionId);
    const text = await getSnapshotText(user.id, id, versionId);
    return ok({ text });
  });
}
