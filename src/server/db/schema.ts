import { relations, sql } from "drizzle-orm";
import {
  bigserial,
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * `bytea` column mapped to Node `Buffer`. Yjs updates and snapshots are opaque
 * binary blobs; storing them as bytea (rather than base64 text) keeps them
 * compact and avoids a 33% size inflation on the hot sync path.
 */
const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});

export const roleEnum = pgEnum("doc_role", ["owner", "editor", "viewer"]);

// --------------------------------------------------------------------------
// Users
// --------------------------------------------------------------------------
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    emailUnique: uniqueIndex("users_email_unique").on(sql`lower(${t.email})`),
  })
);

// --------------------------------------------------------------------------
// Documents
// --------------------------------------------------------------------------
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull().default("Untitled document"),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    ownerIdx: index("documents_owner_idx").on(t.ownerId),
  })
);

// --------------------------------------------------------------------------
// Membership — the authorization boundary (Owner / Editor / Viewer)
// --------------------------------------------------------------------------
export const documentMembers = pgTable(
  "document_members",
  {
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("viewer"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.documentId, t.userId] }),
    userIdx: index("document_members_user_idx").on(t.userId),
  })
);

// --------------------------------------------------------------------------
// Pending invitations — a document shared with an email that has NO account
// yet. Resolved into a real membership when that email registers. Managed only
// via the owner (admin) connection, so it needs no RLS policy of its own.
// --------------------------------------------------------------------------
export const documentInvites = pgTable(
  "document_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    // Always stored lower-cased so lookups/uniqueness are case-insensitive.
    email: text("email").notNull(),
    role: roleEnum("role").notNull().default("editor"),
    invitedBy: uuid("invited_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // One pending invite per (document, email); re-inviting updates the role.
    docEmailUnique: uniqueIndex("document_invites_doc_email_unique").on(
      t.documentId,
      t.email
    ),
    emailIdx: index("document_invites_email_idx").on(t.email),
  })
);

// --------------------------------------------------------------------------
// Append-only Yjs update log — the shared source of truth on the server.
// Clients pull rows where seq > lastSeq; each row is a commutative CRDT delta.
// --------------------------------------------------------------------------
export const documentUpdates = pgTable(
  "document_updates",
  {
    seq: bigserial("seq", { mode: "number" }).primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    update: bytea("update").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    docSeqIdx: index("document_updates_doc_seq_idx").on(t.documentId, t.seq),
  })
);

// --------------------------------------------------------------------------
// Version snapshots — a captured, labelled full-document state for time travel.
// `state` is a Yjs-encoded document (encodeStateAsUpdate) at capture time.
// --------------------------------------------------------------------------
export const documentSnapshots = pgTable(
  "document_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    label: text("label").notNull(),
    note: text("note"),
    state: bytea("state").notNull(),
    // The update-log seq this snapshot was taken at (for provenance/diffing).
    seqAtCapture: integer("seq_at_capture").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    docIdx: index("document_snapshots_doc_idx").on(t.documentId, t.createdAt),
  })
);

// --------------------------------------------------------------------------
// Relations
// --------------------------------------------------------------------------
export const usersRelations = relations(users, ({ many }) => ({
  ownedDocuments: many(documents),
  memberships: many(documentMembers),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  owner: one(users, {
    fields: [documents.ownerId],
    references: [users.id],
  }),
  members: many(documentMembers),
  updates: many(documentUpdates),
  snapshots: many(documentSnapshots),
}));

export const documentMembersRelations = relations(
  documentMembers,
  ({ one }) => ({
    document: one(documents, {
      fields: [documentMembers.documentId],
      references: [documents.id],
    }),
    user: one(users, {
      fields: [documentMembers.userId],
      references: [users.id],
    }),
  })
);

export type Role = (typeof roleEnum.enumValues)[number];
export type User = typeof users.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type DocumentMember = typeof documentMembers.$inferSelect;
export type DocumentSnapshot = typeof documentSnapshots.$inferSelect;
export type DocumentInvite = typeof documentInvites.$inferSelect;
