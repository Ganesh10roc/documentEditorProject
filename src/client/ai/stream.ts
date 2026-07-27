/**
 * Consume a streamed AI response from /api/ai/:action, invoking `onChunk` for
 * each decoded piece of text as it arrives. Returns the full text.
 */
export async function streamAI(
  action: "summarize" | "rewrite" | "explain-diff",
  body: Record<string, unknown>,
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch(`/api/ai/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    if (res.status === 503) throw new Error("AI features are not configured.");
    if (res.status === 429) throw new Error("Too many AI requests — slow down.");
    throw new Error("AI request failed.");
  }
  if (!res.body) throw new Error("No response stream.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    full += decoder.decode(value, { stream: true });
    onChunk(full);
  }
  return full;
}

/** Non-streamed title suggestions. */
export async function suggestTitles(
  text: string,
  signal?: AbortSignal
): Promise<string[]> {
  const res = await fetch("/api/ai/title", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!res.ok) {
    if (res.status === 503) throw new Error("AI features are not configured.");
    if (res.status === 429) throw new Error("Too many AI requests — slow down.");
    throw new Error("Could not suggest titles.");
  }
  const { data } = await res.json();
  return data.titles as string[];
}
