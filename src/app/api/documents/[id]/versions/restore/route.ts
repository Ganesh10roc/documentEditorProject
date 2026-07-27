import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/session";
import { restoreSnapshot } from "@/server/services/versions";
import { restoreSnapshotSchema } from "@/server/validation/documents";
import { handle, ok } from "@/server/http/responses";
import { requireUuid } from "@/server/http/params";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/documents/:id/versions/restore — restore a snapshot by appending
 * it as new CRDT operations (owner/editor). Collaborators converge on the
 * restored content; no state is reset. Returns the new high-water seq so the
 * caller can immediately pull the restore update.
 */
export function POST(req: NextRequest, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id: rawId } = await params;
    const id = requireUuid(rawId);
    const { snapshotId } = restoreSnapshotSchema.parse(await req.json());
    const result = await restoreSnapshot(user.id, id, snapshotId);
    return ok(result);
  });
}
