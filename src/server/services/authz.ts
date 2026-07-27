import { and, eq } from "drizzle-orm";
import type { ScopedDb } from "@/server/db";
import { documentMembers } from "@/server/db/schema";
import { canEdit as roleCanEdit, isOwner as roleIsOwner } from "@/lib/constants";
import type { Role } from "@/lib/constants";

// Re-exported so callers can keep importing these from the authz module.
export { ForbiddenError, NotFoundError } from "@/server/errors";
import { ForbiddenError, NotFoundError } from "@/server/errors";

/**
 * The current user's role on a document, or null if they are not a member.
 * Runs inside an RLS-scoped transaction, so a non-member simply sees no row.
 */
export async function getRole(
  tx: ScopedDb,
  documentId: string,
  userId: string
): Promise<Role | null> {
  const [row] = await tx
    .select({ role: documentMembers.role })
    .from(documentMembers)
    .where(
      and(
        eq(documentMembers.documentId, documentId),
        eq(documentMembers.userId, userId)
      )
    )
    .limit(1);
  return row?.role ?? null;
}

export async function requireMember(
  tx: ScopedDb,
  documentId: string,
  userId: string
): Promise<Role> {
  const role = await getRole(tx, documentId, userId);
  if (!role) throw new NotFoundError();
  return role;
}

export async function requireEditor(
  tx: ScopedDb,
  documentId: string,
  userId: string
): Promise<Role> {
  const role = await requireMember(tx, documentId, userId);
  if (!roleCanEdit(role)) {
    throw new ForbiddenError("Viewers cannot modify this document");
  }
  return role;
}

export async function requireOwner(
  tx: ScopedDb,
  documentId: string,
  userId: string
): Promise<Role> {
  const role = await requireMember(tx, documentId, userId);
  if (!roleIsOwner(role)) {
    throw new ForbiddenError("Only the owner can do that");
  }
  return role;
}
