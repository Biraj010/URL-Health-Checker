# Bulk URL Health Checker

Monorepo containing the API, background worker, and web app for checking the health of bulk URLs.

## Structure

- `apps/api` — Fastify + TypeScript backend
- `apps/worker` — Node + TypeScript background worker
- `apps/web` — Next.js frontend
- `packages/shared-types` — TypeScript types shared across api/worker/web

## Getting Started

Prerequisites: Node.js, npm, and Docker Desktop running.

```bash
npm install
npm run dev
```

That's it — `npm run dev` is a genuine one-shot command. Before starting the dev servers, its `predev` hook automatically:
- creates `apps/web/.env.local` with a working default if it doesn't exist yet
- builds `packages/shared-config` and `packages/shared-types` (their compiled `dist/` output is gitignored, so this is needed on every fresh clone)
- starts Postgres and Redis via Docker Compose and waits for both to report healthy
- applies any pending Prisma migrations (`prisma migrate deploy`)

Then it runs the api, worker, and web dev servers in parallel.

Copy `.env.example` to `.env` and adjust values if needed (a `.env` with local defaults is already included).

## Design Decisions

- **CSV upload happens client-side.** The API only ever accepts a flat `urls: string[]` JSON body. `apps/web` parses any CSV upload (e.g. with papaparse) and sends the extracted URLs the same way a pasted list would be sent — the backend never parses CSV.
- **No deduplication of URLs within a batch.** If a submission contains the same URL more than once, each occurrence becomes its own `Url` row and its own background check job. Deduplication is a real feature some users may want, but it changes what "totalUrls" and per-row results mean, so it's deferred as a deliberate, separate decision rather than silently baked into submission handling.
- **Enqueue failures after a successful batch insert don't fail the request.** `POST /batches` commits the `Batch` + `Url` rows in a transaction first, then enqueues one BullMQ job per URL. If enqueueing throws partway through, the error is logged but the response is still `201` — the rows already exist as `"pending"` in Postgres, so nothing is lost, just potentially unprocessed. A production version would add a reconciliation job to find `"pending"` urls with no active queue job and re-enqueue them.
- **Title extraction is regex-based, not a full HTML parser.** `apps/worker/src/lib/extract-title.ts` pulls the first `<title>` tag out of an HTML response with a single regex rather than pulling in a DOM/HTML parsing library (e.g. cheerio). This is a deliberate scope trade-off: it covers the overwhelming majority of real pages correctly and keeps the worker's dependency footprint small, at the cost of not handling pathological markup (e.g. a `<title>` inside a comment, or unusual encoding) with full fidelity. Worth revisiting if title accuracy becomes a real product concern.
