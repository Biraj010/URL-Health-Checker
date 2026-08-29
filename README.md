# Bulk URL Health Checker

Submit a batch of URLs (pasted or CSV) and check them all in the background — status code, response time, and page title per URL. The UI shows live progress as each check completes, and a batch can be cancelled or have its failed URLs retried.

## Structure

- `apps/api` — Fastify + TypeScript backend
- `apps/worker` — Node + TypeScript background worker
- `apps/web` — Next.js frontend
- `packages/shared-types` — Zod schemas + typed API client, shared across api/worker/web
- `packages/shared-config` — Redis/queue constants shared across api/worker

## Quick Start

Prerequisites: Node.js, npm, Docker Desktop running.

```bash
npm install
npm run dev
```

That's the whole setup. Before starting the dev servers, `npm run dev` automatically:
- builds the shared packages
- starts Postgres + Redis via Docker Compose and waits for both to be healthy
- applies database migrations
- creates `apps/web/.env.local` with a working default if it doesn't exist

Then it runs api, worker, and web together.

| Service | Port |
|---|---|
| Web (Next.js) | 3000 |
| API (Fastify) | 4000 |
| Postgres | 5433 (mapped from container's 5432) |
| Redis | 6379 |

A root `.env` with local defaults is already committed — no setup needed for local dev.

## Architecture

```
apps/web (Next.js, :3000)
   │  REST fetch + SSE
   ▼
apps/api (Fastify, :4000) ───────► Postgres  (source of truth)
   │  enqueues jobs                    ▲
   ▼                                   │  writes results
Redis  ── queue, rate limit, semaphore, pub/sub, 30s list cache
   ▲
   │  consumes jobs
apps/worker
```

Postgres is the source of truth for batch/URL state — every read (list, detail, live view resync) goes back to Postgres, either directly or via the API. Redis is coordination-only: the job queue, the global rate limit and concurrency cap, pub/sub fanout for live updates, and a short-lived cache. Nothing important lives only in Redis or in a process's memory.

## Key Decisions

- **Global rate limit + distributed concurrency**: BullMQ's own `concurrency` is per-process, so it's paired with a Redis-backed limiter (10 jobs/sec) and a Redis semaphore (5 in-flight checks) — both hold across every worker process combined, not per-process.
- **Retries**: BullMQ attempts/backoff, but only for transient failures (network errors, 5xx, 429). Permanent failures (404, 403, etc.) are never retried — the outcome can't change.
- **Live updates**: SSE, not WebSockets/polling — updates only flow server→client. The client refetches full state on every connect *and* reconnect, since events aren't replayed and could be missed during a drop.
- **Cache**: Redis-backed, 30s TTL, on the batch list only. Invalidated immediately on batch create or any status change — the TTL is a backstop, not the primary freshness mechanism.
- **Cancel**: still-queued jobs are removed from the queue directly; jobs already in flight are left to finish and get written as `cancelled` (not their real result) by the worker once they resolve.
- **Retry-failed**: only resets URLs currently `failed` back to `pending`, and re-enqueues each with a new job id (BullMQ won't re-run a job id it's already seen).

## Assumptions

- CSV is a single column of URLs, one per row — parsed client-side; rows that don't look like a URL are silently skipped.
- A batch is capped at 500 URLs.
- Each URL check has a 10s fetch timeout.
- No deduplication — the same URL twice in one submission becomes two rows and two checks.

## Trade-offs / With More Time

- **No reconciliation sweep**: if enqueueing a job fails right after the batch/URL rows commit, that URL stays `pending` forever with no queue job. A real system would run a periodic job to find and re-enqueue those.
- **Title extraction is regex-based**, not a full HTML parser — covers the common case, not pathological markup.
- **No retry history** — `attemptCount` and `lastError` hold only the latest attempt, not a log of each one.
- **No auth** — anyone with the URL can submit, view, cancel, or retry any batch.
- **SSE fanout is same-instance only** (each API instance only knows about its own connected clients) — correct across instances via Redis pub/sub, but there's no reconnect backoff tuning or connection limit.

## Horizontal Scaling

Multiple API instances stay correct because nothing they need to agree on lives in process memory: the batch-list cache and the SSE pub/sub channel are both in Redis, so any instance can serve a cache hit or forward a live update regardless of which instance originally produced it. Multiple worker processes stay correct the same way — the rate limit and concurrency cap are enforced in Redis, not as in-process counters, so adding more worker processes increases total capacity without ever exceeding the shared limits.
