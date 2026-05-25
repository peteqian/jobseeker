import { z } from "zod";
import {
  createDefaultActionRegistry,
  type ActionDefinition,
  type ActionRegistry,
  type ActionResult,
} from "@peteqian/browser-agent-sdk";

import type { DistilledTrajectory, FoundJob } from "./jobTypes";

/**
 * The SDK is built against `zod/v4` from its own `zod@3.25.76` install while the
 * app is on standalone `zod@4.4.3`. Both are the same v4 engine at runtime, so
 * schemas are interchangeable, but the two installs are nominally distinct
 * types. This bridges an app-built schema to the `ActionDefinition.schema` slot.
 */
type SdkSchema<T> = ActionDefinition<string, T>["schema"];
const asSdkSchema = <T>(schema: z.ZodType<T>): SdkSchema<T> => schema as unknown as SdkSchema<T>;

const FOUND_JOB_SCHEMA = z.object({
  title: z.string().min(1),
  company: z.string().min(1).default("Unknown company"),
  location: z.string().min(1).default("Unknown location"),
  url: z.string().min(1),
  summary: z.string().min(1).default("No summary provided."),
  salary: z.string().nullable(),
});

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const JSON_VALUE_SCHEMA: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JSON_VALUE_SCHEMA),
    z.object({}).catchall(JSON_VALUE_SCHEMA),
  ]),
);

const JSON_OBJECT_SCHEMA = z.object({}).catchall(JSON_VALUE_SCHEMA);

const SAVE_TRAJECTORY_SCHEMA = z.object({
  actions: z.array(
    z.object({
      name: z.string(),
      paramsTemplate: JSON_OBJECT_SCHEMA.default({}),
    }),
  ),
  extractor: z.object({
    listingSelector: z.string(),
    fields: z.array(
      z.object({
        name: z.string().min(1),
        selector: z.string(),
        attr: z.string().nullable(),
      }),
    ),
  }),
});

type SaveTrajectoryParams = z.infer<typeof SAVE_TRAJECTORY_SCHEMA>;

/** Side-effect hooks the explorer injects into its custom SDK actions. */
export interface ExplorerActionDeps {
  signal: AbortSignal;
  /** Stream a newly seen job listing to the caller. */
  onFoundJob?: (job: FoundJob) => void | Promise<void>;
  /**
   * Validate a distilled trajectory on a fresh session and persist it as page
   * memory when it holds. Returns whether it was saved plus an optional reason
   * so the model can react.
   */
  saveTrajectory: (trajectory: DistilledTrajectory) => Promise<{ saved: boolean; reason?: string }>;
}

/** Lifts the wire shape of a distilled trajectory into the canonical type. */
function toDistilledTrajectory(params: SaveTrajectoryParams): DistilledTrajectory {
  return {
    actions: params.actions,
    extractor: {
      listingSelector: params.extractor.listingSelector,
      fields: Object.fromEntries(
        params.extractor.fields.map((entry) => [
          entry.name,
          entry.attr !== null
            ? { selector: entry.selector, attr: entry.attr }
            : { selector: entry.selector },
        ]),
      ),
    },
  };
}

/**
 * Builds the explorer action registry: the SDK defaults plus two explorer-only
 * actions that the agent calls to stream findings (`report_job`) and to teach
 * the system a reusable replay recipe (`save_trajectory`).
 *
 * The previous custom decision schema embedded these as extra JSON fields; the
 * 0.1.x SDK decide adapters return only the standard `AgentOutput`, so the work
 * moves into actions whose side effects run inside the agent loop.
 */
export function buildExplorerActions(deps: ExplorerActionDeps): ActionRegistry {
  const reportJob: ActionDefinition<"report_job", z.infer<typeof FOUND_JOB_SCHEMA>> = {
    name: "report_job",
    description:
      "Record one real, currently-visible job listing. Call it as soon as a listing's title, company, and URL are visible. Set salary to null when unknown.",
    schema: asSdkSchema(FOUND_JOB_SCHEMA),
    run: async (params): Promise<ActionResult> => {
      if (deps.signal.aborted) return { ok: false, message: "aborted" };
      const job: FoundJob = { ...params, salary: params.salary ?? undefined };
      await deps.onFoundJob?.(job);
      return { ok: true, message: `Recorded job: ${job.title}` };
    },
  };

  const saveTrajectory: ActionDefinition<"save_trajectory", SaveTrajectoryParams> = {
    name: "save_trajectory",
    description:
      "Once you reach a stable results layout you can reliably re-extract, call this exactly once with the replay steps and a selector-based extractor so future runs can skip the agent. Use ${query} as a placeholder for the search term in step params.",
    schema: asSdkSchema(SAVE_TRAJECTORY_SCHEMA),
    run: async (params): Promise<ActionResult> => {
      if (deps.signal.aborted) return { ok: false, message: "aborted" };
      const { saved, reason } = await deps.saveTrajectory(toDistilledTrajectory(params));
      return saved
        ? { ok: true, message: "Saved replay trajectory." }
        : { ok: false, message: `Trajectory rejected: ${reason ?? "validation failed"}` };
    },
  };

  const registry = createDefaultActionRegistry();
  registry.register(reportJob);
  registry.register(saveTrajectory);
  return registry;
}
