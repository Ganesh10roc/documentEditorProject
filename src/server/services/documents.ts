import { desc, eq, sql } from "drizzle-orm";
import { withUser } from "@/server/db";
import {
  documentMembers,
  documents,
  users,
} from "@/server/db/schema";
import type { Role } from "@/lib/constants";
import {
  ForbiddenError,
  NotFoundError,
  requireMember,
  requireOwner,
} from "./authz";

export interface DocumentListItem {
  id: string;
  title: string;
  role: Role;
  updatedAt: Date;
  ownerName: string;
  memberCount: number;
}

/** All documents the user can see (owned or shared), newest activity first. */
export async function listDocuments(
  userId: string
): Promise<DocumentListItem[]> {
  return withUser(userId, async (tx) => {
    const rows = await tx
      .select({
        id: documents.id,
        title: documents.title,
        updatedAt: documents.updatedAt,
        role: documentMembers.role,
        ownerName: users.name,
        memberCount: sql<number>`(
          select count(*)::int from ${documentMembers} m
          where m.document_id = ${documents.id}
        )`,
      })
      .from(documentMembers)
      .innerJoin(documents, eq(documents.id, documentMembers.documentId))
      .innerJoin(users, eq(users.id, documents.ownerId))
      .where(eq(documentMembers.userId, userId))
      .orderBy(desc(documents.updatedAt));

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      role: r.role,
      updatedAt: r.updatedAt,
      ownerName: r.ownerName,
      memberCount: r.memberCount,
    }));
  });
}

/** Create a document and make the creator its owner (atomic). */
export async function createDocument(userId: string, title: string) {
  return withUser(userId, async (tx) => {
    const [doc] = await tx
      .insert(documents)
      .values({ title, ownerId: userId })
      .returning();
    await tx.insert(documentMembers).values({
      documentId: doc!.id,
      userId,
      role: "owner",
    });
    return doc!;
  });
}

export interface DocumentDetail {
  id: string;
  title: string;
  role: Role;
  ownerId: string;
  updatedAt: Date;
}

/** Fetch a single document with the caller's role. Throws if not a member. */
export async function getDocument(
  userId: string,
  documentId: string
): Promise<DocumentDetail> {
  return withUser(userId, async (tx) => {
    const role = await requireMember(tx, documentId, userId);
    const [doc] = await tx
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);
    if (!doc) throw new NotFoundError();
    return {
      id: doc.id,
      title: doc.title,
      role,
      ownerId: doc.ownerId,
      updatedAt: doc.updatedAt,
    };
  });
}

/** Rename — owners and editors may rename; viewers may not. */
export async function renameDocument(
  userId: string,
  documentId: string,
  title: string
) {
  return withUser(userId, async (tx) => {
    const role = await requireMember(tx, documentId, userId);
    if (role === "viewer") {
      throw new ForbiddenError("Viewers cannot rename this document");
    }
    await tx
      .update(documents)
      .set({ title, updatedAt: new Date() })
      .where(eq(documents.id, documentId));
  });
}

/** Delete — owner only. Cascades to members, updates, and snapshots. */
export async function deleteDocument(userId: string, documentId: string) {
  return withUser(userId, async (tx) => {
    await requireOwner(tx, documentId, userId);
    await tx.delete(documents).where(eq(documents.id, documentId));
  });
}

/** Touch `updatedAt` — called on successful sync so the list stays ordered. */
export async function touchDocument(
  tx: Parameters<Parameters<typeof withUser>[1]>[0],
  documentId: string
) {
  await tx
    .update(documents)
    .set({ updatedAt: new Date() })
    .where(eq(documents.id, documentId));
}
