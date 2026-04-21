import { useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import type { ProviderOption } from "@/components/chat/provider-model-picker";
import { chatProvidersQueryOptions } from "@/lib/query-options";
import type { ChatProviderResponse } from "@/rpc/chat-client";
import { useModelChoiceStore } from "@/stores/model-choice-store";
import type { ChatModelSelection, ProviderId } from "@jobseeker/contracts";

type ModelChoiceScope = "coach" | "profile" | "explorer";

function toProviderOption(provider: ChatProviderResponse): ProviderOption | null {
  if (provider.id !== "codex" && provider.id !== "claude" && provider.id !== "opencode") {
    return null;
  }

  return {
    id: provider.id,
    available: provider.available,
    models: provider.models.map((model) => ({
      ...model,
      capabilities: {
        ...model.capabilities,
        reasoningEffort: [...model.capabilities.reasoningEffort],
      },
    })),
  };
}

function sameChoice(a?: ChatModelSelection, b?: ChatModelSelection) {
  if (!a || !b) {
    return false;
  }

  return a.provider === b.provider && a.model === b.model && a.effort === b.effort;
}

function normalizeChoice(
  providers: ProviderOption[],
  choice?: ChatModelSelection,
): ChatModelSelection | undefined {
  if (!choice) {
    return undefined;
  }

  const provider = providers.find((p) => p.available && p.id === choice.provider);
  if (!provider || provider.models.length === 0) {
    return undefined;
  }

  const model = provider.models.find((m) => m.slug === choice.model) ?? provider.models[0];
  if (!model) {
    return undefined;
  }

  const effort =
    typeof choice.effort === "string" && model.capabilities.reasoningEffort.includes(choice.effort)
      ? choice.effort
      : model.capabilities.defaultEffort;

  return {
    provider: provider.id as ProviderId,
    model: model.slug,
    effort,
  };
}

function firstChoice(providers: ProviderOption[]): ChatModelSelection | undefined {
  const provider = providers.find((p) => p.available);
  if (!provider || provider.models.length === 0) {
    return undefined;
  }

  const model = provider.models[0];
  if (!model) {
    return undefined;
  }

  return {
    provider: provider.id as ProviderId,
    model: model.slug,
    effort: model.capabilities.defaultEffort,
  };
}

function makeScopeKey(projectId: string, scope: ModelChoiceScope) {
  return `${projectId}:${scope}`;
}

export function useModelChoice(projectId: string, scope: ModelChoiceScope) {
  const scopeKey = useMemo(() => makeScopeKey(projectId, scope), [projectId, scope]);
  const storeSelection = useModelChoiceStore((state) => state.byScope[scopeKey]);
  const setChoice = useModelChoiceStore((state) => state.setChoice);
  const hasHydrated = useModelChoiceStore((state) => state.hasHydrated);

  const providersQuery = useQuery(chatProvidersQueryOptions());

  const providers = useMemo(
    () =>
      (providersQuery.data ?? [])
        .map(toProviderOption)
        .filter((provider): provider is ProviderOption => provider !== null),
    [providersQuery.data],
  );

  const selection = useMemo(
    () => normalizeChoice(providers, storeSelection),
    [providers, storeSelection],
  );

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    const next = selection ?? firstChoice(providers);
    if (!next || sameChoice(selection, next)) {
      return;
    }

    setChoice(scopeKey, next);
  }, [hasHydrated, providers, scopeKey, selection, setChoice]);

  const updateSelection = useCallback(
    (next: ChatModelSelection) => {
      const fixed = normalizeChoice(providers, next) ?? selection ?? firstChoice(providers);

      if (!fixed) {
        return;
      }

      setChoice(scopeKey, fixed);
    },
    [providers, scopeKey, selection, setChoice],
  );

  return {
    providers,
    selection,
    setSelection: updateSelection,
    providersLoading: providersQuery.isLoading,
  };
}
