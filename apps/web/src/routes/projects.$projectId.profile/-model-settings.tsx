import { Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

import type { ProviderOption } from "@/components/chat/provider-model-picker";
import type { ChatModelSelection } from "@jobseeker/contracts";
import { PROVIDER_DISPLAY_NAMES } from "@jobseeker/contracts";

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

export function ProfileModelSettings({
  providers,
  selection,
  onSelectionChange,
}: {
  providers: ProviderOption[];
  selection?: ChatModelSelection;
  onSelectionChange: (selection: ChatModelSelection) => void;
}) {
  const available = providers.filter((p) => p.available);
  const activeProvider = providers.find((p) => p.id === selection?.provider);
  const activeModel = activeProvider?.models.find((m) => m.slug === selection?.model);
  const efforts = activeModel?.capabilities.reasoningEffort ?? [];

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground">
            <Settings2 className="size-4" />
            {activeModel?.name ?? "Model"}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Profile build settings</DialogTitle>
          <DialogDescription>
            Choose which model and reasoning level to use when building your profile.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Provider</Label>
            <select
              value={selection?.provider ?? ""}
              onChange={(e) => {
                const provider = available.find((p) => p.id === e.target.value);
                if (!provider || provider.models.length === 0) return;

                const model = provider.models[0];
                onSelectionChange({
                  provider: provider.id,
                  model: model.slug,
                  effort: model.capabilities.defaultEffort,
                });
              }}
              className={selectClassName}
            >
              {available.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {PROVIDER_DISPLAY_NAMES[provider.id]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>Model</Label>
            <select
              value={selection?.model ?? ""}
              onChange={(e) => {
                const model = activeProvider?.models.find((item) => item.slug === e.target.value);
                if (!model) return;

                onSelectionChange({
                  ...selection,
                  provider: activeProvider?.id ?? selection?.provider ?? "openai",
                  model: model.slug,
                  effort: model.capabilities.defaultEffort,
                });
              }}
              className={selectClassName}
            >
              {activeProvider?.models.map((model) => (
                <option key={model.slug} value={model.slug}>
                  {model.name}
                </option>
              ))}
            </select>
          </div>

          {efforts.length > 0 ? (
            <div className="space-y-2">
              <Label>Reasoning level</Label>
              <select
                value={selection?.effort ?? ""}
                onChange={(e) => {
                  onSelectionChange({
                    ...selection,
                    provider: selection?.provider ?? activeProvider?.id ?? "openai",
                    model: selection?.model ?? activeModel?.slug ?? "",
                    effort: e.target.value,
                  });
                }}
                className={selectClassName}
              >
                {efforts.map((level) => (
                  <option key={level} value={level}>
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
