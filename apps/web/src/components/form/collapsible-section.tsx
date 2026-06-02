import { type ReactNode, useState } from "react";
import { ChevronDown } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Collapsible card section. The whole header (chevron + title + description) is
// the toggle; an optional `action` (e.g. an Add button) sits outside it.
export function CollapsibleSection({
  title,
  description,
  icon,
  badge,
  action,
  defaultOpen = true,
  contentClassName,
  children,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  badge?: ReactNode;
  action?: ReactNode;
  defaultOpen?: boolean;
  contentClassName?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex flex-1 items-start gap-2.5 text-left"
        >
          <ChevronDown
            className={cn(
              "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
              !open && "-rotate-90",
            )}
          />
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              {icon}
              {title}
              {badge}
            </CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
        </button>
        {action}
      </CardHeader>
      {open ? <CardContent className={contentClassName}>{children}</CardContent> : null}
    </Card>
  );
}
