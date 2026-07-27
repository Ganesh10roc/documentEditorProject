import * as Y from "yjs";
import { and, asc, count, eq, gt } from "drizzle-orm";
import { withUser, type ScopedDb } from "@/server/db";
import { documentUpdates } from "@/server/db/schema";
import { decodeUpdate } from "@/server/validation/sync";
import { requireEditor, requireMember } from "./authz";
import { touchDocument } from "./documents";
import { SyncPayloadError } from "@/server/errors";

/**
 * Number of update rows that triggers opportunistic compaction. Keeping the
 * log short bounds both pull latency and storage growth over a document's life.
 */
const COMPACTION_THRESHOLD = 300;

export interface SyncResult {
  /** Base64 CRDT delta the client is missing (updates with seq > `since`). */
  merged: string | null;
  /** New high-water seq the client should store as its next `since`. */
  seq: number;
}

/**
 * Validate + merge a batch of client updates into a single CRDT delta.
 * Applying them to a throwaway doc guarantees every byte is a parseable Yjs
 * update; a malformed blob throws here and never reaches the database.
 */
function validateAndMerge(updatesB64: string[]): Uint8Array {
  const buffers = updatesB64.map((b64) => new Uint8Array(decodeUpdate(b64)));
  const probe = new Y.Doc();
  try {
    // Fully APPLY every update to a throwaway doc. Unlike Y.mergeUpdates — which
    // is lenient on a single update and defers content decoding — applyUpdate
    // materialises every struct and its content, so malformed binary (valid
    // base64 but not a real Yjs update) throws HERE and is rejected as 422,
    // rather than being stored and later crashing compaction with a 500.
    Y.transact(probe, () => {
      for (const buf of buffers) Y.applyUpdate(probe, buf);
    });
    return Y.mergeUpdates(buffers);
  } catch {
    throw new SyncPayloadError();
  } finally {
    probe.destroy();
  }
}

/** Merge a set of stored update buffers into one delta. */
function mergeStored(rows: { update: Buffer }[]): Uint8Array | null {
  if (rows.length === 0) return null;
  const buffers = rows.map((r) => new Uint8Array(r.update));
  return Y.mergeUpdates(buffers);
}

/**
 * The unified sync step: push the client's local changes (if any) AND pull the
 * remote delta the client has not yet seen — in a single RLS-scoped transaction.
 *
 * Ordering matters for race-freedom: we read the remote delta AFTER inserting,
 * so the client is guaranteed to receive everything up to the returned seq,
 * including its own just-pushed change (idempotent to re-apply).
 */
export async function sync(
  userId: string,
  documentId: string,
  since: number,
  updatesB64: string[]
): Promise<SyncResult> {
  // Validate/merge BEFORE opening the transaction — cheap rejection of garbage.
  const hasWrite = updatesB64.length > 0;
  const mergedIncoming = hasWrite ? validateAndMerge(updatesB64) : null;

  return withUser(userId, async (tx) => {
    if (hasWrite) {
      // Viewers are rejected here (403) — and again by the RLS insert policy.
      await requireEditor(tx, documentId, userId);
      await tx.insert(documentUpdates).values({
        documentId,
        userId,
        update: Buffer.from(mergedIncoming!),
      });
      await touchDocument(tx, documentId);
    } else {
      await requireMember(tx, documentId, userId);
    }

    // Pull everything the client is missing.
    const rows = await tx
      .select({ seq: documentUpdates.seq, update: documentUpdates.update })
      .from(documentUpdates)
      .where(
        and(
          eq(documentUpdates.documentId, documentId),
          gt(documentUpdates.seq, since)
        )
      )
      .orderBy(asc(documentUpdates.seq));

    const maxSeq = rows.length ? rows[rows.length - 1]!.seq : since;
    const merged = mergeStored(rows);

    // Opportunistic compaction keeps the log bounded. Awaited (never fire-and-
    // forget) so it completes before the transaction connection is released.
    await maybeCompact(tx, documentId);

    return {
      merged: merged ? Buffer.from(merged).toString("base64") : null,
      seq: maxSeq,
    };
  });
}

/** Read-only pull (used by the polling loop and initial hydration). */
export async function pull(
  userId: string,
  documentId: string,
  since: number
): Promise<SyncResult> {
  return sync(userId, documentId, since, []);
}

/**
 * Compact the update log into a single merged row when it grows too long.
 *
 * Safe under concurrency because Yjs updates are idempotent and commutative:
 * a client whose `since` cursor points at a now-deleted seq simply pulls the
 * new merged row (a superset) and re-applies it with no effect on its state.
 */
async function maybeCompact(
  tx: ScopedDb,
  documentId: string
): Promise<void> {
  const [countRow] = await tx
    .select({ value: count() })
    .from(documentUpdates)
    .where(eq(documentUpdates.documentId, documentId));

  if (!countRow || countRow.value < COMPACTION_THRESHOLD) return;

  const rows = await tx
    .select({ seq: documentUpdates.seq, update: documentUpdates.update })
    .from(documentUpdates)
    .where(eq(documentUpdates.documentId, documentId))
    .orderBy(asc(documentUpdates.seq));

  const merged = mergeStored(rows);
  if (!merged) return;

  // Replace the whole log with one compacted row. The new row gets a fresh,
  // higher seq so existing client cursors still resolve forward correctly.
  await tx
    .delete(documentUpdates)
    .where(eq(documentUpdates.documentId, documentId));
  await tx.insert(documentUpdates).values({
    documentId,
    userId: null,
    update: Buffer.from(merged),
  });
}
