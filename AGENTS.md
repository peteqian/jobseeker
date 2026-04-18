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

## Codex App Server (Important)

JobSeeker is currently Codex-first. The server starts codex app-server (JSON-RPC over stdio) per provider session, then streams structured events to the browser through WebSocket push messages.

How we use it in this codebase:

Session startup/resume and turn lifecycle are brokered in apps/server/src/codexAppServerManager.ts.
Provider dispatch and thread event logging are coordinated in apps/server/src/providerManager.ts.
WebSocket server routes NativeApi methods in apps/server/src/wsServer.ts.
Web app consumes orchestration domain events via WebSocket push on channel orchestration.domainEvent (provider runtime activity is projected into orchestration events server-side).
Docs:

Docs:

- Codex App Server docs: <https://developers.openai.com/codex/sdk/#app-server>

## Reference Repos

- Open-source Codex repo: <https://github.com/openai/codex>
- Codex-Monitor (Tauri, feature-complete, strong reference implementation): <https://github.com/Dimillian/CodexMonitor>

Use these as implementation references when designing protocol handling, UX flows, and operational safeguards.
