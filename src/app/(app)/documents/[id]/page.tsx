import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { getDocument } from "@/server/services/documents";
import { NotFoundError } from "@/server/services/authz";
import { Editor } from "@/components/editor/editor";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const user = await requireUser();
    const { id } = await params;
    const doc = await getDocument(user.id, id);
    return { title: doc.title };
  } catch {
    return { title: "Document" };
  }
}

export default async function DocumentPage({ params }: Props) {
  const user = await requireUser();
  const { id } = await params;

  let doc;
  try {
    doc = await getDocument(user.id, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  return (
    <Editor
      documentId={doc.id}
      initialTitle={doc.title}
      role={doc.role}
      currentUserId={user.id}
      currentUserName={user.name}
    />
  );
}
