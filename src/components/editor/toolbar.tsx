"use client";

import type { Editor } from "@tiptap/react";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Item {
  Icon: typeof Bold;
  label: string;
  isActive: (e: Editor) => boolean;
  run: (e: Editor) => void;
}

const ITEMS: Item[] = [
  { Icon: Bold, label: "Bold", isActive: (e) => e.isActive("bold"), run: (e) => e.chain().focus().toggleBold().run() },
  { Icon: Italic, label: "Italic", isActive: (e) => e.isActive("italic"), run: (e) => e.chain().focus().toggleItalic().run() },
  { Icon: Strikethrough, label: "Strikethrough", isActive: (e) => e.isActive("strike"), run: (e) => e.chain().focus().toggleStrike().run() },
  { Icon: Heading1, label: "Heading 1", isActive: (e) => e.isActive("heading", { level: 1 }), run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { Icon: Heading2, label: "Heading 2", isActive: (e) => e.isActive("heading", { level: 2 }), run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { Icon: List, label: "Bullet list", isActive: (e) => e.isActive("bulletList"), run: (e) => e.chain().focus().toggleBulletList().run() },
  { Icon: ListOrdered, label: "Numbered list", isActive: (e) => e.isActive("orderedList"), run: (e) => e.chain().focus().toggleOrderedList().run() },
  { Icon: Quote, label: "Quote", isActive: (e) => e.isActive("blockquote"), run: (e) => e.chain().focus().toggleBlockquote().run() },
  { Icon: Code, label: "Code block", isActive: (e) => e.isActive("codeBlock"), run: (e) => e.chain().focus().toggleCodeBlock().run() },
];

export function Toolbar({ editor }: { editor: Editor }) {
  return (
    <div
      className="flex flex-wrap items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1"
      role="toolbar"
      aria-label="Text formatting"
    >
      {ITEMS.map(({ Icon, label, isActive, run }) => {
        const active = isActive(editor);
        return (
          <button
            key={label}
            type="button"
            onClick={() => run(editor)}
            aria-label={label}
            aria-pressed={active}
            title={label}
            className={cn(
              "h-8 w-8 grid place-items-center rounded-md transition-colors",
              active
                ? "bg-[var(--accent)] text-[var(--accent-contrast)]"
                : "hover:bg-[var(--surface-2)] text-[var(--text)]"
            )}
          >
            <Icon size={16} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
