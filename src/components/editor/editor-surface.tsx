"use client";

import { useEffect } from "react";
import { EditorContent, useEditor, type Editor as TiptapEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import Placeholder from "@tiptap/extension-placeholder";
import { yCursorPlugin, yCursorPluginKey } from "y-prosemirror";
import type * as Y from "yjs";
import type { WebsocketProvider } from "y-websocket";
import { Toolbar } from "./toolbar";

/**
 * Build a remote-caret element matching the TipTap CollaborationCursor DOM so
 * the existing `.collaboration-cursor__*` styles apply unchanged.
 */
function cursorBuilder(cursorUser: { name?: string; color?: string }): HTMLElement {
  const color = cursorUser.color ?? "#888";
  const caret = document.createElement("span");
  caret.classList.add("collaboration-cursor__caret");
  caret.setAttribute("style", `border-color: ${color}`);
  const label = document.createElement("div");
  label.classList.add("collaboration-cursor__label");
  label.setAttribute("style", `background-color: ${color}`);
  label.insertBefore(document.createTextNode(cursorUser.name ?? "Anonymous"), null);
  caret.insertBefore(label, null);
  return caret;
}

/**
 * The ProseMirror/TipTap editing surface, bound to the shared Y.Doc.
 *
 * - `history: false` on StarterKit: Yjs owns undo/redo (its own history), so
 *   the ProseMirror history plugin must be disabled to avoid double-tracking.
 * - `field: "prosemirror"`: the Y.XmlFragment name MUST match the server
 *   (versions/seed use `getXmlFragment("prosemirror")`), or restore/diff break.
 * - Live remote carets are attached via `yCursorPlugin` in an effect WHEN the
 *   WebSocket provider arrives (async), so the editor is created ONCE (keyed on
 *   `ydoc`) and never rebuilt — the user's caret/selection is never dropped.
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
    // Keyed on ydoc ONLY — the editor is never rebuilt when the realtime
    // provider connects (that would drop the user's caret mid-typing).
    [ydoc]
  );

  useEffect(() => {
    onEditor(editor);
    return () => onEditor(null);
  }, [editor, onEditor]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  // Attach live remote carets when (and only when) the realtime provider
  // connects — without recreating the editor. Cleaned up if the provider goes
  // away or the editor unmounts.
  useEffect(() => {
    if (!editor || editor.isDestroyed || !provider) return;
    provider.awareness.setLocalStateField("user", {
      name: user.name,
      color: user.color,
    });
    editor.registerPlugin(yCursorPlugin(provider.awareness, { cursorBuilder }));
    return () => {
      if (!editor.isDestroyed) editor.unregisterPlugin(yCursorPluginKey);
    };
  }, [editor, provider, user.name, user.color]);

  return (
    <div className="space-y-3">
      {editable && editor && <Toolbar editor={editor} />}
      <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] px-6 py-5 sm:px-10 sm:py-8">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
