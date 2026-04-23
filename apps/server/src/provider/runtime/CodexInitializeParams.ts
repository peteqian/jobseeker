import * as CodexSchema from "effect-codex-app-server/schema";

export function buildCodexInitializeParams(): CodexSchema.V1InitializeParams {
  return {
    clientInfo: {
      name: "jobseeker",
      title: "Jobseeker",
      version: "0.0.1",
    },
    capabilities: {
      experimentalApi: true,
    },
  };
}
