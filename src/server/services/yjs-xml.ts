import * as Y from "yjs";

/**
 * Deep-clone a Yjs XML node (as produced by y-prosemirror) into a detached
 * copy that can be inserted into another document. Used by version restore to
 * rebuild a past document state as fresh CRDT operations.
 */
export function cloneXmlNode(
  node: Y.XmlElement | Y.XmlText
): Y.XmlElement | Y.XmlText {
  if (node instanceof Y.XmlText) {
    const text = new Y.XmlText();
    // toDelta() captures text + formatting attributes faithfully.
    text.applyDelta(node.toDelta());
    return text;
  }
  // XmlElement (y-prosemirror only ever produces XmlElement/XmlText).
  const el = new Y.XmlElement(node.nodeName);
  for (const [key, value] of Object.entries(node.getAttributes())) {
    if (typeof value === "string") el.setAttribute(key, value);
  }
  const children = node
    .toArray()
    .map((child) => cloneXmlNode(child as Y.XmlElement | Y.XmlText));
  if (children.length) el.insert(0, children);
  return el;
}

/**
 * Extract plain text from a y-prosemirror XML fragment, for AI features,
 * previews, and diffing. Block elements are separated by newlines.
 */
export function fragmentToText(fragment: Y.XmlFragment): string {
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (node instanceof Y.XmlText) {
      parts.push(node.toString());
    } else if (node instanceof Y.XmlElement) {
      const isBlock = /^(paragraph|heading|blockquote|listItem|codeBlock)$/.test(
        node.nodeName
      );
      node.toArray().forEach(walk);
      if (isBlock) parts.push("\n");
    }
  };
  fragment.toArray().forEach(walk);
  return parts.join("").replace(/\n{3,}/g, "\n\n").trim();
}
