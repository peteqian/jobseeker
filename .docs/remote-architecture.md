# Remote architecture

Jobseeker uses a local process boundary between the UI and backend so chat streaming and CRUD traffic do not share the same transport path.

## Local topology

- The browser or desktop shell renders `apps/web`.
- `apps/web` talks to `apps/server` over typed WebSocket RPC for chat and runtime streams.
- `apps/server` exposes REST endpoints for projects, settings, tasks, documents, and explorer data.
- `apps/server` also runs a separate RPC server for provider-backed chat sessions.
- `apps/server/src/services/explorer.ts` invokes `@jobseeker/browser-agent` when explorer needs to crawl or inspect pages.

## Why it is split this way

- HTTP fits project and settings reads and writes.
- WebSocket RPC fits long-lived streaming responses and reconnectable event replay.
- Keeping the transports separate makes chat recovery easier to reason about.

## Important ports

- The HTTP API listens on `env.PORT`.
- The WebSocket RPC server listens on `env.PORT + 2`.
