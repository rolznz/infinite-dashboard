import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { funOutOf10 } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Jev's fun rating of an idea, shown as x/10. */
export function FunBadge({ fun, className }: { fun: number; className?: string }) {
  const score = funOutOf10(fun);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-0.5 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[11px] font-medium leading-none tabular-nums text-violet-700 dark:text-violet-300",
            className,
          )}
        >
          🎉 {score}
        </span>
      </TooltipTrigger>
      <TooltipContent>Jev rated this idea {score}/10 for fun</TooltipContent>
    </Tooltip>
  );
}
