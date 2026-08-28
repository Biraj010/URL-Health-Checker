# Bulk URL Health Checker

Monorepo containing the API, background worker, and web app for checking the health of bulk URLs.

## Structure

- `apps/api` — Fastify + TypeScript backend
- `apps/worker` — Node + TypeScript background worker
- `apps/web` — Next.js frontend
- `packages/shared-types` — TypeScript types shared across api/worker/web

## Getting Started

```bash
npm install
npm run dev
```

`npm run dev` starts the infra containers (Postgres, Redis) via Docker Compose, then runs the api, worker, and web dev servers in parallel.

Copy `.env.example` to `.env` and adjust values if needed (a `.env` with local defaults is already included).
