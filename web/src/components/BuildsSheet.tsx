import { ChevronDownIcon, ExternalLinkIcon, PencilIcon, RotateCcwIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { on } from "@/lib/live";
import { IN_PROGRESS, type Suggestion, type SuggestionEvent, type Widget } from "@/lib/types";
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

/** A follow-up edit, shown under the build it changed. */
function Edit(props: { s: Suggestion; highlighted: boolean; expanded: boolean; onToggle: () => void }) {
  const { s } = props;
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (props.highlighted) ref.current?.scrollIntoView({ block: "nearest" });
  }, [props.highlighted]);

  return (
    <li ref={ref} className={cn("rounded-lg bg-muted/50 p-2", props.highlighted && "ring-2 ring-amber-400/50")}>
      <button type="button" onClick={props.onToggle} className="flex w-full items-start gap-2 text-left">
        <PencilIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <p className={cn("flex-1 text-sm", !props.expanded && "line-clamp-2")}>{s.prompt}</p>
        <StatusBadge status={s.status} />
      </button>
      {s.reason && (s.status === "denied" || s.status === "failed") && (
        <p className="mt-1 pl-5.5 text-xs text-destructive">{s.reason}</p>
      )}
      {props.expanded && (
        <ErrorBoundary>
          <Timeline id={s.id} />
        </ErrorBoundary>
      )}
    </li>
  );
}

function Build(props: {
  s: Suggestion;
  /** Follow-up edits of this build's widget, oldest first. */
  edits: Suggestion[];
  widget?: Widget;
  highlightId?: string;
  expanded?: string;
  onToggle: (id: string) => void;
  onViewWidget: (widgetId: string) => void;
  onEdit?: (widgetId: string) => void;
  onRetry?: (prompt: string) => void;
}) {
  const { s, widget } = props;
  const expanded = props.expanded === s.id;
  const highlighted = props.highlightId === s.id;
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);
  // What the widget does now: the newest live change's summary.
  const summary = [s, ...props.edits].filter((b) => b.status === "merged" && b.summary).at(-1)?.summary;
  const editing = props.edits.some((e) => IN_PROGRESS.includes(e.status));

  return (
    <li
      ref={ref}
      className={cn(
        "rounded-xl border p-3 transition-colors",
        highlighted && "border-amber-400 ring-2 ring-amber-400/50",
      )}
    >
      <button type="button" onClick={() => props.onToggle(s.id)} className="flex w-full flex-col gap-2 text-left">
        <div className="flex items-center gap-2">
          <StatusBadge status={s.status} />
          {widget && (
            <span className="min-w-0 truncate text-sm font-medium">
              {widget.emoji ?? "✨"} {widget.title}
            </span>
          )}
          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{timeAgo(s.createdAt)}</span>
          <ChevronDownIcon
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
          />
        </div>
        <p className={cn("text-sm", !expanded && "line-clamp-3")}>{s.prompt}</p>
      </button>
      {s.reason && (s.status === "denied" || s.status === "failed") && (
        <p className="mt-2 text-xs text-destructive">{s.reason}</p>
      )}
      {s.status === "failed" && !s.editOf && props.onRetry && (
        <Button size="sm" variant="secondary" className="mt-2 gap-1" onClick={() => props.onRetry!(s.prompt)}>
          <RotateCcwIcon /> Try again
        </Button>
      )}
      {expanded && (
        <ErrorBoundary>
          <Timeline id={s.id} />
        </ErrorBoundary>
      )}
      {props.edits.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {props.edits.map((e) => (
            <Edit
              key={e.id}
              s={e}
              highlighted={props.highlightId === e.id}
              expanded={props.expanded === e.id}
              onToggle={() => props.onToggle(e.id)}
            />
          ))}
        </ul>
      )}
      {s.status === "merged" && (
        <div className="mt-2 flex flex-col gap-2">
          {summary && <p className="text-xs text-muted-foreground">{summary}</p>}
          {s.widgetId && widget && (
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" className="gap-1" onClick={() => props.onViewWidget(s.widgetId!)}>
                <ExternalLinkIcon /> View widget
              </Button>
              {props.onEdit && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-1"
                  disabled={editing}
                  onClick={() => props.onEdit!(s.widgetId!)}
                >
                  <PencilIcon /> {editing ? "Updating…" : "Edit"}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** The visitor's own builds, most recently active first, each with its edits nested under it. */
export function BuildList(props: {
  builds: Suggestion[];
  widgets?: Widget[];
  highlightId?: string;
  onViewWidget: (widgetId: string) => void;
  onEdit?: (widgetId: string) => void;
  /** Reopens the submit sheet with a failed build's prompt, ready to edit. */
  onRetry?: (prompt: string) => void;
}) {
  const [expanded, setExpanded] = useState(props.highlightId);

  useEffect(() => {
    if (props.highlightId) setExpanded(props.highlightId);
  }, [props.highlightId]);

  const groups = useMemo(() => {
    const roots = new Map<string, { s: Suggestion; edits: Suggestion[] }>();
    for (const s of props.builds) if (!s.editOf) roots.set(s.widgetId ?? s.id, { s, edits: [] });
    for (const s of props.builds) {
      if (!s.editOf) continue;
      const root = roots.get(s.editOf);
      if (root) root.edits.unshift(s);
      else roots.set(s.id, { s, edits: [] }); // its original build isn't in this browser
    }
    const latest = (g: { s: Suggestion; edits: Suggestion[] }) =>
      Math.max(g.s.createdAt, ...g.edits.map((e) => e.createdAt));
    return [...roots.values()].sort((a, b) => latest(b) - latest(a));
  }, [props.builds]);

  return (
    <ul className="flex flex-col gap-2">
      {groups.map(({ s, edits }) => (
        <Build
          key={s.id}
          s={s}
          edits={edits}
          widget={props.widgets?.find((w) => w.id === s.widgetId)}
          highlightId={props.highlightId}
          expanded={expanded}
          onToggle={(id) => setExpanded((e) => (e === id ? undefined : id))}
          onViewWidget={props.onViewWidget}
          onEdit={props.onEdit}
          onRetry={props.onRetry}
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
  widgets?: Widget[];
  highlightId?: string;
  onViewWidget: (widgetId: string) => void;
  onEdit: (widgetId: string) => void;
  onRetry: (prompt: string) => void;
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
          <BuildList
            builds={props.builds}
            widgets={props.widgets}
            highlightId={props.highlightId}
            onViewWidget={props.onViewWidget}
            onEdit={props.onEdit}
            onRetry={props.onRetry}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
