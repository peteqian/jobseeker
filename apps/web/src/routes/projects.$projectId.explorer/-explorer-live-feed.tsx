import type { ExplorerLiveFeedProps } from "./-explorer.types";

/**
 * The live run stream. Outcomes (jobs found, run status) render as bordered
 * cards; granular steps and the agent's reasoning render as dim, compact lines
 * so the milestones stay scannable amid the play-by-play.
 */
export function ExplorerLiveFeed({ items }: ExplorerLiveFeedProps) {
  if (items.length === 0) {
    return (
      <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
        No runtime events yet. Run explorer to see live progress.
      </p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {items.map((item) => {
        const time = new Date(item.createdAt).toLocaleTimeString();
        if (item.kind === "outcome") {
          return (
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
                <span className="text-[11px] text-muted-foreground">{time}</span>
              </div>
              {item.detail ? <p className="mt-1 text-muted-foreground">{item.detail}</p> : null}
            </li>
          );
        }
        // Steps + reasoning: a single dim line, monospace-ish play-by-play.
        return (
          <li
            key={item.id}
            className="flex items-baseline gap-2 px-1 text-[11px] text-muted-foreground"
          >
            <span aria-hidden className={item.tone === "error" ? "text-destructive" : "opacity-50"}>
              {item.kind === "event" ? "✻" : "›"}
            </span>
            <span className={item.tone === "error" ? "text-destructive" : "font-medium"}>
              {item.label}
            </span>
            {item.detail ? <span className="truncate">{item.detail}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
