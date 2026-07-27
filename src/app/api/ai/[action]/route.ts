import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import {
  aiEnabled,
  explainDiffStream,
  rewriteStream,
  suggestTitles,
  summarizeStream,
} from "@/server/ai";
import { fail, handle, ok } from "@/server/http/responses";
import { rateLimit } from "@/server/http/rate-limit";

export const runtime = "nodejs";
// AI responses can take a while to stream; allow up to 60s on Vercel.
export const maxDuration = 60;

type Params = { params: Promise<{ action: string }> };

const textSchema = z.object({ text: z.string().min(1).max(50_000) });
const rewriteSchema = z.object({
  passage: z.string().min(1).max(20_000),
  instruction: z.string().min(1).max(500),
});
const diffSchema = z.object({
  before: z.string().max(50_000),
  after: z.string().max(50_000),
});

export function POST(req: NextRequest, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    if (!aiEnabled) {
      return fail(503, "ai_unavailable", "AI features are not configured");
    }
    // AI calls are expensive — throttle per user.
    const rl = rateLimit(`ai:${user.id}`, 20, 60_000);
    if (!rl.allowed) return fail(429, "rate_limited", "Too many AI requests");

    const { action } = await params;
    const body = await req.json().catch(() => ({}));

    switch (action) {
      case "summarize": {
        const { text } = textSchema.parse(body);
        return summarizeStream(text).toTextStreamResponse();
      }
      case "rewrite": {
        const { passage, instruction } = rewriteSchema.parse(body);
        return rewriteStream(passage, instruction).toTextStreamResponse();
      }
      case "explain-diff": {
        const { before, after } = diffSchema.parse(body);
        return explainDiffStream(before, after).toTextStreamResponse();
      }
      case "title": {
        const { text } = textSchema.parse(body);
        const titles = await suggestTitles(text);
        return ok({ titles });
      }
      default:
        return fail(404, "unknown_action", `Unknown AI action: ${action}`);
    }
  });
}
