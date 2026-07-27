"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  History,
  Loader2,
  RotateCcw,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { streamAI } from "@/client/ai/stream";
import { timeAgo } from "@/lib/utils";

interface Version {
  id: string;
  label: string;
  note: string | null;
  createdAt: string;
  preview: string;
}

export function HistoryPanel({
  documentId,
  editable,
  editor,
  onClose,
  onRestored,
}: {
  documentId: string;
  editable: boolean;
  editor: Editor | null;
  onClose: () => void;
  onRestored: () => void;
}) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [explainId, setExplainId] = useState<string | null>(null);
  const [explanation, setExplanation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const explainAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      explainAbortRef.current?.abort();
    };
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/versions`);
      if (!res.ok) throw new Error();
      const { data } = await res.json();
      setVersions(data.versions);
    } catch {
      // Never leave the panel stuck on a spinner — surface a retry instead.
      setError("Couldn't load version history. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  async function capture(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/versions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label }),
      });
      if (!res.ok) throw new Error();
      setLabel("");
      await load();
    } catch {
      setError("Couldn't capture this version. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function restore(versionId: string) {
    setRestoringId(versionId);
    try {
      const res = await fetch(
        `/api/documents/${documentId}/versions/restore`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ snapshotId: versionId }),
        }
      );
      if (res.ok) onRestored(); // pull the restore update into the live doc
    } finally {
      setRestoringId(null);
    }
  }

  async function explain(versionId: string) {
    // Cancel any previous explain (switching versions / closing the panel).
    explainAbortRef.current?.abort();
    const ac = new AbortController();
    explainAbortRef.current = ac;
    setExplainId(versionId);
    setExplanation("");
    try {
      const res = await fetch(
        `/api/documents/${documentId}/versions/${versionId}`,
        { signal: ac.signal }
      );
      if (!res.ok) throw new Error();
      const { data } = await res.json();
      const before = data.text as string;
      const after = editor?.getText() ?? "";
      await streamAI("explain-diff", { before, after }, setExplanation, ac.signal);
    } catch (e) {
      // Aborted requests are intentional — don't surface them as errors.
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (mountedRef.current) setExplanation("Could not explain the changes.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Version history"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg inline-flex items-center gap-2">
            <History size={18} /> Version history
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X size={18} />
          </Button>
        </div>

        {editable && (
          <form onSubmit={capture} className="flex gap-2 mb-4">
            <Input
              placeholder="Name this version (e.g. First draft)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" size="sm" disabled={busy || !label.trim()}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Capture
            </Button>
          </form>
        )}

        {loading ? (
          <div className="py-8 grid place-items-center text-[var(--text-muted)]">
            <Loader2 className="animate-spin" />
          </div>
        ) : error ? (
          <div className="py-8 text-center">
            <p className="text-sm text-[var(--danger)] mb-3" role="alert">
              {error}
            </p>
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              <RotateCcw size={13} /> Try again
            </Button>
          </div>
        ) : versions.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] py-8 text-center">
            No versions captured yet. Capture a snapshot to start your timeline.
          </p>
        ) : (
          <ol className="space-y-3 overflow-auto pr-1">
            {versions.map((v, i) => (
              <li
                key={v.id}
                className="relative pl-6 border-l-2 border-[var(--border)]"
              >
                <span
                  className="absolute -left-[7px] top-1 h-3 w-3 rounded-full border-2 border-[var(--surface)]"
                  style={{ background: i === 0 ? "var(--accent)" : "var(--text-muted)" }}
                  aria-hidden
                />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{v.label}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {timeAgo(v.createdAt)}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => explain(v.id)}
                      title="Explain what changed vs the current document"
                    >
                      <Sparkles size={13} /> Explain
                    </Button>
                    {editable && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => restore(v.id)}
                        disabled={restoringId === v.id}
                        title="Restore this version"
                      >
                        {restoringId === v.id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <RotateCcw size={13} />
                        )}
                        Restore
                      </Button>
                    )}
                  </div>
                </div>
                {v.preview && (
                  <p className="mt-1 text-xs text-[var(--text-muted)] line-clamp-2">
                    {v.preview}
                  </p>
                )}
                {explainId === v.id && explanation && (
                  <div className="mt-2 text-xs whitespace-pre-wrap bg-[var(--surface-2)] rounded-lg p-2">
                    {explanation}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
