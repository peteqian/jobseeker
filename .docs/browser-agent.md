# Browser agent

`packages/browser-agent` is the browser automation runtime used by the explorer service.

## What it does

- Launches and manages Chromium sessions.
- Keeps track of pages and tabs.
- Serializes the current page state into a compact snapshot.
- Executes browser actions such as navigation, clicking, typing, searching, screenshots, and tab control.
- Exposes a CLI for manual tasks and an MCP server for tool-based access.
- Exports the same runtime pieces for server-side use through `packages/browser-agent/src/index.ts`.

## Main pieces

- `packages/browser-agent/src/browser/session.ts` handles browser session and page lifecycle.
- `packages/browser-agent/src/actions/execute.ts` maps high-level actions to browser operations.
- `packages/browser-agent/src/dom/serialize.ts` converts page state into LLM-friendly text.
- `packages/browser-agent/bin/cli.ts` is the manual command-line entrypoint.
- `packages/browser-agent/src/mcp/server.ts` exposes the same capabilities through MCP tools.
- `packages/browser-agent/src/agent/loop.ts` runs the agent loop that chooses actions and advances the session.

## How it is used

- `apps/server/src/services/explorer.ts` calls `runAgent` to run discovery jobs.
- Explorer uses it to search target sites, collect job data, and recover from anti-bot or retry cases.
- The browser agent can also be run directly from the package when debugging browser workflows.
