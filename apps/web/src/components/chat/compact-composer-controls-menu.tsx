import { Ellipsis } from "lucide-react";
import type { ChatModelSelection, ProviderModel } from "@jobseeker/contracts";

import { TraitsMenuContent } from "@/components/chat/traits-picker";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface CompactComposerControlsMenuProps {
  model?: ProviderModel;
  selection?: ChatModelSelection;
  disabled?: boolean;
  onSelectionChange?: (selection: ChatModelSelection) => void;
}

export function CompactComposerControlsMenu({
  model,
  selection,
  disabled,
  onSelectionChange,
}: CompactComposerControlsMenuProps) {
  if (!model || (model.capabilities.reasoningEffort?.length ?? 0) <= 1) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            className="shrink-0 px-2 text-muted-foreground/70 hover:text-foreground/80 sm:hidden"
            aria-label="More composer controls"
          />
        }
      >
        <Ellipsis className="size-4" />
      </PopoverTrigger>
      <PopoverContent side="top" align="start" sideOffset={8} className="w-56 gap-0 p-2">
        <TraitsMenuContent
          model={model}
          selection={selection}
          onSelectionChange={onSelectionChange}
        />
      </PopoverContent>
    </Popover>
  );
}
