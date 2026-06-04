import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import type { TailoringActivityItem } from "@/lib/tailoring-activity";

/**
 * Chronological tailoring activity timeline (oldest at top). Shared by the
 * explorer drawer and the assistant dock.
 */
export function TailoringActivityList({
  items,
  isGenerating,
  emptyMessage = "No generation activity yet.",
}: {
  items: TailoringActivityItem[];
  isGenerating: boolean;
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        const showSpinner = isLast && isGenerating && item.tone === "active";
        return (
          <li key={item.id} className="flex items-start gap-2 rounded-md border px-3 py-2 text-xs">
            <span className="mt-0.5 shrink-0">
              {showSpinner ? (
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              ) : item.tone === "success" ? (
                <CheckCircle2 className="size-3.5 text-emerald-600" />
              ) : item.tone === "error" ? (
                <XCircle className="size-3.5 text-destructive" />
              ) : (
                <span aria-hidden className="block text-center opacity-50">
                  ✻
                </span>
              )}
            </span>
            <span className="min-w-0 flex-1">
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
              {item.detail ? (
                <span className="mt-0.5 block text-muted-foreground">{item.detail}</span>
              ) : null}
            </span>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {new Date(item.createdAt).toLocaleTimeString()}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
