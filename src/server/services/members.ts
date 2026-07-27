import { and, eq } from "drizzle-orm";
import { db, withUser } from "@/server/db";
import { documentMembers, users } from "@/server/db/schema";
import type { Role } from "@/lib/constants";
import {
  ForbiddenError,
  NotFoundError,
  requireMember,
  requireOwner,
} from "./authz";

export interface MemberView {
  userId: string;
  name: string;
  email: string;
  role: Role;
}

export async function listMembers(
  userId: string,
  documentId: string
): Promise<MemberView[]> {
  return withUser(userId, async (tx) => {
    // Explicit authz so isolation holds even if RLS is inert (single-role dev).
    await requireMember(tx, documentId, userId);
    const rows = await tx
      .select({
        userId: documentMembers.userId,
        role: documentMembers.role,
        name: users.name,
        email: users.email,
      })
      .from(documentMembers)
      .innerJoin(users, eq(users.id, documentMembers.userId))
      .where(eq(documentMembers.documentId, documentId));
    return rows;
  });
}

/** Share a document with another user by email. Owner only. */
export async function addMember(
  userId: string,
  documentId: string,
  email: string,
  role: Exclude<Role, "owner">
) {
  // Resolve email → user with the unscoped client: RLS on `users` only exposes
  // the caller to themselves, but sharing must be able to find any registered
  // user. This query is deliberately narrow (email equality) and leaks nothing
  // beyond "an account exists" — the actual authorization happens below.
  const [invitee] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!invitee) {
    throw new NotFoundError("No user with that email address");
  }

  return withUser(userId, async (tx) => {
    await requireOwner(tx, documentId, userId);
    await tx
      .insert(documentMembers)
      .values({ documentId, userId: invitee.id, role })
      .onConflictDoUpdate({
        target: [documentMembers.documentId, documentMembers.userId],
        set: { role },
      });

    return { userId: invitee.id, name: invitee.name, email, role };
  });
}

/** Change a member's role. Owner only; cannot demote the sole owner. */
export async function updateMemberRole(
  userId: string,
  documentId: string,
  targetUserId: string,
  role: Role
) {
  return withUser(userId, async (tx) => {
    await requireOwner(tx, documentId, userId);
    if (targetUserId === userId && role !== "owner") {
      throw new ForbiddenError("You cannot remove your own ownership");
    }
    await tx
      .update(documentMembers)
      .set({ role })
      .where(
        and(
          eq(documentMembers.documentId, documentId),
          eq(documentMembers.userId, targetUserId)
        )
      );
  });
}

/**
 * Leave a document you were shared on. Owners cannot leave (they must delete or
 * transfer). The membership check runs under RLS; the delete uses the admin
 * connection because RLS only lets owners mutate the membership table — a
 * non-owner removing *their own* row is a deliberate, authz-checked exception.
 */
export async function leaveDocument(userId: string, documentId: string) {
  const role = await withUser(userId, (tx) =>
    requireMember(tx, documentId, userId)
  );
  if (role === "owner") {
    throw new ForbiddenError(
      "Owners cannot leave — delete the document or transfer ownership first"
    );
  }
  await db
    .delete(documentMembers)
    .where(
      and(
        eq(documentMembers.documentId, documentId),
        eq(documentMembers.userId, userId)
      )
    );
}

/** Revoke access. Owner only; the owner cannot remove themselves. */
export async function removeMember(
  userId: string,
  documentId: string,
  targetUserId: string
) {
  return withUser(userId, async (tx) => {
    await requireOwner(tx, documentId, userId);
    if (targetUserId === userId) {
      throw new ForbiddenError("The owner cannot leave their own document");
    }
    await tx
      .delete(documentMembers)
      .where(
        and(
          eq(documentMembers.documentId, documentId),
          eq(documentMembers.userId, targetUserId)
        )
      );
  });
}
