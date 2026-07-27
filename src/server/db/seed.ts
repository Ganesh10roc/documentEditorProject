/**
 * Seeds two demo users, a shared document, and one snapshot so a reviewer can
 * log in and immediately see collaboration + version history working.
 *
 *   npm run db:seed
 *
 * Demo credentials (printed on completion):
 *   ada@palimpsest.dev / password123   (owner)
 *   grace@palimpsest.dev / password123  (editor)
 */
import bcrypt from "bcryptjs";
import * as Y from "yjs";
import { and, eq } from "drizzle-orm";
import { db } from "./index";
import { documentMembers, documents, documentSnapshots, users } from "./schema";

async function upsertUser(email: string, name: string, password: string) {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing[0]) return existing[0];
  const passwordHash = await bcrypt.hash(password, 12);
  const [row] = await db
    .insert(users)
    .values({ email, name, passwordHash })
    .returning();
  return row!;
}

async function main() {
  console.log("Seeding demo data…");

  const ada = await upsertUser("ada@palimpsest.dev", "Ada Lovelace", "password123");
  const grace = await upsertUser(
    "grace@palimpsest.dev",
    "Grace Hopper",
    "password123"
  );

  // Create a shared document owned by Ada, editable by Grace.
  const [doc] = await db
    .insert(documents)
    .values({ title: "Welcome to Palimpsest", ownerId: ada.id })
    .returning();

  await db
    .insert(documentMembers)
    .values([
      { documentId: doc!.id, userId: ada.id, role: "owner" },
      { documentId: doc!.id, userId: grace.id, role: "editor" },
    ])
    .onConflictDoNothing();

  // Build an initial Yjs document with some prose and capture a snapshot.
  const ydoc = new Y.Doc();
  const xml = ydoc.getXmlFragment("prosemirror");
  const para = new Y.XmlElement("paragraph");
  para.insert(0, [
    new Y.XmlText(
      "This document lives in your browser first. Edit it offline — your work is safe."
    ),
  ]);
  xml.insert(0, [para]);

  const state = Buffer.from(Y.encodeStateAsUpdate(ydoc));

  await db.insert(documentSnapshots).values({
    documentId: doc!.id,
    createdBy: ada.id,
    label: "Initial version",
    note: "Seeded starting point.",
    state,
    seqAtCapture: 0,
  });

  // Persist the initial state into the update log so pulls reconstruct it.
  await db.execute(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (
      await import("drizzle-orm")
    ).sql`insert into document_updates (document_id, user_id, update) values (${doc!.id}, ${ada.id}, ${state})`
  );

  console.log("\n✔ Seed complete. Demo logins:");
  console.log("   ada@palimpsest.dev   / password123  (owner)");
  console.log("   grace@palimpsest.dev / password123  (editor)");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
