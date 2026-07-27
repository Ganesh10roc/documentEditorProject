-- ===========================================================================
-- Supabase: create the restricted application role for the two-connection RLS
-- model (see src/server/db/index.ts and rls.sql).
--
-- Run this in the Supabase SQL Editor AFTER the schema and RLS policies exist:
--   1. Run drizzle/0000_init.sql        (tables)      — or `npm run db:push`
--   2. Run src/server/db/rls.sql        (RLS policies) — or `npm run db:setup`
--   3. Run THIS file                    (restricted role + grants)
--
-- ▸ Replace 'CHANGE_ME_STRONG_PASSWORD' with a strong password and use it in
--   APP_DATABASE_URL. Keep the owner connection (Supabase's `postgres` role)
--   for DATABASE_URL — as table owner it bypasses RLS for sign-up/login/seed,
--   while this restricted role has RLS enforced on every per-request query.
-- ===========================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'palimpsest_app') then
    create role palimpsest_app login password 'CHANGE_ME_STRONG_PASSWORD' nosuperuser;
  end if;
end
$$;

grant connect on database postgres to palimpsest_app;
grant usage on schema public to palimpsest_app;
grant select, insert, update, delete on all tables in schema public to palimpsest_app;
grant usage, select on all sequences in schema public to palimpsest_app;
grant execute on all functions in schema public to palimpsest_app;

-- Future tables created by later migrations inherit the same access.
alter default privileges in schema public
  grant select, insert, update, delete on tables to palimpsest_app;
alter default privileges in schema public
  grant usage, select on sequences to palimpsest_app;
alter default privileges in schema public
  grant execute on functions to palimpsest_app;
