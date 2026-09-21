import { ChevronDownIcon, ExternalLinkIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { on } from "@/lib/live";
import type { Suggestion, SuggestionEvent } from "@/lib/types";
import { useIsDesktop } from "@/lib/useMediaQuery";
import { cn } from "@/lib/utils";
import { ErrorBoundary } from "./ErrorBoundary";
import { StatusBadge } from "./StatusBadge";

/** Status timeline for one build. Only user-facing messages; build internals stay on the server. */
function Timeline({ id }: { id: string }) {
  const [events, setEvents] = useState<SuggestionEvent[]>([]);

  useEffect(() => {
    let alive = true;
    api.suggestion(id).then((r) => {
      if (alive) setEvents(r.events);
    });
    const off = on("suggestion.updated", (d: Suggestion & { event?: SuggestionEvent }) => {
      if (d.id === id && d.event) setEvents((e) => [...e, d.event!]);
    });
    return () => {
      alive = false;
      off();
    };
  }, [id]);

  return (
    <ol className="mt-3 flex flex-col gap-1.5 border-l pl-3">
      {events.map((e) => (
        <li key={e.id} className="text-xs">
          <span className="text-foreground">{e.message ?? e.status}</span>
          <span className="ml-1 text-muted-foreground/70">· {timeAgo(e.at)}</span>
        </li>
      ))}
    </ol>
  );
}

function Build(props: {
  s: Suggestion;
  highlighted: boolean;
  expanded: boolean;
  onToggle: () => void;
  onViewWidget: (widgetId: string) => void;
}) {
  const { s } = props;
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (props.highlighted) ref.current?.scrollIntoView({ block: "nearest" });
  }, [props.highlighted]);

  return (
    <li
      ref={ref}
      className={cn("rounded-xl border p-3 transition-colors", props.highlighted && "border-amber-400 ring-2 ring-amber-400/50")}
    >
      <button type="button" onClick={props.onToggle} className="flex w-full flex-col gap-2 text-left">
        <div className="flex items-center gap-2">
          <StatusBadge status={s.status} />
          <span className="ml-auto text-[11px] text-muted-foreground">{timeAgo(s.createdAt)}</span>
          <ChevronDownIcon className={cn("size-4 text-muted-foreground transition-transform", props.expanded && "rotate-180")} />
        </div>
        <p className={cn("text-sm", !props.expanded && "line-clamp-3")}>{s.prompt}</p>
      </button>
      {s.reason && (s.status === "denied" || s.status === "failed") && (
        <p className="mt-2 text-xs text-destructive">{s.reason}</p>
      )}
      {s.status === "merged" && (
        <div className="mt-2 flex flex-col gap-2">
          {s.summary && <p className="text-xs text-muted-foreground">{s.summary}</p>}
          {s.widgetId && (
            <Button size="sm" variant="secondary" className="w-fit gap-1" onClick={() => props.onViewWidget(s.widgetId!)}>
              <ExternalLinkIcon /> View widget
            </Button>
          )}
        </div>
      )}
      {props.expanded && (
        <ErrorBoundary>
          <Timeline id={s.id} />
        </ErrorBoundary>
      )}
    </li>
  );
}

/** The visitor's own builds, newest first. */
export function BuildList(props: { builds: Suggestion[]; highlightId?: string; onViewWidget: (widgetId: string) => void }) {
  const [expanded, setExpanded] = useState(props.highlightId);

  useEffect(() => {
    if (props.highlightId) setExpanded(props.highlightId);
  }, [props.highlightId]);

  return (
    <ul className="flex flex-col gap-2">
      {props.builds.map((s) => (
        <Build
          key={s.id}
          s={s}
          highlighted={s.id === props.highlightId}
          expanded={expanded === s.id}
          onToggle={() => setExpanded((e) => (e === s.id ? undefined : s.id))}
          onViewWidget={props.onViewWidget}
        />
      ))}
    </ul>
  );
}

/** Opens after submitting; there's no public prompt log. */
export function BuildsSheet(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  builds: Suggestion[];
  highlightId?: string;
  onViewWidget: (widgetId: string) => void;
}) {
  const isDesktop = useIsDesktop();

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        className={isDesktop ? "w-full sm:max-w-lg" : "max-h-[88dvh] rounded-t-2xl"}
      >
        <SheetHeader className="pb-2">
          <SheetTitle className="text-xl">Your builds 🛠️</SheetTitle>
          <SheetDescription>Your widget appears on the dashboard as soon as it's live.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          <BuildList builds={props.builds} highlightId={props.highlightId} onViewWidget={props.onViewWidget} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
