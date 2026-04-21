# Browser-Agent Package Rules

## Contract Ownership

- `@jobseeker/browser-agent` owns the server-facing browser-agent contract types.
- If another package consumes data produced by the agent loop or replay pipeline, those shared types should live here and be exported from `src/index.ts`.
- Do not redefine browser-agent contract shapes in downstream packages like `apps/server`.

Current contract source of truth:

- `src/agent/contracts.ts`

Examples of types that belong here:

- `FoundJob`
- `TrajectoryStep`
- `Extractor`
- `DistilledTrajectory`
- `DecisionInput`
- `RawAction`
- `Decision`
- `StepInfo`
- `AgentResult`
- `AgentOptions`

## Refactor Guidance

- When moving `browser-agent` into its own repository or package boundary, preserve these types as part of the public package API.
- Prefer importing shared agent contracts from `@jobseeker/browser-agent` instead of local server modules.
- If a type is only internal to one implementation detail and not consumed across package boundaries, keep it local instead of exporting it.
