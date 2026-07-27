"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

/** Documents shown per page. */
const PAGE_SIZE = 9;

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
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  // Case-insensitive title search over the loaded documents.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? docs.filter((d) => d.title.toLowerCase().includes(q)) : docs;
  }, [docs, query]);

  // Pagination derived from the filtered set. `currentPage` is clamped so the
  // view stays valid after a search narrows results or a delete shrinks a page.
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  function onSearch(value: string) {
    setQuery(value);
    setPage(1); // any new query starts from the first page
  }

  async function deleteDocument(id: string) {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setPendingDelete(null);
        setError("Couldn't delete the document. Please try again.");
        return;
      }
      setDocs((prev) => prev.filter((d) => d.id !== id));
      setPendingDelete(null);
      router.refresh();
    } catch {
      setPendingDelete(null);
      setError("You appear to be offline. Please try again when connected.");
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
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight">
            Your documents
          </h1>
          <p className="text-[var(--text-muted)] mt-1">
            {filtered.length} document{filtered.length === 1 ? "" : "s"}
            {query ? ` matching “${query}”` : ""}
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

      {/* Search — only shown once there's something to search through. */}
      {docs.length > 0 && (
        <div className="relative mb-6 max-w-md">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
            aria-hidden
          />
          <Input
            type="search"
            placeholder="Search documents by title…"
            value={query}
            onChange={(e) => onSearch(e.target.value)}
            className="pl-9"
            aria-label="Search documents"
          />
        </div>
      )}

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
      ) : filtered.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--border)] py-16 text-center">
          <Search
            size={36}
            className="mx-auto text-[var(--text-muted)] mb-4"
            aria-hidden
          />
          <p className="font-medium">No documents match “{query}”</p>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Try a different search term.
          </p>
          <Button
            variant="secondary"
            className="mt-5"
            onClick={() => onSearch("")}
          >
            Clear search
          </Button>
        </div>
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pageItems.map((doc) => (
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
                    {/* Relative time is computed from Date.now(), which differs by
                        a beat between SSR and hydration — suppress that warning. */}
                    <span suppressHydrationWarning>
                      Edited {timeAgo(doc.updatedAt)}
                    </span>
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

          {totalPages > 1 && (
            <nav
              className="mt-8 flex items-center justify-center gap-3"
              aria-label="Documents pagination"
            >
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage <= 1}
                aria-label="Previous page"
              >
                <ChevronLeft size={16} /> Prev
              </Button>
              <span className="text-sm text-[var(--text-muted)]" aria-live="polite">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                aria-label="Next page"
              >
                Next <ChevronRight size={16} />
              </Button>
            </nav>
          )}
        </>
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
