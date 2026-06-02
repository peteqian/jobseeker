import { Sparkles } from "lucide-react";

export function AiTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-600 ring-1 ring-inset ring-violet-500/20 dark:text-violet-300">
      <Sparkles className="size-3" />
      AI guess
    </span>
  );
}
