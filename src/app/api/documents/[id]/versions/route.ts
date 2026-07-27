import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/session";
import { createSnapshot, listSnapshots } from "@/server/services/versions";
import { createSnapshotSchema } from "@/server/validation/documents";
import { handle, ok } from "@/server/http/responses";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** GET /api/documents/:id/versions — the version timeline. */
export function GET(_req: NextRequest, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const versions = await listSnapshots(user.id, id);
    return ok({ versions });
  });
}

/** POST /api/documents/:id/versions — capture a snapshot (owner/editor). */
export function POST(req: NextRequest, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const { label, note } = createSnapshotSchema.parse(await req.json());
    const snapshot = await createSnapshot(user.id, id, label, note);
    return ok(
      { snapshot: { id: snapshot.id, label: snapshot.label } },
      { status: 201 }
    );
  });
}
