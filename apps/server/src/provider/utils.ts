import type { ChatModelSelection, ProviderModel } from "@jobseeker/contracts";

export function resolveProviderModel(
  models: readonly ProviderModel[],
  selection?: ChatModelSelection,
): ProviderModel {
  return models.find((model) => model.slug === selection?.model) ?? models[0]!;
}

export function resolveReasoningEffort(
  model: ProviderModel,
  selection?: ChatModelSelection,
): string {
  const effort = selection?.effort;
  return effort && model.capabilities.reasoningEffort.includes(effort)
    ? effort
    : model.capabilities.defaultEffort;
}

export function mergeProviderModels(
  builtInModels: readonly ProviderModel[],
  customModels: readonly string[],
): ProviderModel[] {
  const models = [...builtInModels];
  const seen = new Set(models.map((model) => model.slug));

  for (const candidate of customModels) {
    const slug = candidate.trim();
    if (!slug || seen.has(slug)) {
      continue;
    }

    seen.add(slug);
    models.push({
      slug,
      name: slug,
      capabilities: {
        reasoningEffort: [],
        defaultEffort: "medium",
      },
    });
  }

  return models;
}
