import { z } from "zod";
import { MAX_BATCH_UPDATES, MAX_SINGLE_UPDATE_BYTES } from "@/lib/constants";

/**
 * Base64 length → decoded byte estimate, WITHOUT allocating the decoded buffer.
 * Every 4 base64 chars encode 3 bytes; trailing '=' padding trims 1–2 bytes.
 * We use this to reject oversized strings before calling Buffer.from — the
 * first line of defence against a memory-amplification (OOM) attack.
 */
function base64Bytes(s: string): number {
  const len = s.length;
  const padding = s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
}

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * A single Yjs update: strict base64, bounded size. `.superRefine` runs the
 * cheap length check first so we never materialise an oversized Buffer.
 */
export const base64Update = z
  .string()
  .min(1, "empty update")
  // 4/3 inflation → cap the raw string length as a coarse pre-filter.
  .max(
    Math.ceil((MAX_SINGLE_UPDATE_BYTES * 4) / 3) + 8,
    "update exceeds size limit"
  )
  .regex(BASE64_RE, "update is not valid base64")
  .refine(
    (s) => base64Bytes(s) <= MAX_SINGLE_UPDATE_BYTES,
    "update exceeds size limit"
  );

/** Payload for POST /api/documents/:id/sync — pushing local changes up. */
export const syncPushSchema = z.object({
  // Client's high-water mark: the last server seq it has already merged.
  since: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  // The batch of local updates to append. Bounded count AND per-item size.
  updates: z
    .array(base64Update)
    .max(MAX_BATCH_UPDATES, "too many updates in one batch"),
});

export type SyncPushInput = z.infer<typeof syncPushSchema>;

/** Query params for GET pull. */
export const syncPullSchema = z.object({
  since: z.coerce.number().int().nonnegative().default(0),
});

/** Decode a validated base64 update into a bounded Buffer. */
export function decodeUpdate(b64: string): Buffer {
  const buf = Buffer.from(b64, "base64");
  if (buf.byteLength > MAX_SINGLE_UPDATE_BYTES) {
    // Defensive: should be unreachable after Zod validation.
    throw new Error("decoded update exceeds size limit");
  }
  return buf;
}
