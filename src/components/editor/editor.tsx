"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { Editor as TiptapEditor } from "@tiptap/react";
import {
  ArrowLeft,
  History,
  Loader2,
  Share2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectionStatusBadge } from "@/components/ui/connection-status";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EditorSurface } from "./editor-surface";
import { PresenceBar } from "./presence-bar";
import { useCollaborativeDoc } from "@/client/hooks/useCollaborativeDoc";
import { canEdit, isOwner, type Role } from "@/lib/constants";
import { colorFromString } from "@/lib/utils";

// Panels/dialogs are only rendered on demand — code-split them so their JS
// (and TipTap-adjacent weight) loads on first open, not on the editor route.
const AiPanel = dynamic(() => import("./ai-panel").then((m) => m.AiPanel), {
  ssr: false,
});
const ShareDialog = dynamic(
  () => import("./share-dialog").then((m) => m.ShareDialog),
  { ssr: false }
);
const HistoryPanel = dynamic(
  () => import("./history-panel").then((m) => m.HistoryPanel),
  { ssr: false }
);

export function Editor({
  documentId,
  initialTitle,
  role,
  currentUserId,
  currentUserName,
}: {
  documentId: string;
  initialTitle: string;
  role: Role;
  currentUserId: string;
  currentUserName: string;
}) {
  const router = useRouter();
  const user = useMemo(
    () => ({
      name: currentUserName || "Anonymous",
      color: colorFromString(currentUserId),
    }),
    [currentUserName, currentUserId]
  );
  const { ydoc, engine, provider, ready, status, pending } =
    useCollaborativeDoc(documentId, role, user);
  const editable = canEdit(role);

  const [editor, setEditor] = useState<TiptapEditor | null>(null);
  const [title, setTitle] = useState(initialTitle);
  const [showAi, setShowAi] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function deleteDocument() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.push("/documents");
        router.refresh();
      } else {
        setDeleting(false);
        setShowDelete(false);
      }
    } catch {
      setDeleting(false);
      setShowDelete(false);
    }
  }

  // Persist the title (document metadata, not CRDT) on a debounce.
  const saveTitle = useCallback(
    (next: string) => {
      if (titleTimer.current) clearTimeout(titleTimer.current);
      titleTimer.current = setTimeout(() => {
        void fetch(`/api/documents/${documentId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: next.trim() || "Untitled document" }),
        });
      }, 600);
    },
    [documentId]
  );

  useEffect(() => {
    return () => {
      if (titleTimer.current) clearTimeout(titleTimer.current);
    };
  }, []);

  const onEditor = useCallback((e: TiptapEditor | null) => setEditor(e), []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Link
          href="/documents"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          <ArrowLeft size={16} /> Documents
        </Link>
        <div className="flex-1 min-w-[200px]">
          <input
            value={title}
            disabled={!editable}
            onChange={(e) => {
              setTitle(e.target.value);
              saveTitle(e.target.value);
            }}
            aria-label="Document title"
            className="w-full bg-transparent font-serif text-2xl font-bold tracking-tight outline-none disabled:opacity-100"
            placeholder="Untitled document"
          />
        </div>
        <PresenceBar
          provider={provider}
          selfClientId={provider?.awareness.clientID}
        />
        <ConnectionStatusBadge status={status} pending={pending} />
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowHistory(true)}
            aria-label="Version history"
          >
            <History size={16} /> History
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowShare(true)}
            aria-label="Share"
          >
            <Share2 size={16} /> Share
          </Button>
          <Button
            variant={showAi ? "primary" : "secondary"}
            size="sm"
            onClick={() => setShowAi((v) => !v)}
            aria-label="AI assistant"
          >
            <Sparkles size={16} /> AI
          </Button>
          {isOwner(role) && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowDelete(true)}
              aria-label="Delete document"
              title="Delete document"
            >
              <Trash2 size={16} className="text-[var(--danger)]" />
            </Button>
          )}
        </div>
      </div>

      {/* Editor + AI panel */}
      <div className="flex flex-col sm:flex-row gap-5">
        <div className="flex-1 min-w-0">
          {ydoc && ready ? (
            <EditorSurface
              ydoc={ydoc}
              provider={provider}
              user={user}
              editable={editable}
              onEditor={onEditor}
            />
          ) : (
            <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] px-10 py-16 grid place-items-center text-[var(--text-muted)]">
              <div className="inline-flex items-center gap-2">
                <Loader2 className="animate-spin" size={18} /> Loading your document…
              </div>
            </div>
          )}
        </div>
        {showAi && (
          <AiPanel
            editor={editor}
            editable={editable}
            onClose={() => setShowAi(false)}
            onApplyTitle={(t) => {
              setTitle(t);
              saveTitle(t);
            }}
          />
        )}
      </div>

      {showShare && (
        <ShareDialog
          documentId={documentId}
          callerRole={role}
          currentUserId={currentUserId}
          onClose={() => setShowShare(false)}
        />
      )}
      {showHistory && (
        <HistoryPanel
          documentId={documentId}
          editable={editable}
          editor={editor}
          onClose={() => setShowHistory(false)}
          onRestored={() => {
            void engine?.sync();
          }}
        />
      )}
      {showDelete && (
        <ConfirmDialog
          title="Delete this document?"
          description="This permanently deletes the document, its history, and all collaborators' access. This cannot be undone."
          confirmLabel="Delete document"
          loading={deleting}
          onConfirm={deleteDocument}
          onCancel={() => setShowDelete(false)}
        />
      )}
    </div>
  );
}
