import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { listDocuments } from "@/server/services/documents";
import { DocumentsClient } from "@/components/documents/documents-client";

export const metadata: Metadata = { title: "Your documents" };

// This page reads per-user data — always render dynamically.
export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const user = await requireUser();
  const documents = await listDocuments(user.id);

  // Serialise dates for the client component.
  const serialised = documents.map((d) => ({
    ...d,
    updatedAt: d.updatedAt.toISOString(),
  }));

  return <DocumentsClient initialDocuments={serialised} />;
}
