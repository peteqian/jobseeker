import { ChevronDown, Cpu, Sparkles, Terminal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  PROVIDER_DISPLAY_NAMES,
  type ChatModelSelection,
  type ProviderId,
  type ProviderModel,
} from "@jobseeker/contracts";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface ProviderOption {
  readonly id: ProviderId;
  readonly available: boolean;
  readonly models: readonly ProviderModel[];
}

interface ProviderModelPickerProps {
  providers?: readonly ProviderOption[];
  selection?: ChatModelSelection;
  disabled?: boolean;
  onSelectionChange?: (selection: ChatModelSelection) => void;
}

const PROVIDER_ICONS = {
  codex: Sparkles,
  claude: Cpu,
  opencode: Terminal,
} satisfies Record<ProviderId, typeof Cpu>;

export function ProviderModelPicker({
  providers,
  selection,
  disabled,
  onSelectionChange,
}: ProviderModelPickerProps) {
  const [open, setOpen] = useState(false);
  const availableProviders = useMemo(
    () => providers?.filter((provider) => provider.available) ?? [],
    [providers],
  );
  const unavailableProviders = useMemo(
    () => providers?.filter((provider) => !provider.available) ?? [],
    [providers],
  );
  const activeProvider = providers?.find((provider) => provider.id === selection?.provider);
  const activeModel = activeProvider?.models.find((model) => model.slug === selection?.model);
  const [previewProviderId, setPreviewProviderId] = useState<ProviderId | undefined>(
    selection?.provider,
  );

  useEffect(() => {
    if (selection?.provider) {
      setPreviewProviderId(selection.provider);
      return;
    }
    if (availableProviders[0]) {
      setPreviewProviderId(availableProviders[0].id);
    }
  }, [availableProviders, selection?.provider]);

  const previewProvider = availableProviders.find((provider) => provider.id === previewProviderId);
  const displayLabel =
    activeModel?.name ??
    (activeProvider ? PROVIDER_DISPLAY_NAMES[activeProvider.id] : "Select model");
  const ActiveProviderIcon = PROVIDER_ICONS[activeProvider?.id ?? "codex"];

  function pickModel(provider: ProviderOption, model: ProviderModel) {
    onSelectionChange?.({
      provider: provider.id,
      model: model.slug,
      effort: model.capabilities.defaultEffort,
    });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            data-chat-provider-model-picker="true"
            className="w-52 justify-start gap-2 px-2 text-muted-foreground/70 hover:text-foreground"
          />
        }
      >
        <ActiveProviderIcon className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">{displayLabel}</span>
        <ChevronDown className="size-3 shrink-0 opacity-60" />
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="h-[clamp(240px,55dvh,320px)] w-[420px] gap-0 overflow-hidden p-0"
      >
        <div className="grid h-full grid-cols-[150px_minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col border-r bg-muted/20 p-2">
            <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Providers
            </div>
            <div className="min-h-0 space-y-1 overflow-y-auto">
              {availableProviders.map((provider) => {
                const ProviderIcon = PROVIDER_ICONS[provider.id];
                const isActive = previewProvider?.id === provider.id;

                return (
                  <button
                    key={provider.id}
                    type="button"
                    onMouseEnter={() => setPreviewProviderId(provider.id)}
                    onFocus={() => setPreviewProviderId(provider.id)}
                    onClick={() => setPreviewProviderId(provider.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                      isActive
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
                    )}
                  >
                    <ProviderIcon className="size-4 shrink-0" />
                    <span className="truncate">{PROVIDER_DISPLAY_NAMES[provider.id]}</span>
                  </button>
                );
              })}

              {unavailableProviders.length > 0 ? (
                <div className="pt-2">
                  <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
                    Unavailable
                  </div>
                  {unavailableProviders.map((provider) => {
                    const ProviderIcon = PROVIDER_ICONS[provider.id];

                    return (
                      <div
                        key={provider.id}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground/60"
                      >
                        <ProviderIcon className="size-4 shrink-0" />
                        <span className="truncate">{PROVIDER_DISPLAY_NAMES[provider.id]}</span>
                        <span className="ml-auto text-[11px] uppercase tracking-[0.08em]">Off</span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex min-h-0 flex-col p-2">
            <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {previewProvider ? PROVIDER_DISPLAY_NAMES[previewProvider.id] : "Models"}
            </div>
            <div className="min-h-0 space-y-1 overflow-y-auto">
              {previewProvider?.models.map((model) => {
                const isSelected =
                  selection?.provider === previewProvider.id && selection?.model === model.slug;

                return (
                  <button
                    key={`${previewProvider.id}:${model.slug}`}
                    type="button"
                    onClick={() => pickModel(previewProvider, model)}
                    className={cn(
                      "flex w-full items-center rounded-md px-2 py-1.5 text-sm transition-colors",
                      isSelected
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <span className="truncate">{model.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
