# Provider support

Jobseeker can run chats through three backends:

- `codex`
- `claude`
- `opencode`

## How they work

- The user picks a provider in settings.
- The server checks whether that provider is available.
- The chat service starts the turn through the selected provider adapter.
- Each provider returns the same chat stream shape to the rest of the app.

## Provider details

- **Codex**: Uses the `codex` binary by default. It also copies Codex auth/config files into the per-project home directory when needed.
- **Claude**: Uses the `claude` binary.
- **OpenCode**: Uses either a local `opencode` binary or a configured OpenCode server URL. It can also load custom model names from settings.

## Settings

- Provider settings live in `provider-settings.json` under the app data directory.
- Each provider can be turned on or off.
- Binary paths can be changed per provider.
- OpenCode can also store a server URL, password, and extra custom model slugs.
