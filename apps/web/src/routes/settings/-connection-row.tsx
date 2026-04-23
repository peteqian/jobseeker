import type { ConnectionRowProps } from "./settings/-settings.types";
import { StatusBadge } from "./settings/-status-badge";

export function ConnectionRow({ connection }: ConnectionRowProps) {
  return (
    <div className="px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-sm font-semibold text-foreground">{connection.name}</h3>
          <p className="text-sm text-muted-foreground">{connection.message}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:justify-end">
          <StatusBadge ok={connection.ok} />
        </div>
      </div>
    </div>
  );
}
