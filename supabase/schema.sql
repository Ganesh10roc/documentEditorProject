-- ===========================================================================
-- Palimpsest — complete database bootstrap for Supabase
--
-- Paste this whole file into the Supabase SQL Editor and run it once.
-- It creates: enum, all 5 tables, foreign keys, indexes, the Row-Level-Security
-- functions + policies, and the restricted application role.
--
-- ▸ BEFORE RUNNING: replace 'CHANGE_ME_STRONG_PASSWORD' near the bottom with a
--   strong password, and use that same password in APP_DATABASE_URL.
-- Idempotent — safe to re-run.
-- ===========================================================================

create extension if not exists pgcrypto;   -- for gen_random_uuid()

-- ---------------------------------------------------------------------------
-- 1. Enum
-- ---------------------------------------------------------------------------
do $$ begin
  create type "public"."doc_role" as enum ('owner', 'editor', 'viewer');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
create table if not exists "users" (
  "id"            uuid primary key default gen_random_uuid() not null,
  "email"         text not null,
  "name"          text not null,
  "password_hash" text not null,
  "created_at"    timestamptz default now() not null
);

create table if not exists "documents" (
  "id"         uuid primary key default gen_random_uuid() not null,
  "title"      text default 'Untitled document' not null,
  "owner_id"   uuid not null,
  "created_at" timestamptz default now() not null,
  "updated_at" timestamptz default now() not null
);

create table if not exists "document_members" (
  "document_id" uuid not null,
  "user_id"     uuid not null,
  "role"        "doc_role" default 'viewer' not null,
  "created_at"  timestamptz default now() not null,
  constraint "document_members_document_id_user_id_pk"
    primary key ("document_id", "user_id")
);

create table if not exists "document_updates" (
  "seq"         bigserial primary key not null,
  "document_id" uuid not null,
  "user_id"     uuid,
  "update"      bytea not null,
  "created_at"  timestamptz default now() not null
);

create table if not exists "document_snapshots" (
  "id"             uuid primary key default gen_random_uuid() not null,
  "document_id"    uuid not null,
  "created_by"     uuid,
  "label"          text not null,
  "note"           text,
  "state"          bytea not null,
  "seq_at_capture" integer default 0 not null,
  "created_at"     timestamptz default now() not null
);

-- Pending invitations for emails without an account yet. Managed only via the
-- owner (admin) connection, so it needs NO RLS policy or app-role grant.
create table if not exists "document_invites" (
  "id"          uuid primary key default gen_random_uuid() not null,
  "document_id" uuid not null,
  "email"       text not null,
  "role"        "doc_role" default 'editor' not null,
  "invited_by"  uuid,
  "created_at"  timestamptz default now() not null
);

-- ---------------------------------------------------------------------------
-- 3. Foreign keys
-- ---------------------------------------------------------------------------
do $$ begin
  alter table "documents"
    add constraint "documents_owner_id_users_id_fk"
    foreign key ("owner_id") references "public"."users"("id") on delete cascade;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table "document_members"
    add constraint "document_members_document_id_documents_id_fk"
    foreign key ("document_id") references "public"."documents"("id") on delete cascade;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table "document_members"
    add constraint "document_members_user_id_users_id_fk"
    foreign key ("user_id") references "public"."users"("id") on delete cascade;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table "document_updates"
    add constraint "document_updates_document_id_documents_id_fk"
    foreign key ("document_id") references "public"."documents"("id") on delete cascade;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table "document_updates"
    add constraint "document_updates_user_id_users_id_fk"
    foreign key ("user_id") references "public"."users"("id") on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table "document_snapshots"
    add constraint "document_snapshots_document_id_documents_id_fk"
    foreign key ("document_id") references "public"."documents"("id") on delete cascade;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table "document_snapshots"
    add constraint "document_snapshots_created_by_users_id_fk"
    foreign key ("created_by") references "public"."users"("id") on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table "document_invites"
    add constraint "document_invites_document_id_documents_id_fk"
    foreign key ("document_id") references "public"."documents"("id") on delete cascade;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table "document_invites"
    add constraint "document_invites_invited_by_users_id_fk"
    foreign key ("invited_by") references "public"."users"("id") on delete set null;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 4. Indexes
-- ---------------------------------------------------------------------------
create index if not exists "documents_owner_idx"           on "documents" ("owner_id");
create index if not exists "document_members_user_idx"     on "document_members" ("user_id");
create index if not exists "document_updates_doc_seq_idx"  on "document_updates" ("document_id", "seq");
create index if not exists "document_snapshots_doc_idx"    on "document_snapshots" ("document_id", "created_at");
create unique index if not exists "document_invites_doc_email_unique" on "document_invites" ("document_id", "email");
create index if not exists "document_invites_email_idx"    on "document_invites" ("email");
create unique index if not exists "users_email_unique"     on "users" (lower("email"));

-- ---------------------------------------------------------------------------
-- 5. Row-Level-Security helper functions
-- ---------------------------------------------------------------------------
create or replace function app_current_user_id() returns uuid
  language sql stable as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid;
$$;

create or replace function app_is_member(doc uuid) returns boolean
  language sql stable security definer as $$
  select exists (select 1 from document_members m
    where m.document_id = doc and m.user_id = app_current_user_id());
$$;

create or replace function app_can_edit(doc uuid) returns boolean
  language sql stable security definer as $$
  select exists (select 1 from document_members m
    where m.document_id = doc and m.user_id = app_current_user_id()
      and m.role in ('owner', 'editor'));
$$;

create or replace function app_is_owner(doc uuid) returns boolean
  language sql stable security definer as $$
  select exists (select 1 from documents d
    where d.id = doc and d.owner_id = app_current_user_id());
$$;

-- ---------------------------------------------------------------------------
-- 6. RLS policies
-- ---------------------------------------------------------------------------
alter table users enable row level security;
drop policy if exists users_comember_select on users;
create policy users_comember_select on users for select using (
  id = app_current_user_id()
  or exists (
    select 1 from document_members m1
    join document_members m2 on m1.document_id = m2.document_id
    where m1.user_id = app_current_user_id() and m2.user_id = users.id
  )
);
drop policy if exists users_self_update on users;
create policy users_self_update on users for update using (id = app_current_user_id());

alter table documents enable row level security;
drop policy if exists documents_member_select on documents;
create policy documents_member_select on documents for select using (app_is_member(id));
drop policy if exists documents_owner_all on documents;
create policy documents_owner_all on documents for all
  using (owner_id = app_current_user_id())
  with check (owner_id = app_current_user_id());
drop policy if exists documents_editor_update on documents;
create policy documents_editor_update on documents for update
  using (app_can_edit(id)) with check (app_can_edit(id));

alter table document_members enable row level security;
drop policy if exists members_visible on document_members;
create policy members_visible on document_members for select using (app_is_member(document_id));
drop policy if exists members_owner_manage on document_members;
create policy members_owner_manage on document_members for all
  using (app_is_owner(document_id)) with check (app_is_owner(document_id));

alter table document_updates enable row level security;
drop policy if exists updates_member_select on document_updates;
create policy updates_member_select on document_updates for select using (app_is_member(document_id));
drop policy if exists updates_editor_insert on document_updates;
create policy updates_editor_insert on document_updates for insert with check (app_can_edit(document_id));
drop policy if exists updates_editor_delete on document_updates;
create policy updates_editor_delete on document_updates for delete using (app_can_edit(document_id));

alter table document_snapshots enable row level security;
drop policy if exists snapshots_member_select on document_snapshots;
create policy snapshots_member_select on document_snapshots for select using (app_is_member(document_id));
drop policy if exists snapshots_editor_insert on document_snapshots;
create policy snapshots_editor_insert on document_snapshots for insert with check (app_can_edit(document_id));

-- document_invites is touched ONLY by the owner (admin) connection, which
-- bypasses RLS. Enable RLS with NO policy so the public REST API (anon key)
-- gets zero access, while the app's owner connection keeps full access.
alter table document_invites enable row level security;

-- ---------------------------------------------------------------------------
-- 7. Restricted application role (RLS is enforced for this role)
--    ▸ Replace CHANGE_ME_STRONG_PASSWORD and use it in APP_DATABASE_URL.
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'palimpsest_app') then
    create role palimpsest_app login password 'CHANGE_ME_STRONG_PASSWORD' nosuperuser;
  end if;
end $$;

grant usage on schema public to palimpsest_app;
grant select, insert, update, delete on all tables in schema public to palimpsest_app;
grant usage, select on all sequences in schema public to palimpsest_app;
grant execute on all functions in schema public to palimpsest_app;
alter default privileges in schema public grant select, insert, update, delete on tables to palimpsest_app;
alter default privileges in schema public grant usage, select on sequences to palimpsest_app;
alter default privileges in schema public grant execute on functions to palimpsest_app;

-- Done. Verify with:  select tablename from pg_tables where schemaname = 'public';
