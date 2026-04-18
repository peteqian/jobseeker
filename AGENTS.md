# AGENTS.md

## Task Completion Requirements

- All of `bun fmt`, `bun lint`, and `bun typecheck` must pass before considering tasks completed.
- NEVER run `bun test`. Always use `bun run test` (runs Vitest).

## Core Priorities

1. Performance first.
2. Reliability first.
3. Keep behavior predictable under load and during failures (session restarts, reconnects, partial streams).

If a tradeoff is required, choose correctness and robustness over short-term convenience.

## Maintainability

Long term maintainability is a core priority. If you add new functionality, first check if there is shared logic that can be extracted to a separate module. Duplicate logic across multiple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.

## Current Server Wiring (Important)

This repository currently uses:

- HTTP API server via Hono in `apps/server/src/bin.ts`
- WebSocket RPC server via Effect in `apps/server/src/ws.ts`
- Chat RPC methods from `@jobseeker/contracts` (`ChatRpcGroup`) wired to `ChatService`

Important notes:

- The files `apps/server/src/codexAppServerManager.ts`, `apps/server/src/providerManager.ts`, and
  `apps/server/src/wsServer.ts` are not present in the current codebase.
- There is currently no server-side `codex app-server` session manager module in this repository.
- Explorer config persistence is handled by `apps/server/src/api/explorer.ts`.
- Task creation is handled by `apps/server/src/api/tasks.ts`; only `resume_ingest` has execution
  logic today.

Reference docs:

- Codex App Server docs: <https://developers.openai.com/codex/sdk/#app-server>

## Reference Repos

- Open-source Codex repo: <https://github.com/openai/codex>
- Codex-Monitor (Tauri, feature-complete, strong reference implementation): <https://github.com/Dimillian/CodexMonitor>

Use these as implementation references when designing protocol handling, UX flows, and operational safeguards.
