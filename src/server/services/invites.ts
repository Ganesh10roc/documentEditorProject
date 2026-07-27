import { and, asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { documentInvites, documentMembers } from "@/server/db/schema";
import type { Role } from "@/lib/constants";
import { ForbiddenError, NotFoundError } from "./authz";

type Grantable = Exclude<Role, "owner">;

export interface InviteView {
  id: string;
  email: string;
  role: Grantable;
  createdAt: Date;
}

/**
 * All invite operations run on the OWNER (admin) connection — the invites table
 * has no RLS — so authorization is enforced explicitly here: the caller must be
 * the document's owner. Reads of a caller's own membership are safe on the admin
 * connection because they are scoped by (documentId, userId).
 */
async function assertOwner(documentId: string, userId: string): Promise<void> {
  const [m] = await db
    .select({ role: documentMembers.role })
    .from(documentMembers)
    .where(
      and(
        eq(documentMembers.documentId, documentId),
        eq(documentMembers.userId, userId)
      )
    )
    .limit(1);
  if (!m) throw new NotFoundError();
  if (m.role !== "owner") {
    throw new ForbiddenError("Only the owner can manage sharing");
  }
}

/** Create or refresh a pending invite for an email that has no account yet. */
export async function createInvite(
  inviterId: string,
  documentId: string,
  email: string,
  role: Grantable
): Promise<InviteView> {
  await assertOwner(documentId, inviterId);
  const normalized = email.trim().toLowerCase();
  const [row] = await db
    .insert(documentInvites)
    .values({ documentId, email: normalized, role, invitedBy: inviterId })
    .onConflictDoUpdate({
      target: [documentInvites.documentId, documentInvites.email],
      set: { role },
    })
    .returning();
  return {
    id: row!.id,
    email: row!.email,
    role: row!.role as Grantable,
    createdAt: row!.createdAt,
  };
}

/** Pending invites for a document. Owner-only; others receive an empty list. */
export async function listInvites(
  userId: string,
  documentId: string
): Promise<InviteView[]> {
  const [m] = await db
    .select({ role: documentMembers.role })
    .from(documentMembers)
    .where(
      and(
        eq(documentMembers.documentId, documentId),
        eq(documentMembers.userId, userId)
      )
    )
    .limit(1);
  if (!m) throw new NotFoundError();
  if (m.role !== "owner") return [];

  const rows = await db
    .select()
    .from(documentInvites)
    .where(eq(documentInvites.documentId, documentId))
    .orderBy(asc(documentInvites.createdAt));
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role as Grantable,
    createdAt: r.createdAt,
  }));
}

/** Revoke a pending invite. Owner only. */
export async function removeInvite(
  userId: string,
  documentId: string,
  inviteId: string
): Promise<void> {
  await assertOwner(documentId, userId);
  await db
    .delete(documentInvites)
    .where(
      and(
        eq(documentInvites.id, inviteId),
        eq(documentInvites.documentId, documentId)
      )
    );
}

/**
 * Convert every pending invite for `email` into a real membership for the
 * freshly-registered `userId`, then clear them. Called during sign-up. Runs on
 * the admin connection (no authenticated user context exists yet at sign-up).
 */
export async function acceptInvitesForEmail(
  userId: string,
  email: string
): Promise<number> {
  const normalized = email.trim().toLowerCase();
  const invites = await db
    .select()
    .from(documentInvites)
    .where(eq(documentInvites.email, normalized));
  if (invites.length === 0) return 0;

  for (const inv of invites) {
    await db
      .insert(documentMembers)
      .values({ documentId: inv.documentId, userId, role: inv.role })
      .onConflictDoUpdate({
        target: [documentMembers.documentId, documentMembers.userId],
        set: { role: inv.role },
      });
  }
  await db
    .delete(documentInvites)
    .where(eq(documentInvites.email, normalized));
  return invites.length;
}
