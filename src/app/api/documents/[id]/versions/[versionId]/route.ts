import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/session";
import { getSnapshotText } from "@/server/services/versions";
import { handle, ok } from "@/server/http/responses";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; versionId: string }> };

/** GET /api/documents/:id/versions/:versionId — full snapshot text. */
export function GET(_req: NextRequest, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id, versionId } = await params;
    const text = await getSnapshotText(user.id, id, versionId);
    return ok({ text });
  });
}
