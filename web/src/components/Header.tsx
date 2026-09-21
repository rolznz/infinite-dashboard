import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function Header(props: { online: number; onOpenSubmit: () => void }) {
  return (
    <header
      data-testid="header"
      className="fixed inset-x-0 top-0 z-40 border-b bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur-md"
    >
      <div className="mx-auto flex h-16 max-w-[1800px] items-center gap-2 px-4 sm:gap-3">
        <a href="/" className="flex min-w-0 items-center gap-2 font-heading text-lg font-semibold tracking-tight">
          <span className="text-2xl leading-none">∞</span>
          <span className="truncate">
            Infinite<span className="hidden sm:inline"> Dash</span>
          </span>
        </a>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex h-9 items-center gap-1.5 rounded-full px-2 text-sm tabular-nums text-muted-foreground">
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
                </span>
                <span>
                  {props.online}
                  <span className="hidden sm:inline"> online</span>
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>People on the dashboard right now</TooltipContent>
          </Tooltip>

          <Button
            onClick={props.onOpenSubmit}
            className="size-12 rounded-full shadow-lg shadow-primary/20 transition-transform hover:scale-105"
            aria-label="Suggest a widget"
          >
            <PlusIcon className="size-6" strokeWidth={2.5} />
          </Button>
        </div>
      </div>
    </header>
  );
}
