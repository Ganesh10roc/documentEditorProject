# Palimpsest — a local-first collaborative editor

> _A palimpsest is a manuscript page that preserves traces of everything previously written on it — the perfect metaphor for an editor that never loses your words._

Palimpsest is a **local-first, collaborative document editor** with offline-first
editing, **deterministic conflict resolution** (CRDTs), background synchronisation,
and **granular version control with time travel**. You can open, edit, and close
documents with **zero network requests blocking the UI** — even fully offline —
and the system reconciles state automatically when the network resolves, without
ever overwriting or destroying your offline work.

Built for the House of Edtech Fullstack assignment with **Next.js 16 (App Router,
TypeScript)**, **PostgreSQL**, **Yjs**, and **Tailwind CSS**.

- **Live deployment:** _add your Vercel URL here_
- **Repository:** _add your GitHub URL here_

---

## Why this is not a CRUD app

The hard problems this project tackles head-on:

| Problem | Approach |
| --- | --- |
| **State-synchronisation race conditions** | A durable, reference-counted **outbox** in IndexedDB; snapshot-and-drain flushing that preserves edits made mid-request; a single sync engine per document to prevent double-pushing. |
| **Deterministic data merging over a network** | **Yjs CRDTs** — updates are commutative, associative, and idempotent, so merges converge to the same result regardless of order or duplication. Proven by unit tests. |
| **Browser-based memory management** | The server **compacts** the append-only update log once it grows past a threshold, bounding both storage and pull latency over a document's lifetime. The client persists a compact binary doc, not a growing event list. |
| **OOM / malformed-payload attacks** | A **three-layer guard** on the sync endpoint (Content-Length → byte-length → strict Zod bounds) plus per-user rate limiting. |
| **Tenant isolation** | **PostgreSQL Row-Level Security** bound per-request via `SET LOCAL`, _in addition to_ ORM scoping — defence in depth. |

---

## Architecture

```
┌─────────────────────────── BROWSER (source of truth) ───────────────────────────┐
│                                                                                   │
│  TipTap (ProseMirror) ⇄ Y.Doc (CRDT) ⇄ y-indexeddb  ← instant, offline-durable    │
│                              │                                                     │
│                        SyncEngine                                                  │
│                     ┌────────┴─────────┐                                           │
│                     │ outbox (IndexedDB)│  debounce · reconnect-drain · backoff     │
│                     └────────┬─────────┘                                           │
└──────────────────────────────│ HTTP (batched, idempotent) ───────────────────────┘
                                ▼
┌──────────────────────────── NEXT.JS 16 (Vercel) ─────────────────────────────────┐
│  app/api/*  ── validate (Zod, OOM guards) ── services (business logic) ── db (RLS) │
└──────────────────────────────│────────────────────────────────────────────────────┘
                                ▼
                    PostgreSQL: append-only Yjs update log + labelled snapshots
                    (Row-Level Security enforces Owner / Editor / Viewer)
```

### The sync protocol

1. Every keystroke mutates the local `Y.Doc` **instantly** and is persisted to
   IndexedDB by `y-indexeddb`. The UI never awaits the network.
2. Local updates are captured into a durable **outbox** (also IndexedDB) so they
   survive reloads and offline sessions.
3. The **sync engine** flushes the outbox on a debounce (coalescing rapid typing),
   on an interval, and immediately on reconnect. Each flush is one HTTP `POST`
   carrying the batch of updates plus the client's `since` cursor.
4. The server validates + **merges** the batch into the append-only log
   (`Y.mergeUpdates`), then returns the **merged delta** of everything the client
   has not yet seen, plus a new `since`. The client applies it (idempotent).
5. Because Yjs updates are **commutative and idempotent**, re-applying your own
   pushed change or receiving updates out of order can never lose or corrupt data.

### Folder structure — backend and frontend cleanly separated

```
src/
├─ app/                    # Next.js routes — thin HTTP/page layer only
│  ├─ (auth)/              #   login & register
│  ├─ (app)/               #   authenticated shell → documents, editor
│  └─ api/                 #   route handlers = HTTP boundary, no business logic
│
├─ server/                 # ===== BACKEND (server-only, never bundled) =====
│  ├─ db/                  #   Drizzle schema, RLS-scoped client, rls.sql, seed
│  ├─ validation/          #   Zod payload schemas (OOM / malformed guards)
│  ├─ http/                #   response helpers, rate-limit, error mapping
│  ├─ auth/                #   Auth.js config + password hashing
│  └─ services/            #   business logic: documents, members, sync, versions, authz
│
├─ client/                 # ===== FRONTEND local-first engine (browser) =====
│  ├─ local/               #   Y.Doc manager + IndexedDB persistence + outbox store
│  ├─ sync/                #   sync engine, offline queue, connectivity
│  ├─ hooks/               #   React binding over the engine
│  └─ ai/                  #   streaming AI client
│
├─ components/             # ===== FRONTEND UI =====  ui / editor / documents / layout
├─ server/ai/              #   AI features (Vercel AI SDK + Claude)
└─ lib/                    # shared isomorphic: utils, env, types, constants, site
```

Request flow: `app/api/*` (parse + guard) → `server/validation` (Zod) →
`server/services` (logic) → `server/db` (RLS-scoped transaction).

---

## Tech stack

- **Next.js 16** (App Router, RSC, TypeScript, Turbopack) — SSR/SSG, API routes.
- **PostgreSQL** + **Drizzle ORM** with **Row-Level Security**.
- **Yjs** CRDTs + **y-indexeddb** (local persistence) + **TipTap / ProseMirror** editor.
- **Auth.js v5** — JWT sessions, bcrypt credentials.
- **Tailwind CSS v4** — token-driven design system, light/dark, accessible.
- **Vercel AI SDK** + **Claude (`claude-opus-4-8`)** — AI add-ons.
- **Vitest** (unit) + **Playwright** (e2e).

---

## Getting started

### 1. Prerequisites

- Node.js ≥ 20.9
- A PostgreSQL database (local, or **Neon** — recommended for Vercel)

### 2. Install & configure

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | 32-byte random string (`npx auth secret`) |
| `ANTHROPIC_API_KEY` | _(optional)_ enables AI features; hidden gracefully if unset |
| `MAX_SYNC_PAYLOAD_BYTES` | _(optional)_ hard sync-payload cap, default 512 KiB |

### 3. Set up the database

```bash
npm run db:push     # create tables from the Drizzle schema
npm run db:setup    # install Row-Level-Security policies (rls.sql)
npm run db:seed     # optional: demo users + a shared document
```

Demo logins after seeding:

- `ada@palimpsest.dev` / `password123` — **owner**
- `grace@palimpsest.dev` / `password123` — **editor**

### 4. Run

```bash
npm run dev      # http://localhost:3000
```

---

## Testing

```bash
npm test          # Vitest — CRDT merge determinism, idempotency, payload validation
npm run test:e2e  # Playwright — offline editing + reload persistence (needs a running app + seed)
```

The unit suite is deliberately focused on the **sync engine's guarantees**:
concurrent offline edits merging without loss, order-independent convergence,
idempotent re-application, safe version restore, and the OOM/malformed payload
guards. The e2e suite cuts the network mid-edit and asserts the change survives a
full reload.

---

## Security & real-world considerations

**Preventing an OOM from a massive/malformed sync payload.** The `POST /sync`
handler defends in three layers before any large allocation:
1. reject on the declared `Content-Length` header;
2. read the raw body and reject on its **actual** byte length (the header can lie);
3. a strict Zod schema bounds the **batch count** and the **decoded size of each
   update** — the base64 length is checked _before_ decoding, so an attacker can't
   force a huge `Buffer.from`. Malformed binary is caught by `Y.mergeUpdates`,
   which throws and is mapped to `422` rather than corrupting the document.
Per-user/document rate limiting throttles the write path.

**Tenant isolation.** Every authenticated request runs inside `withUser()`, a
transaction that sets `app.current_user_id` via `SET LOCAL`. PostgreSQL RLS
policies (see `src/server/db/rls.sql`) then gate every row: members can read a
document's update log; **only owners/editors can append updates — viewers are
blocked at the database layer even if an API check is bypassed**; only owners can
manage membership. This is enforced _in addition to_ ORM scoping.

**Authorization roles.** Owner / Editor / Viewer, enforced server-side in the
services layer, in the RLS policies, and reflected in the UI (viewers get a
read-only editor and never push).

**Handling document state size over time.** The append-only update log is
**compacted** into a single merged row once it crosses a threshold — safe because
Yjs merges are idempotent, so a client whose cursor points at a compacted-away
`seq` simply pulls the new superset and re-applies it harmlessly. This bounds both
storage growth and pull latency.

**Real-time collaboration (hybrid).** On top of the durable HTTP sync there is
an **optional real-time layer**: a small auth-guarded `y-websocket` server
(`realtime-server/`, deployable to Railway) that relays updates in sub-second
time and drives **live cursors + presence**. It is *not* the source of truth —
durability and offline sync remain in the HTTP engine + Postgres — so if the
relay is down the app keeps working, just without the live layer. Auth is a
short-lived signed JWT (`/api/realtime/token`) carrying the user's role, so the
relay enforces **viewers are read-only** at the socket, mirroring the API + RLS.
Serverless (Vercel) can't hold WebSockets, which is exactly why the relay runs
on a persistent host and the HTTP layer stays the Vercel-friendly backbone.
See [`realtime-server/README.md`](realtime-server/README.md) to deploy it.

**Scalability notes.** The rate limiter is in-memory (single-instance) and is
designed to be swapped for Redis/Vercel KV behind the same interface for a
horizontally-scaled deployment. The WebSocket relay is likewise single-instance;
backing its rooms with Redis pub/sub (same interface) scales it horizontally.

---

## Deployment — GitHub → Vercel → Supabase

The recommended stack: **GitHub** (source + CI/CD), **Vercel** (Next.js app),
**Supabase** (PostgreSQL with the two-role RLS model). Any standard Postgres
(Neon, Railway) works too — only the connection strings change.

### 1. Supabase (database)

1. Create a Supabase project. From **Project → Connect**, copy two things:
   - the **Direct connection** string (port 5432) — used for migrations/seed;
   - the **Transaction pooler** string (port 6543) — used by the deployed app
     (serverless-friendly; the app's `prepare: false` client is already
     compatible with the pooler).
2. Provision the schema and security against the **direct** connection:
   ```bash
   DATABASE_URL="<direct 5432 url>" npm run db:push        # tables
   DATABASE_URL="<direct 5432 url>" APP_DB_ROLE=palimpsest_app npm run db:setup   # RLS + grants
   ```
3. In the Supabase **SQL Editor**, run [`supabase/roles.sql`](supabase/roles.sql)
   to create the restricted `palimpsest_app` role (set a strong password).
4. Seed demo data (optional): `DATABASE_URL="<direct url>" npm run db:seed`.

### 2. Vercel (app)

Import the GitHub repo into Vercel and set environment variables:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Supabase **pooler** URL, role `postgres.<ref>` (owner — bypasses RLS for auth) |
| `APP_DATABASE_URL` | Supabase **pooler** URL, role `palimpsest_app` (restricted — RLS enforced) |
| `APP_DB_ROLE` | `palimpsest_app` |
| `AUTH_SECRET` | `npx auth secret` |
| `ANTHROPIC_API_KEY` | _(optional)_ enables AI features |

[`vercel.json`](vercel.json) pins the app to one region (`iad1`) — set it to
match your Supabase region to minimise per-request DB latency.

### 3. CI/CD (GitHub Actions)

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) type-checks, unit-tests,
and builds on every push/PR, then deploys to Vercel from `main` once these repo
secrets are set: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`. (Vercel's
own GitHub integration also deploys automatically — use whichever you prefer.)

---

## Author

Built by **Ganesh Sriramula** — update your links in `src/lib/site.ts`
(also shown in the app footer, per the submission guidelines):
GitHub · LinkedIn · Email.
