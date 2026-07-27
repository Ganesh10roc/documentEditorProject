"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, Loader2, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RoleBadge } from "@/components/documents/role-badge";
import { timeAgo } from "@/lib/utils";
import { isOwner, type Role } from "@/lib/constants";

interface DocItem {
  id: string;
  title: string;
  role: Role;
  updatedAt: string;
  ownerName: string;
  memberCount: number;
}

export function DocumentsClient({
  initialDocuments,
}: {
  initialDocuments: DocItem[];
}) {
  const router = useRouter();
  const [docs, setDocs] = useState(initialDocuments);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DocItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function deleteDocument(id: string) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (res.ok) {
        setDocs((prev) => prev.filter((d) => d.id !== id));
        setPendingDelete(null);
        router.refresh();
      }
    } finally {
      setDeleting(false);
    }
  }

  async function createDocument() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Untitled document" }),
      });
      if (!res.ok) {
        setError("Couldn't create the document. Please try again.");
        return;
      }
      const { data } = await res.json();
      router.push(`/documents/${data.document.id}`);
    } catch {
      setError("You appear to be offline. Please try again when connected.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight">
            Your documents
          </h1>
          <p className="text-[var(--text-muted)] mt-1">
            {docs.length} document{docs.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button onClick={createDocument} disabled={creating}>
          {creating ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Plus size={16} />
          )}
          New document
        </Button>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-6 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-2 text-sm text-[var(--danger)]"
        >
          {error}
        </p>
      )}

      {docs.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--border)] py-20 text-center">
          <FileText
            size={40}
            className="mx-auto text-[var(--text-muted)] mb-4"
            aria-hidden
          />
          <p className="font-medium">No documents yet</p>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Create your first document to start writing.
          </p>
          <Button onClick={createDocument} className="mt-5" disabled={creating}>
            <Plus size={16} /> New document
          </Button>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {docs.map((doc) => (
            <li key={doc.id} className="group relative">
              <Link
                href={`/documents/${doc.id}`}
                className="block h-full rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5 hover:border-[var(--accent)] transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <FileText
                    size={20}
                    className="text-[var(--accent)] shrink-0"
                    aria-hidden
                  />
                  <RoleBadge role={doc.role} />
                </div>
                <h2 className="font-semibold leading-snug line-clamp-2 mb-2">
                  {doc.title}
                </h2>
                <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                  <span>Edited {timeAgo(doc.updatedAt)}</span>
                  <span className="inline-flex items-center gap-1">
                    <Users size={12} aria-hidden /> {doc.memberCount}
                  </span>
                </div>
              </Link>
              {isOwner(doc.role) && (
                <button
                  type="button"
                  onClick={() => setPendingDelete(doc)}
                  aria-label={`Delete ${doc.title}`}
                  title="Delete document"
                  className="absolute bottom-4 right-4 grid h-8 w-8 place-items-center rounded-lg text-[var(--text-muted)] opacity-0 transition-all hover:bg-[var(--danger)]/12 hover:text-[var(--danger)] focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this document?"
          description={`"${pendingDelete.title}" and its full history will be permanently deleted for everyone. This cannot be undone.`}
          confirmLabel="Delete document"
          loading={deleting}
          onConfirm={() => deleteDocument(pendingDelete.id)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
