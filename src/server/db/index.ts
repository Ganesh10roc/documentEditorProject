import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

const poolOpts = {
  max: env.NODE_ENV === "production" ? 5 : 3,
  idle_timeout: 20,
  prepare: false,
} as const;

/**
 * OWNER connection. As the table owner it BYPASSES Row-Level Security, so it is
 * used ONLY for operations that legitimately have no authenticated user context
 * — sign-up, login lookups, resolving an invitee by email — and by trusted jobs
 * (seed/migrations). Never hand this to a per-request tenant query.
 */
const adminClient = postgres(env.DATABASE_URL, poolOpts);
export const db = drizzle(adminClient, { schema, casing: "snake_case" });

/**
 * APP connection. A restricted, non-owner role to which RLS applies in full.
 * Every per-request query flows through here via `withUser()`. When
 * APP_DATABASE_URL is unset it falls back to the owner connection (dev/single
 * role) — RLS is then inert and tenant isolation rests on the explicit ORM
 * scoping in the services layer, which is written to be self-sufficient.
 */
const appClient =
  env.APP_DATABASE_URL && env.APP_DATABASE_URL !== env.DATABASE_URL
    ? postgres(env.APP_DATABASE_URL, poolOpts)
    : adminClient;
const appDb = drizzle(appClient, { schema, casing: "snake_case" });

export type ScopedDb = Parameters<
  Parameters<typeof appDb.transaction>[0]
>[0];

/**
 * Run `fn` inside a transaction on the restricted APP connection, bound to
 * `userId`. `set_config('app.current_user_id', …, true)` is transaction-local
 * (auto-reset on commit/rollback) and drives every RLS policy in rls.sql. Under
 * the restricted role the database refuses rows the user cannot access even if
 * a WHERE clause is missing — defence in depth atop the ORM scoping.
 */
export async function withUser<T>(
  userId: string,
  fn: (tx: ScopedDb) => Promise<T>
): Promise<T> {
  return appDb.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.current_user_id', ${userId}, true)`
    );
    return fn(tx);
  });
}

export { schema };
