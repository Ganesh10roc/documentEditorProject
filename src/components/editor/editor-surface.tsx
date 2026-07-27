"use client";

import { useEffect } from "react";
import { EditorContent, useEditor, type Editor as TiptapEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import Placeholder from "@tiptap/extension-placeholder";
import type * as Y from "yjs";
import type { WebsocketProvider } from "y-websocket";
import { Toolbar } from "./toolbar";

/**
 * The ProseMirror/TipTap editing surface, bound to the shared Y.Doc.
 *
 * - `history: false` on StarterKit: Yjs owns undo/redo (its own history), so
 *   the ProseMirror history plugin must be disabled to avoid double-tracking.
 * - `field: "prosemirror"`: the Y.XmlFragment name MUST match the server
 *   (versions/seed use `getXmlFragment("prosemirror")`), or restore/diff break.
 * - CollaborationCursor is added only when a WebSocket provider exists, giving
 *   live remote carets/selections. The editor is re-created when the provider
 *   arrives (async) — content persists because Collaboration re-binds to ydoc.
 * - Keystrokes mutate the CRDT locally and instantly; sync happens in the
 *   background — the editor never blocks on the network.
 */
export function EditorSurface({
  ydoc,
  provider,
  user,
  editable,
  onEditor,
}: {
  ydoc: Y.Doc;
  provider: WebsocketProvider | null;
  user: { name: string; color: string };
  editable: boolean;
  onEditor: (editor: TiptapEditor | null) => void;
}) {
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ history: false }),
        Collaboration.configure({ document: ydoc, field: "prosemirror" }),
        ...(provider
          ? [
              CollaborationCursor.configure({
                provider,
                user: { name: user.name, color: user.color },
              }),
            ]
          : []),
        Placeholder.configure({
          placeholder: editable
            ? "Start writing… your words are saved locally as you type."
            : "This document is read-only for you.",
        }),
      ],
      editable,
      immediatelyRender: false, // avoid SSR hydration mismatch in Next.js
      editorProps: {
        attributes: {
          class: "ProseMirror focus:outline-none",
          spellcheck: "true",
          "aria-label": "Document editor",
        },
      },
    },
    [ydoc, provider]
  );

  useEffect(() => {
    onEditor(editor);
    return () => onEditor(null);
  }, [editor, onEditor]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  return (
    <div className="space-y-3">
      {editable && editor && <Toolbar editor={editor} />}
      <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] px-6 py-5 sm:px-10 sm:py-8">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
