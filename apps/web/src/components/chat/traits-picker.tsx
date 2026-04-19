import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import type { ChatModelSelection, ProviderModel } from "@jobseeker/contracts";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function formatEffortLabel(effort: string | undefined) {
  if (!effort) return null;
  return effort.charAt(0).toUpperCase() + effort.slice(1);
}

interface TraitsMenuContentProps {
  model?: ProviderModel;
  selection?: ChatModelSelection;
  onSelectionChange?: (selection: ChatModelSelection) => void;
}

export function TraitsMenuContent({ model, selection, onSelectionChange }: TraitsMenuContentProps) {
  if (!model) {
    return null;
  }

  const effortLevels = model.capabilities.reasoningEffort;

  if (effortLevels.length <= 1 || !selection?.provider || !selection.model) {
    return null;
  }

  return (
    <div className="space-y-1">
      <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        Effort
      </div>
      {effortLevels.map((level) => {
        const isSelected = selection.effort === level;

        return (
          <button
            key={level}
            type="button"
            onClick={() => onSelectionChange?.({ ...selection, effort: level })}
            className={cn(
              "flex w-full items-center rounded-md px-2 py-1.5 text-sm transition-colors",
              isSelected
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {formatEffortLabel(level)}
            {level === model.capabilities.defaultEffort ? " (default)" : ""}
          </button>
        );
      })}
    </div>
  );
}

interface TraitsPickerProps extends TraitsMenuContentProps {
  disabled?: boolean;
  className?: string;
}

export function TraitsPicker({
  model,
  selection,
  onSelectionChange,
  disabled,
  className,
}: TraitsPickerProps) {
  const currentModel = model;
  const [open, setOpen] = useState(false);
  const effortLabel = useMemo(
    () => formatEffortLabel(selection?.effort ?? currentModel?.capabilities.defaultEffort),
    [currentModel?.capabilities.defaultEffort, selection?.effort],
  );

  if (
    !currentModel ||
    (currentModel.capabilities.reasoningEffort?.length ?? 0) <= 1 ||
    !effortLabel
  ) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            className={cn(
              "w-40 justify-start gap-2 px-2 text-muted-foreground/70 hover:text-foreground/80",
              className,
            )}
          />
        }
      >
        <span className="truncate">{effortLabel}</span>
        <ChevronDown className="size-3 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent side="top" align="start" sideOffset={8} className="w-52 gap-0 p-2">
        <TraitsMenuContent
          model={currentModel}
          selection={selection}
          onSelectionChange={(nextSelection) => {
            onSelectionChange?.(nextSelection);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
