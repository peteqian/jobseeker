# Codex prerequisites

Before changing chat or provider behavior, check these points first:

- Confirm whether the change belongs in `apps/server`, `apps/web`, or `packages/contracts`.
- Update shared contracts before wiring server and client code.
- Keep persistence changes in `apps/server/src/db` and `apps/server/src/services/chat`.
- Run the full repo validation set after edits: `bun run fmt`, `bun run lint`, `bun run typecheck`, and the relevant build.

## Important constraints

- Do not assume event delivery is in order unless it is persisted with a sequence.
- Do not add duplicate logic in the web client if the server can own it.
- Keep command and event replay safe under reconnects.
