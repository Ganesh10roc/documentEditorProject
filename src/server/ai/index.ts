import { anthropic } from "@ai-sdk/anthropic";
import { generateText, streamText } from "ai";
import { env, aiEnabled } from "@/lib/env";

/**
 * AI add-on features, powered by Claude via the Vercel AI SDK. Every function
 * degrades gracefully: if no ANTHROPIC_API_KEY is configured, callers should
 * check `aiEnabled` first — the route handlers return 503 when it is unset.
 *
 * Model choice: claude-opus-4-8 — the most capable current model, well suited
 * to the nuanced editorial judgement these features require.
 */
const MODEL = "claude-opus-4-8";

/** Guard used by route handlers before invoking any AI feature. */
export { aiEnabled };

function client() {
  // The provider reads ANTHROPIC_API_KEY from the environment; we pass it
  // explicitly so the validated `env` is the single source of truth.
  return anthropic(MODEL);
}

/** Cap input length so a huge document can't blow the token budget/cost. */
const MAX_INPUT_CHARS = 24_000;
function clamp(text: string): string {
  return text.length > MAX_INPUT_CHARS
    ? text.slice(0, MAX_INPUT_CHARS) + "\n\n[…truncated…]"
    : text;
}

/** A concise, structured summary of the document. Streamed to the client. */
export function summarizeStream(text: string) {
  return streamText({
    model: client(),
    system:
      "You are an expert editor. Summarise the user's document in 3–5 tight bullet points, " +
      "capturing the key claims and structure. Do not add information that is not present.",
    prompt: clamp(text),
    maxTokens: 500,
  });
}

/** Rewrite a passage in a requested style. Streamed. */
export function rewriteStream(passage: string, instruction: string) {
  return streamText({
    model: client(),
    system:
      "You are a precise copy-editor. Rewrite the passage following the instruction. " +
      "Return ONLY the rewritten passage — no preamble, no quotation marks, no commentary.",
    prompt: `Instruction: ${instruction}\n\nPassage:\n${clamp(passage)}`,
    maxTokens: 1500,
  });
}

/** Suggest 3 concise, distinct titles for the document. Non-streamed. */
export async function suggestTitles(text: string): Promise<string[]> {
  const { text: out } = await generateText({
    model: client(),
    system:
      "Suggest exactly 3 concise, distinct document titles (max 8 words each). " +
      "Return them as a plain newline-separated list with no numbering or punctuation.",
    prompt: clamp(text),
    maxTokens: 120,
  });
  return out
    .split("\n")
    .map((l) => l.replace(/^[\s\-*\d.]+/, "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

/**
 * Explain in plain language what changed between two versions of a document.
 * Powers the "Explain this version" feature in the history timeline.
 */
export function explainDiffStream(before: string, after: string) {
  return streamText({
    model: client(),
    system:
      "You compare two versions of a document and explain what changed, in 2–4 short " +
      "bullet points. Focus on substantive edits (added/removed/reworded ideas), not whitespace. " +
      "If nothing meaningful changed, say so.",
    prompt: `--- PREVIOUS VERSION ---\n${clamp(before)}\n\n--- CURRENT VERSION ---\n${clamp(after)}`,
    maxTokens: 400,
  });
}
