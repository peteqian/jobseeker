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
