# CI

The repository expects the same checks locally that CI should run.

## Required checks

- `bun run fmt:check`
- `bun run lint`
- `bun run typecheck`
- `bun run build`

## Build expectations

- The server must compile with TypeScript and bundle with Bun.
- The web app must pass `tsc -b` and Vite production build.
- Shared contracts must stay type-safe across apps.

## Failure policy

- Prefer fixing the underlying contract or state model issue rather than masking it in the UI.
- Treat build or type errors in `apps/web` as real regressions, even if the server still compiles.
