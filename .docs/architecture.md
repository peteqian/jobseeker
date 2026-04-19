# Architecture

Jobseeker is split into a React client, an HTTP API, and a separate WebSocket RPC server.

```
┌────────────────────────────────────┐
│ Browser / Desktop webview          │
│ React app in apps/web              │
│ RPC client over WebSocket          │
└───────────────┬────────────────────┘
                │ ws://127.0.0.1:<port>/ws
┌───────────────▼────────────────────┐
│ apps/server                        │
│ Hono HTTP API                       │
│ Effect RPC WebSocket server         │
│ ChatService + projection store      │
│ Drizzle + SQLite persistence        │
└───────────────┬────────────────────┘
                │ provider runtime
┌───────────────▼────────────────────┐
│ Provider runtime                   │
│ provider sessions and turn streams │
│ streamed through ChatService       │
└────────────────────────────────────┘
```

## Components

- **Web app**: `apps/web` renders the UI and talks to the server through typed RPC helpers in `apps/web/src/rpc`.
- **HTTP API**: `apps/server/src/bin.ts` boots the Hono server, runs migrations, and registers the REST routes.
- **WebSocket RPC**: `apps/server/src/ws.ts` exposes the chat RPC group and bridges requests into `ChatService`.
- **Chat service**: `apps/server/src/services/chat/layer.ts` owns thread lifecycle, streaming, runtime event persistence, and projection updates.
- **Projection store**: `apps/server/src/services/chat/projectionStore.ts` persists command logs, event logs, and materialized thread state.
- **Shared contracts**: `packages/contracts` defines the schemas used by both server and web so request and response shapes stay aligned.
- **REST routes**: `apps/server/src/api/*` handle projects, settings, tasks, events, questions, resumes, and explorer CRUD.
- **Browser agent**: `packages/browser-agent` provides the automation runtime used by the explorer service in `apps/server/src/services/explorer.ts`.
  It owns browser session control, DOM serialization, action execution, and the MCP/CLI entrypoints.
- **Provider adapters**: `apps/server/src/provider/*` contains the Codex, Claude, and OpenCode adapters and the registry that picks one for each chat turn.

## Flow

### App startup

1. The server runs migrations from `apps/server/src/db/migrate.ts`.
2. `apps/server/src/bin.ts` starts the HTTP server and then starts the WebSocket RPC server on a separate port.
3. The web app connects through the RPC client in `apps/web/src/rpc/chat-client.ts`.
4. The server keeps REST routes and chat RPC separate so the web app can use the right transport for each job.

### Chat turn flow

1. The UI creates a command envelope with command metadata.
2. The server stores the command in `thread_commands`.
3. `ChatService` starts or resumes the provider turn.
4. Stream events are appended to `thread_events` and folded into `thread_projections`.
5. The web hook replays from `getThreadProjection` and `subscribeThread(afterSequence)` to keep reconnects deterministic.

### Event model

- `thread.command.dispatched` records accepted chat commands.
- `thread.runtime.event` records provider runtime events.
- `thread.stream.event` records stream output that should be replayable to the UI.
