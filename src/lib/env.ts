import { z } from "zod";

/**
 * Validated, typed environment access. Fails fast at boot rather than
 * surfacing `undefined` deep inside a request handler. Client code must never
 * import this module — it is server-only.
 */
const schema = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid connection string"),
  // Optional restricted-role connection used for per-request (RLS-scoped)
  // queries. Falls back to DATABASE_URL when unset (single-connection dev).
  APP_DATABASE_URL: z.string().url().optional(),
  AUTH_SECRET: z
    .string()
    .min(16, "AUTH_SECRET must be at least 16 characters"),
  AUTH_URL: z.string().url().optional(),
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  // Resend (transactional email) — optional. When unset, email features are
  // silently disabled (e.g. share invites just don't send a notification).
  RESEND_API_KEY: z.string().optional().default(""),
  // Verified sender. Defaults to Resend's shared test address, which can only
  // deliver to your own account email until you verify a domain.
  EMAIL_FROM: z.string().optional().default("Palimpsest <onboarding@resend.dev>"),
  MAX_SYNC_PAYLOAD_BYTES: z.coerce.number().int().positive().default(524288),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const env = load();

/** AI features are optional; the UI hides them when no key is configured. */
export const aiEnabled = env.ANTHROPIC_API_KEY.length > 0;

/** Transactional email is optional; senders no-op when no key is configured. */
export const emailEnabled = env.RESEND_API_KEY.length > 0;

/**
 * Public base URL for links embedded in emails (e.g. a document link). Prefers
 * the explicit AUTH_URL; on Vercel, VERCEL_URL is injected at runtime.
 */
export function appBaseUrl(): string {
  if (env.AUTH_URL) return env.AUTH_URL.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}
