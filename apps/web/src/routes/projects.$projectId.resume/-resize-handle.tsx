import { GripVertical } from "lucide-react";

import { cn } from "@/lib/utils";

interface ResizeHandleProps {
  isResizing: boolean;
  onMouseDown: () => void;
}

export function ResizeHandle({ isResizing, onMouseDown }: ResizeHandleProps) {
  return (
    <div
      className="relative hidden cursor-col-resize select-none xl:flex xl:items-stretch"
      onMouseDown={onMouseDown}
    >
      <div className="mx-auto w-px bg-border/70" />
      <div className="absolute inset-y-0 left-1/2 flex -translate-x-1/2 items-center">
        <div
          className={cn(
            "rounded-full bg-background p-1 text-muted-foreground shadow-sm transition-colors",
            isResizing && "bg-accent text-accent-foreground",
          )}
        >
          <GripVertical className="size-4" />
        </div>
      </div>
    </div>
  );
}
