import { Badge } from "@/components/ui/badge";
import type { ExplorerLiveFeedProps } from "./projects.$projectId.explorer/explorer.types";

export function ExplorerLiveFeed({ items, isRunning }: ExplorerLiveFeedProps) {
  return (
    <section className="space-y-3 rounded-lg border bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Explorer runtime</p>
          <p className="text-xs text-muted-foreground">
            Live crawler steps and task status from server events.
          </p>
        </div>
        {isRunning ? (
          <Badge variant="secondary">Running</Badge>
        ) : (
          <Badge variant="outline">Idle</Badge>
        )}
      </div>

      {items.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          No runtime events yet. Run explorer to see live progress.
        </p>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {items.map((item) => (
            <li key={item.id} className="rounded-md border px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className={
                    item.tone === "error"
                      ? "font-medium text-destructive"
                      : item.tone === "success"
                        ? "font-medium text-emerald-600"
                        : "font-medium"
                  }
                >
                  {item.label}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {new Date(item.createdAt).toLocaleTimeString()}
                </span>
              </div>
              {item.detail ? <p className="mt-1 text-muted-foreground">{item.detail}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
