# Workspace layout

- `/apps/server`: Hono HTTP API server plus a separate WebSocket RPC server. Owns migrations, persistence, provider orchestration, and chat/session state.
- `/apps/web`: React + Vite UI. Renders the app shell, project views, chat, and provider settings.
- `/apps/desktop`: Desktop shell that packages the web app and server for local distribution.
- `/packages/contracts`: Shared contracts and schemas for chat RPC, core event taxonomy, project data, models, and topic/profile types.
- `/packages/browser-agent`: Browser automation runtime. Provides session control, action execution, DOM serialization, CLI, and MCP tools used by the explorer service.
- `/scripts`: Repository-level scripts such as the dev runner.
