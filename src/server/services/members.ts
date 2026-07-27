import { and, eq, sql } from "drizzle-orm";
import { db, withUser } from "@/server/db";
import { documentMembers, users } from "@/server/db/schema";
import type { Role } from "@/lib/constants";
import {
  ForbiddenError,
  requireMember,
  requireOwner,
} from "./authz";
import { createInvite } from "./invites";

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

export type ShareResult =
  | {
      kind: "member";
      member: {
        userId: string;
        name: string;
        email: string;
        role: Exclude<Role, "owner">;
      };
    }
  | { kind: "invite"; email: string; role: Exclude<Role, "owner"> };

/**
 * Share a document by email (owner only). If the email already has an account,
 * they are added as a member immediately. If not, a pending invitation is
 * created that becomes a membership the moment that email registers.
 */
export async function addMember(
  userId: string,
  documentId: string,
  email: string,
  role: Exclude<Role, "owner">
): Promise<ShareResult> {
  // Resolve email → user with the unscoped client (case-insensitive, matching
  // the lower(email) unique index): RLS on `users` only exposes the caller to
  // themselves, but sharing must be able to find any registered user. Leaks
  // nothing beyond "an account exists" — authorization happens below.
  const [invitee] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(sql`lower(${users.email})`, email))
    .limit(1);

  if (!invitee) {
    // No account yet → create a pending invite (createInvite verifies ownership).
    const invite = await createInvite(userId, documentId, email, role);
    return { kind: "invite", email: invite.email, role: invite.role };
  }

  return withUser(userId, async (tx) => {
    await requireOwner(tx, documentId, userId);
    // The owner already has full access; sharing with themselves would only
    // downgrade their own membership row and lock them out of managing the doc.
    if (invitee.id === userId) {
      throw new ForbiddenError(
        "You already own this document and cannot change your own role here"
      );
    }
    await tx
      .insert(documentMembers)
      .values({ documentId, userId: invitee.id, role })
      .onConflictDoUpdate({
        target: [documentMembers.documentId, documentMembers.userId],
        set: { role },
      });

    return {
      kind: "member",
      member: { userId: invitee.id, name: invitee.name, email, role },
    };
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
