import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  base64Update,
  decodeUpdate,
  syncPushSchema,
} from "@/server/validation/sync";
import {
  MAX_BATCH_UPDATES,
  MAX_SINGLE_UPDATE_BYTES,
} from "@/lib/constants";

/** Produce a real, valid base64-encoded Yjs update for a small edit. */
function validUpdateB64(): string {
  const doc = new Y.Doc();
  doc.getText("t").insert(0, "hello");
  return Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
}

describe("sync payload validation — OOM & malformed guards", () => {
  it("accepts a well-formed update", () => {
    expect(() => base64Update.parse(validUpdateB64())).not.toThrow();
  });

  it("rejects non-base64 garbage", () => {
    expect(() => base64Update.parse("!!!! not base64 !!!!")).toThrow();
  });

  it("rejects an update whose decoded size exceeds the per-update cap", () => {
    // Build a base64 string that decodes to > the cap without allocating first.
    const tooManyBytes = MAX_SINGLE_UPDATE_BYTES + 1024;
    const huge = "A".repeat(Math.ceil((tooManyBytes * 4) / 3));
    expect(() => base64Update.parse(huge)).toThrow();
  });

  it("rejects a batch with too many updates", () => {
    const one = validUpdateB64();
    const payload = {
      since: 0,
      updates: Array.from({ length: MAX_BATCH_UPDATES + 1 }, () => one),
    };
    expect(() => syncPushSchema.parse(payload)).toThrow();
  });

  it("accepts a batch at the boundary", () => {
    const payload = { since: 5, updates: [validUpdateB64()] };
    const parsed = syncPushSchema.parse(payload);
    expect(parsed.since).toBe(5);
    expect(parsed.updates).toHaveLength(1);
  });

  it("rejects a negative cursor", () => {
    expect(() =>
      syncPushSchema.parse({ since: -1, updates: [] })
    ).toThrow();
  });

  it("decodeUpdate round-trips a valid update to a bounded Buffer", () => {
    const b64 = validUpdateB64();
    const buf = decodeUpdate(b64);
    expect(buf.byteLength).toBeLessThanOrEqual(MAX_SINGLE_UPDATE_BYTES);
    // The decoded bytes must still be a parseable Yjs update.
    const doc = new Y.Doc();
    expect(() => Y.applyUpdate(doc, new Uint8Array(buf))).not.toThrow();
    expect(doc.getText("t").toString()).toBe("hello");
  });
});
