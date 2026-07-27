/**
 * Applies Row-Level-Security policies and helper functions from rls.sql.
 * Run AFTER `drizzle-kit push`/`migrate` has created the tables:
 *
 *   npm run db:push && npm run db:setup
 *
 * Idempotent — every statement uses `create or replace` / `drop ... if exists`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = postgres(url, { max: 1, prepare: false });
  const rls = readFileSync(join(__dirname, "rls.sql"), "utf8");

  console.log("Applying Row-Level-Security policies…");
  await sql.unsafe(rls);
  console.log("✔ RLS policies and helper functions installed.");

  // Optionally grant the restricted APP role (must already exist). Set
  // APP_DB_ROLE to enable the two-connection RLS model in production.
  const appRole = process.env.APP_DB_ROLE;
  if (appRole) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(appRole)) {
      throw new Error(`Invalid APP_DB_ROLE: ${appRole}`);
    }
    console.log(`Granting table access to restricted role "${appRole}"…`);
    await sql.unsafe(`
      grant usage on schema public to ${appRole};
      grant select, insert, update, delete on all tables in schema public to ${appRole};
      grant usage, select on all sequences in schema public to ${appRole};
      grant execute on all functions in schema public to ${appRole};
      alter default privileges in schema public
        grant select, insert, update, delete on tables to ${appRole};
    `);
    console.log(`✔ Grants applied to "${appRole}".`);
  }

  await sql.end();
}

main().catch((err) => {
  console.error("RLS setup failed:", err);
  process.exit(1);
});
