-- ===========================================================================
-- Row-Level Security policies for Palimpsest.
--
-- Two-role model (defence in depth):
--   • The OWNER role runs migrations, sign-up/login, and invitee lookups. It is
--     the table owner, so it BYPASSES RLS (tables are not FORCEd). Auth needs to
--     read/insert users with no authenticated context, which RLS would forbid.
--   • The APP role (non-owner, see setup.ts grants) runs every per-request query
--     inside `withUser()`. Being a non-owner, RLS applies to it in full. Even if
--     application code forgets a WHERE clause, the database refuses rows the
--     user cannot access — and viewers are blocked from writing at the DB layer.
-- ===========================================================================

-- Resolve the current request's user id from the transaction-local GUC.
create or replace function app_current_user_id() returns uuid
  language sql stable
as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid;
$$;

-- True when the current user is a member of the given document (any role).
create or replace function app_is_member(doc uuid) returns boolean
  language sql stable security definer
as $$
  select exists (
    select 1 from document_members m
    where m.document_id = doc and m.user_id = app_current_user_id()
  );
$$;

-- True when the current user may write to the document (owner or editor).
create or replace function app_can_edit(doc uuid) returns boolean
  language sql stable security definer
as $$
  select exists (
    select 1 from document_members m
    where m.document_id = doc
      and m.user_id = app_current_user_id()
      and m.role in ('owner', 'editor')
  );
$$;

-- True when the current user owns the document.
create or replace function app_is_owner(doc uuid) returns boolean
  language sql stable security definer
as $$
  select exists (
    select 1 from documents d
    where d.id = doc and d.owner_id = app_current_user_id()
  );
$$;

-- --- users ----------------------------------------------------------------
-- A user can see themselves AND anyone they co-author a document with (so the
-- document list and member list can render collaborator names). Arbitrary
-- email lookups for sharing use the owner connection, which bypasses RLS.
alter table users enable row level security;
drop policy if exists users_self_select on users;
drop policy if exists users_comember_select on users;
create policy users_comember_select on users
  for select using (
    id = app_current_user_id()
    or exists (
      select 1 from document_members m1
      join document_members m2 on m1.document_id = m2.document_id
      where m1.user_id = app_current_user_id() and m2.user_id = users.id
    )
  );
drop policy if exists users_self_update on users;
create policy users_self_update on users
  for update using (id = app_current_user_id());

-- --- documents ------------------------------------------------------------
alter table documents enable row level security;
drop policy if exists documents_member_select on documents;
create policy documents_member_select on documents
  for select using (app_is_member(id));
-- Owners get full control (insert/delete/update).
drop policy if exists documents_owner_all on documents;
create policy documents_owner_all on documents
  for all using (owner_id = app_current_user_id())
  with check (owner_id = app_current_user_id());
-- Editors may update the row (title + updatedAt touch on sync). Permissive
-- policies are OR-ed, so this composes with documents_owner_all.
drop policy if exists documents_editor_update on documents;
create policy documents_editor_update on documents
  for update using (app_can_edit(id))
  with check (app_can_edit(id));

-- --- document_members -----------------------------------------------------
alter table document_members enable row level security;
-- A member can see the membership rows of documents they belong to.
drop policy if exists members_visible on document_members;
create policy members_visible on document_members
  for select using (app_is_member(document_id));
-- Only the document owner can grant, change, or revoke roles.
drop policy if exists members_owner_manage on document_members;
create policy members_owner_manage on document_members
  for all using (app_is_owner(document_id))
  with check (app_is_owner(document_id));

-- --- document_updates (the hot sync path) ---------------------------------
alter table document_updates enable row level security;
-- Any member may read the update log (needed to reconstruct the document).
drop policy if exists updates_member_select on document_updates;
create policy updates_member_select on document_updates
  for select using (app_is_member(document_id));
-- CRITICAL: only owners/editors may append updates. Viewers are blocked at the
-- database layer even if an API check is somehow bypassed.
drop policy if exists updates_editor_insert on document_updates;
create policy updates_editor_insert on document_updates
  for insert with check (app_can_edit(document_id));
-- Compaction runs inside an editor's transaction and deletes superseded rows.
drop policy if exists updates_editor_delete on document_updates;
create policy updates_editor_delete on document_updates
  for delete using (app_can_edit(document_id));

-- --- document_snapshots (version history) ---------------------------------
alter table document_snapshots enable row level security;
drop policy if exists snapshots_member_select on document_snapshots;
create policy snapshots_member_select on document_snapshots
  for select using (app_is_member(document_id));
drop policy if exists snapshots_editor_insert on document_snapshots;
create policy snapshots_editor_insert on document_snapshots
  for insert with check (app_can_edit(document_id));

-- ===========================================================================
-- Grant the restricted APP role access (RLS still governs which rows). The role
-- name is provided by the setup script via the :app_role psql variable; when
-- run without it (e.g. single-connection dev), these grants are skipped.
-- ===========================================================================
