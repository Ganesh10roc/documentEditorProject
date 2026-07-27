import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/session";
import {
  deleteDocument,
  getDocument,
  renameDocument,
} from "@/server/services/documents";
import { renameDocumentSchema } from "@/server/validation/documents";
import { handle, ok } from "@/server/http/responses";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** GET /api/documents/:id — document metadata + the caller's role. */
export function GET(_req: NextRequest, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const doc = await getDocument(user.id, id);
    return ok({ document: doc });
  });
}

/** PATCH /api/documents/:id — rename (owner/editor only). */
export function PATCH(req: NextRequest, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const { title } = renameDocumentSchema.parse(await req.json());
    await renameDocument(user.id, id, title);
    return ok({ ok: true });
  });
}

/** DELETE /api/documents/:id — delete (owner only). */
export function DELETE(_req: NextRequest, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    await deleteDocument(user.id, id);
    return ok({ ok: true });
  });
}
