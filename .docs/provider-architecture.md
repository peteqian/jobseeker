# Provider architecture

Provider work is coordinated by `apps/server/src/services/chat/layer.ts`.

## Responsibilities

- Resolve the selected provider and model.
- Start the provider session and stream assistant output.
- Persist runtime events and thread projection state.
- Record the originating command before starting the turn so retries can be deduped.

## Runtime events

- `session.started` and `session.stopped` mark provider session lifecycle.
- `turn.started` and `turn.completed` bracket a single provider turn.
- `turn.delta` carries incremental output.
- `turn.interrupted` and `turn.failed` represent stop conditions.
- `thread.command.dispatched` records the accepted command that kicked off a turn.

## Persistence

- Command writes go to `thread_commands`.
- Ordered stream events go to `thread_events`.
- Current state goes to `thread_projections`.
- Provider runtime snapshots also get written to the generic `events` table for broader app activity tracking.
- `thread_commands` stores command metadata, not just the raw payload, so replay can distinguish retries from new work.

## Server-to-Codex communication conventions

The server talks to the OpenAI Codex CLI/SDK through `apps/server/src/provider/codex/sdkBackend.ts`.

### Session lifecycle

1. `CodexSdkBackend.createSession(config)` creates a new `Codex` SDK instance and calls `sdk.startThread({ ... })`.
2. The returned `Thread` is wrapped in an `SdkSession` that exposes three turn methods:
   - `runTurn(prompt, schema, signal)` — structured single-turn JSON output.
   - `runEvents(prompt, options)` — raw `ThreadEvent` stream mapped to internal `CodexEvent` types.
   - `runPrompt(prompt, options)` — text-delta stream filtered from `agent_message` items.
3. Each session maps to one chat thread. The server reuses the same `SdkSession` across turns via `providerService.startSession()`.

### Event mapping (`ThreadItem` → `CodexItem`)

The SDK emits `ThreadItem` values. The server normalizes them into a stable internal `CodexItem` union:

| SDK `ThreadItem.type` | Internal `CodexItem.type` | Notes                              |
| --------------------- | ------------------------- | ---------------------------------- |
| `agent_message`       | `agent_message`           | Primary assistant text output.     |
| `reasoning`           | `reasoning`               | Model reasoning chains.            |
| `command_execution`   | `command_execution`       | Shell command runs with exit code. |
| `file_change`         | `file_change`             | File add/update/delete changes.    |
| `mcp_tool_call`       | `mcp_tool_call`           | MCP server + tool name.            |
| `web_search`          | `web_search`              | Search query string.               |
| `todo_list`           | `todo_list`               | Task list items with `done` flag.  |
| `error`               | `error`                   | Error message string.              |

### Event mapping (`ThreadEvent` → `CodexEvent`)

| SDK `ThreadEvent.type`                             | Internal `CodexEvent.type`       | Notes                     |
| -------------------------------------------------- | -------------------------------- | ------------------------- |
| `thread.started`                                   | `thread.started`                 | Carries `threadId`.       |
| `turn.started`                                     | `turn.started`                   | Brackets a provider turn. |
| `item.started` / `item.updated` / `item.completed` | Same type with `item: CodexItem` | Normalized via `mapItem`. |
| `turn.completed`                                   | `turn.completed`                 | Carries token `usage`.    |
| `turn.failed`                                      | `turn.failed`                    | Wrapped in `CodexError`.  |
| `error`                                            | `error`                          | Wrapped in `CodexError`.  |

### Configuration conventions

- `sandboxMode` defaults to `"read-only"` for all chat and analysis tasks.
- `approvalPolicy` defaults to `"never"` so the CLI never blocks waiting for user approval.
- `skipGitRepoCheck` is always `true` because the server manages its own working directories.
- `modelReasoningEffort` is mapped from the UI selection (`low` / `medium` / `high`) via `toCodexReasoningEffort()`.

### Fallback chain

If the Codex CLI binary is unavailable (`codex --version` fails), the provider registry falls back to Claude API, then OpenCode SDK. Each provider adapter lives in `apps/server/src/provider/layers/`.

### Structured output pattern

Services that need JSON from Codex (profile extraction, coach review, ATS/HR analysis, explorer decisions) use `runTurn` with a Zod schema:

```ts
const jsonSchema = z.toJSONSchema(schema, { target: "draft-2020-12" });
const turn = await thread.run(prompt, { outputSchema: jsonSchema, signal });
const result = schema.safeParse(JSON.parse(turn.finalResponse));
```

This is the canonical pattern for server → Codex structured communication.
