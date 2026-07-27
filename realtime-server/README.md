# Palimpsest — real-time relay

An auth-guarded `y-websocket` server that adds **live collaboration** to
Palimpsest: sub-second update propagation, **live cursors**, and **presence**.

It is a stateless in-memory relay — **not** the source of truth. Durability and
offline sync are handled by the Next.js app's HTTP sync engine (PostgreSQL).
If this server is down, the app keeps working over HTTP; you just lose the live
layer. That's the point of the hybrid design.

## Security

- Every connection must present a short-lived **JWT** issued by the app at
  `GET /api/realtime/token`, signed with the shared `AUTH_SECRET`. Unauthorized
  upgrades get `401`.
- The token carries the user's **role**, so the relay enforces
  **viewers are read-only** — their inbound document edits are dropped. This
  mirrors the API + Postgres RLS at the real-time layer.

## Run locally

```bash
cd realtime-server
npm install
AUTH_SECRET="<same value as the Next app>" PORT=8080 npm start
```

Then in the app's `.env.local` set `NEXT_PUBLIC_WS_URL="ws://localhost:8080"`
and restart `npm run dev`. Open the same document in two browsers to see live
cursors + presence.

## Deploy to Railway

1. `railway login` (or set `RAILWAY_TOKEN`).
2. From this `realtime-server/` directory: `railway init` then `railway up`
   (or point a Railway service at this repo subdirectory).
3. Set the service variable **`AUTH_SECRET`** to the **exact same value** as the
   Next.js app's `AUTH_SECRET`. Railway provides `PORT` automatically.
4. Copy the service's public URL and set it in the Vercel app as
   **`NEXT_PUBLIC_WS_URL`** using the `wss://` scheme, e.g.
   `wss://palimpsest-realtime.up.railway.app`. Redeploy the app.

Other persistent hosts (Render, Fly.io) work identically — this is a plain Node
process that needs a held-open TCP connection, which serverless (Vercel) can't
provide.

## Scaling

One instance handles many documents. For horizontal scale, back the rooms with
Redis pub/sub (or use sticky sessions) so peers on different instances share
state — the relay interface stays the same.
