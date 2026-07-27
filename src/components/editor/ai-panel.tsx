"use client";

import { useState } from "react";
import type { Editor } from "@tiptap/react";
import { Loader2, Sparkles, Type, WandSparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { streamAI, suggestTitles } from "@/client/ai/stream";

type Tab = "summary" | "title" | "rewrite";

export function AiPanel({
  editor,
  editable,
  onClose,
  onApplyTitle,
}: {
  editor: Editor | null;
  editable: boolean;
  onClose: () => void;
  onApplyTitle: (title: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("summary");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState("");
  const [titles, setTitles] = useState<string[]>([]);
  const [instruction, setInstruction] = useState("");

  function docText() {
    return editor?.getText() ?? "";
  }

  function selectionText() {
    if (!editor) return "";
    const { from, to } = editor.state.selection;
    return editor.state.doc.textBetween(from, to, " ");
  }

  async function runSummary() {
    setError(null);
    setOutput("");
    setLoading(true);
    try {
      await streamAI("summarize", { text: docText() }, setOutput);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function runTitles() {
    setError(null);
    setTitles([]);
    setLoading(true);
    try {
      setTitles(await suggestTitles(docText()));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function runRewrite() {
    const passage = selectionText();
    if (!passage.trim()) {
      setError("Select some text in the document first.");
      return;
    }
    setError(null);
    setOutput("");
    setLoading(true);
    try {
      await streamAI("rewrite", { passage, instruction }, setOutput);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function replaceSelection() {
    if (!editor || !output) return;
    editor.chain().focus().insertContent(output).run();
  }

  const TABS: { key: Tab; label: string; Icon: typeof Sparkles }[] = [
    { key: "summary", label: "Summary", Icon: Sparkles },
    { key: "title", label: "Titles", Icon: Type },
    { key: "rewrite", label: "Rewrite", Icon: WandSparkles },
  ];

  return (
    <aside className="w-full sm:w-80 shrink-0 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 flex flex-col gap-3 h-fit sticky top-20">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold inline-flex items-center gap-2">
          <Sparkles size={16} className="text-[var(--accent)]" /> AI assistant
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close AI panel">
          <X size={16} />
        </Button>
      </div>

      <div className="flex gap-1 rounded-lg bg-[var(--surface-2)] p-1">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => {
              setTab(key);
              setError(null);
            }}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors ${
              tab === key
                ? "bg-[var(--surface)] text-[var(--text)] shadow-sm"
                : "text-[var(--text-muted)]"
            }`}
          >
            <Icon size={13} aria-hidden /> {label}
          </button>
        ))}
      </div>

      {tab === "summary" && (
        <>
          <Button size="sm" onClick={runSummary} disabled={loading}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            Summarise document
          </Button>
          {output && (
            <div className="text-sm whitespace-pre-wrap text-[var(--text)] bg-[var(--surface-2)] rounded-lg p-3 max-h-72 overflow-auto">
              {output}
            </div>
          )}
        </>
      )}

      {tab === "title" && (
        <>
          <Button size="sm" onClick={runTitles} disabled={loading}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Type size={14} />}
            Suggest titles
          </Button>
          <ul className="space-y-1.5">
            {titles.map((t) => (
              <li key={t}>
                <button
                  disabled={!editable}
                  onClick={() => onApplyTitle(t)}
                  className="w-full text-left text-sm rounded-lg border border-[var(--border)] px-3 py-2 hover:border-[var(--accent)] transition-colors disabled:opacity-50"
                >
                  {t}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {tab === "rewrite" && (
        <>
          <p className="text-xs text-[var(--text-muted)]">
            Select text in the document, describe the change, and rewrite it.
          </p>
          <Input
            placeholder="e.g. make it more concise"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
          />
          <Button size="sm" onClick={runRewrite} disabled={loading || !editable}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <WandSparkles size={14} />}
            Rewrite selection
          </Button>
          {output && (
            <>
              <div className="text-sm whitespace-pre-wrap bg-[var(--surface-2)] rounded-lg p-3 max-h-56 overflow-auto">
                {output}
              </div>
              <Button size="sm" variant="secondary" onClick={replaceSelection} disabled={!editable}>
                Replace selection
              </Button>
            </>
          )}
        </>
      )}

      {error && (
        <p className="text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
    </aside>
  );
}
