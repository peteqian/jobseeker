import { CheckCircle2, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { StatusBadgeProps } from "./settings/-settings.types";

export function StatusBadge({ ok }: StatusBadgeProps) {
  if (ok) {
    return (
      <Badge variant="success" className="gap-1.5">
        <CheckCircle2 className="size-3.5" />
        Connected
      </Badge>
    );
  }

  return (
    <Badge variant="destructive" className="gap-1.5">
      <XCircle className="size-3.5" />
      Not connected
    </Badge>
  );
}
