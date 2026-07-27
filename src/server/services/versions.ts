import * as Y from "yjs";
import { and, asc, desc, eq } from "drizzle-orm";
import { withUser, type ScopedDb } from "@/server/db";
import { documentSnapshots, documentUpdates } from "@/server/db/schema";
import { NotFoundError, requireEditor, requireMember } from "./authz";
import { touchDocument } from "./documents";
import { cloneXmlNode, fragmentToText } from "./yjs-xml";

const FRAGMENT = "prosemirror";

/** Reconstruct the authoritative Y.Doc from the full update log. */
async function loadDoc(tx: ScopedDb, documentId: string) {
  const rows = await tx
    .select({ seq: documentUpdates.seq, update: documentUpdates.update })
    .from(documentUpdates)
    .where(eq(documentUpdates.documentId, documentId))
    .orderBy(asc(documentUpdates.seq));

  const doc = new Y.Doc();
  Y.transact(doc, () => {
    for (const row of rows) Y.applyUpdate(doc, new Uint8Array(row.update));
  });
  const maxSeq = rows.length ? rows[rows.length - 1]!.seq : 0;
  return { doc, maxSeq };
}

export interface SnapshotView {
  id: string;
  label: string;
  note: string | null;
  createdBy: string | null;
  createdAt: Date;
  preview: string;
}

/** List the version timeline (newest first). */
export async function listSnapshots(
  userId: string,
  documentId: string
): Promise<SnapshotView[]> {
  return withUser(userId, async (tx) => {
    await requireMember(tx, documentId, userId);
    const rows = await tx
      .select()
      .from(documentSnapshots)
      .where(eq(documentSnapshots.documentId, documentId))
      .orderBy(desc(documentSnapshots.createdAt));

    return rows.map((r) => {
      const doc = new Y.Doc();
      Y.applyUpdate(doc, new Uint8Array(r.state));
      const preview = fragmentToText(doc.getXmlFragment(FRAGMENT)).slice(0, 240);
      return {
        id: r.id,
        label: r.label,
        note: r.note,
        createdBy: r.createdBy,
        createdAt: r.createdAt,
        preview,
      };
    });
  });
}

/**
 * Capture a snapshot of the CURRENT authoritative document state. Content is
 * read from the update log server-side, so a client cannot forge a version.
 */
export async function createSnapshot(
  userId: string,
  documentId: string,
  label: string,
  note?: string
) {
  return withUser(userId, async (tx) => {
    await requireEditor(tx, documentId, userId);
    const { doc, maxSeq } = await loadDoc(tx, documentId);
    const state = Buffer.from(Y.encodeStateAsUpdate(doc));

    const [row] = await tx
      .insert(documentSnapshots)
      .values({
        documentId,
        createdBy: userId,
        label,
        note: note ?? null,
        state,
        seqAtCapture: maxSeq,
      })
      .returning();
    return row!;
  });
}

/** Full plain text of a snapshot (capped) — used by the AI "explain diff". */
export async function getSnapshotText(
  userId: string,
  documentId: string,
  snapshotId: string
): Promise<string> {
  return withUser(userId, async (tx) => {
    await requireMember(tx, documentId, userId);
    const [snap] = await tx
      .select({ state: documentSnapshots.state })
      .from(documentSnapshots)
      .where(
        and(
          eq(documentSnapshots.id, snapshotId),
          eq(documentSnapshots.documentId, documentId)
        )
      )
      .limit(1);
    if (!snap) throw new NotFoundError("Snapshot not found");
    const doc = new Y.Doc();
    Y.applyUpdate(doc, new Uint8Array(snap.state));
    return fragmentToText(doc.getXmlFragment(FRAGMENT)).slice(0, 20_000);
  });
}

/**
 * Restore a document to a past snapshot WITHOUT resetting the CRDT.
 *
 * We rebuild the target content as brand-new Yjs operations on top of the live
 * document (delete current children, insert clones of the snapshot's children)
 * inside a single transaction. The resulting update is appended to the log like
 * any other edit, so every active collaborator converges to the restored text
 * with no state reset and no corruption — restore is just another merge.
 */
export async function restoreSnapshot(
  userId: string,
  documentId: string,
  snapshotId: string
): Promise<{ seq: number }> {
  return withUser(userId, async (tx) => {
    await requireEditor(tx, documentId, userId);

    const [snap] = await tx
      .select()
      .from(documentSnapshots)
      .where(
        and(
          eq(documentSnapshots.id, snapshotId),
          eq(documentSnapshots.documentId, documentId)
        )
      )
      .limit(1);
    if (!snap) throw new NotFoundError("Snapshot not found");

    // Live document reconstructed from the log.
    const { doc } = await loadDoc(tx, documentId);

    // Target document from the snapshot state.
    const target = new Y.Doc();
    Y.applyUpdate(target, new Uint8Array(snap.state));

    const liveFragment = doc.getXmlFragment(FRAGMENT);
    const targetFragment = target.getXmlFragment(FRAGMENT);

    // Capture the state vector BEFORE mutating so we can emit just the delta.
    const before = Y.encodeStateVector(doc);

    doc.transact(() => {
      liveFragment.delete(0, liveFragment.length);
      const clones = targetFragment
        .toArray()
        .map((n) => cloneXmlNode(n as Y.XmlElement | Y.XmlText));
      if (clones.length) liveFragment.insert(0, clones);
    }, "restore");

    const restoreUpdate = Y.encodeStateAsUpdate(doc, before);

    const [inserted] = await tx
      .insert(documentUpdates)
      .values({
        documentId,
        userId,
        update: Buffer.from(restoreUpdate),
      })
      .returning({ seq: documentUpdates.seq });

    await touchDocument(tx, documentId);
    return { seq: inserted!.seq };
  });
}
