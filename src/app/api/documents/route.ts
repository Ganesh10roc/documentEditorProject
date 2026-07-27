import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/session";
import { createDocument, listDocuments } from "@/server/services/documents";
import { createDocumentSchema } from "@/server/validation/documents";
import { handle, ok } from "@/server/http/responses";

export const runtime = "nodejs";

/** GET /api/documents — all documents visible to the user. */
export function GET() {
  return handle(async () => {
    const user = await requireUser();
    const docs = await listDocuments(user.id);
    return ok({ documents: docs });
  });
}

/** POST /api/documents — create a new document owned by the user. */
export function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const body = createDocumentSchema.parse(await req.json().catch(() => ({})));
    const doc = await createDocument(user.id, body.title);
    return ok({ document: doc }, { status: 201 });
  });
}
