import { Loader2Icon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BuildsSheet } from "@/components/BuildsSheet";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ForkDialog } from "@/components/ForkDialog";
import { Header } from "@/components/Header";
import { SubmitSheet } from "@/components/SubmitSheet";
import { WidgetCard } from "@/components/WidgetCard";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { EXAMPLES, formatTokens } from "@/lib/format";
import { on } from "@/lib/live";
import { loadMine, saveMine } from "@/lib/storage";
import { IN_PROGRESS, type Suggestion, type Widget } from "@/lib/types";

function mergeBuilds(list: Suggestion[], incoming: Suggestion[]) {
  const byId = new Map(list.map((s) => [s.id, s]));
  for (const s of incoming) byId.set(s.id, { ...byId.get(s.id), ...s });
  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
}

/** Server order is most-liked first, then newest. New widgets join the top of the 0-like group. */
function insertWidget(list: Widget[], w: Widget) {
  if (list.some((x) => x.id === w.id)) return list.map((x) => (x.id === w.id ? { ...x, ...w } : x));
  const i = list.findIndex((x) => x.likes <= w.likes);
  return i === -1 ? [...list, w] : [...list.slice(0, i), w, ...list.slice(i)];
}

export default function App() {
  const [widgets, setWidgets] = useState<Widget[]>();
  const [builds, setBuilds] = useState<Suggestion[]>([]);
  const [online, setOnline] = useState(1);
  const [forkWidget, setForkWidget] = useState<Widget>();
  const [submitOpen, setSubmitOpen] = useState(false);
  const [prefill, setPrefill] = useState<string>();
  const [forkOf, setForkOf] = useState<string>();
  const [editOf, setEditOf] = useState<Widget>();
  const [buildsOpen, setBuildsOpen] = useState(false);
  const [highlightBuild, setHighlightBuild] = useState<string>();
  const [highlightWidget, setHighlightWidget] = useState<string>();
  const [showDownvoted, setShowDownvoted] = useState(false);
  // Toast actions outlive the render that made them, so openEdit reads the latest widgets from here.
  const widgetsRef = useRef(widgets);
  widgetsRef.current = widgets;

  // Shared links (/?w=<id>) jump to that widget once the dashboard has loaded.
  const sharedWidget = useRef(new URLSearchParams(location.search).get("w"));
  useEffect(() => {
    const id = sharedWidget.current;
    if (!id || !widgets?.some((w) => w.id === id)) return;
    sharedWidget.current = null;
    viewWidget(id);
  }, [widgets]);

  const refresh = useCallback(() => {
    api
      .widgets()
      .then((ws) => setWidgets((cur) => (cur ? ws.reduce(insertWidget, cur) : ws)))
      .catch(() => setWidgets((cur) => cur ?? []));
    const ids = [...loadMine()];
    if (ids.length) api.mySuggestions(ids).then((list) => setBuilds((cur) => mergeBuilds(cur, list)));
  }, []);

  useEffect(() => {
    refresh();
    let first = true;
    const offs = [
      on("hello", (d) => {
        setOnline(d.online);
        // Reconnected after a server restart: catch up without reloading the page.
        if (!first) refresh();
        first = false;
      }),
      on("online", (d) => setOnline(d.count)),
      on("widget.added", (w: Widget) => setWidgets((cur) => insertWidget(cur ?? [], w))),
      on("widget.hidden", (d: { id: string }) => setWidgets((cur) => cur?.filter((w) => w.id !== d.id))),
      on("widget.likes", (d: { id: string; likes: number }) =>
        setWidgets((cur) => cur?.map((w) => (w.id === d.id ? { ...w, likes: d.likes } : w))),
      ),
      on("suggestion.tokens", (d: { id: string; tokens: number }) =>
        setBuilds((cur) => cur.map((s) => (s.id === d.id ? { ...s, tokens: d.tokens } : s))),
      ),
      on("suggestion.updated", (s: Suggestion) => {
        if (!loadMine().has(s.id)) return; // only the visitor's own builds matter here
        setBuilds((cur) => mergeBuilds(cur, [s]));
        if (s.status === "merged") toast.success("Your widget is live! 🎉");
        if (s.status === "failed" || s.status === "denied") {
          // Reopen the form with the prompt, ready to improve and resubmit.
          const label = s.status === "denied" ? (s.editOf ? "Edit change" : "Edit idea") : "Try again";
          const action = {
            label,
            onClick: () => (s.editOf ? openEdit(s.editOf, s.prompt) : retry(s.prompt)),
          };
          toast.error(s.reason ?? "Your idea couldn't be built", { action });
        }
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [refresh]);

  const mineWidgets = useMemo(() => new Set(builds.map((s) => s.editOf ?? s.widgetId).filter(Boolean)), [builds]);
  const running = useMemo(() => builds.filter((s) => IN_PROGRESS.includes(s.status)), [builds]);
  const inProgress = running.length;
  const runningTokens = running.reduce((n, s) => n + (s.tokens ?? 0), 0);

  // Widgets voted below zero are hidden unless the visitor asks to see them.
  const visible = useMemo(
    () => (showDownvoted ? widgets : widgets?.filter((w) => w.likes >= 0)),
    [widgets, showDownvoted],
  );
  const downvotedCount = (widgets?.length ?? 0) - (visible?.length ?? 0);

  /** Like (1) or downvote (-1); casting the same vote again takes it back. Optimistic, then the server's numbers. */
  const castVote = useCallback(async (w: Widget, value: 1 | -1) => {
    const id = w.id;
    const before = w.liked ? 1 : w.downvoted ? -1 : 0;
    const after = before === value ? 0 : value;
    const likes = w.likes - before + after;
    setWidgets((cur) =>
      cur?.map((x) => (x.id === id ? { ...x, likes, liked: after === 1, downvoted: after === -1 } : x)),
    );
    try {
      const r = await (value === 1 ? api.like(id) : api.downvote(id));
      setWidgets((cur) => cur?.map((x) => (x.id === id ? { ...x, ...r } : x)));
    } catch (e) {
      toast.error((e as Error).message);
    }
    return likes;
  }, []);

  const onLike = useCallback(
    (w: Widget) => {
      // Liking (not unliking) shows the widget's prompt so it can be forked.
      if (!w.liked && w.prompt) setForkWidget(w);
      castVote(w, 1);
    },
    [castVote],
  );

  const onDownvote = useCallback(
    async (w: Widget) => {
      const likes = await castVote(w, -1);
      if (likes < 0 && !w.downvoted) {
        toast("Downvoted. It's now hidden with the other downvoted apps.", {
          action: { label: "Undo", onClick: () => castVote({ ...w, likes, liked: false, downvoted: true }, -1) },
        });
      }
    },
    [castVote],
  );

  function onSubmitted(s: Suggestion) {
    const mine = loadMine().add(s.id);
    saveMine(mine);
    setBuilds((cur) => mergeBuilds(cur, [s]));
    setSubmitOpen(false);
    setHighlightBuild(s.id);
    setBuildsOpen(true);
  }

  function viewWidget(id: string) {
    const w = widgetsRef.current?.find((x) => x.id === id);
    if (w && w.likes < 0) setShowDownvoted(true);
    setBuildsOpen(false);
    setSubmitOpen(false);
    setHighlightWidget(id);
    setTimeout(() => document.getElementById(`widget-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
    setTimeout(() => setHighlightWidget(undefined), 2500);
  }

  // Only calls state setters, so a stable callback keeps the memoized cards from re-rendering.
  const fork = useCallback((prompt: string) => {
    setForkWidget(undefined);
    openSubmit(prompt);
    setForkOf(prompt);
  }, []);

  function openSubmit(text?: string) {
    setPrefill(text);
    setForkOf(undefined);
    setEditOf(undefined);
    setSubmitOpen(true);
  }

  function retry(prompt: string) {
    setBuildsOpen(false);
    openSubmit(prompt);
  }

  /** Opens the change form for one of the visitor's live widgets, optionally prefilled (e.g. a denied change). */
  const openEdit = useCallback((widgetId: string, change?: string) => {
    const w = widgetsRef.current?.find((x) => x.id === widgetId);
    if (!w) return toast.error("That widget isn't on the dashboard anymore");
    setBuildsOpen(false);
    setPrefill(change);
    setForkOf(undefined);
    setEditOf(w);
    setSubmitOpen(true);
  }, []);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Header online={online} onOpenSubmit={() => openSubmit()} />
      <main className="mx-auto max-w-[1800px] px-4 pt-[calc(4rem+env(safe-area-inset-top)+1rem)] pb-16">
        {widgets === undefined || visible === undefined ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-[360px] rounded-xl" />
            ))}
          </div>
        ) : widgets.length === 0 ? (
          <EmptyState onPick={openSubmit} />
        ) : (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
              {visible.map((w) => (
                <ErrorBoundary
                  key={w.id}
                  fallback={<div className="h-[360px] rounded-xl border p-4 text-sm">💥 This card broke</div>}
                >
                  <WidgetCard
                    widget={w}
                    highlighted={w.id === highlightWidget}
                    onLike={onLike}
                    onDownvote={onDownvote}
                    onFork={fork}
                    onEdit={mineWidgets.has(w.id) ? openEdit : undefined}
                  />
                </ErrorBoundary>
              ))}
            </div>
            {(downvotedCount > 0 || showDownvoted) && (
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={() => setShowDownvoted((v) => !v)}
                  className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  {showDownvoted ? "Hide downvoted apps" : `Show downvoted apps (${downvotedCount})`}
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Only while one of your own builds is running. */}
      {inProgress > 0 && !buildsOpen && (
        <button
          type="button"
          onClick={() => {
            setHighlightBuild(undefined);
            setBuildsOpen(true);
          }}
          className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background/90 px-4 py-2.5 text-sm font-medium shadow-lg backdrop-blur-md"
        >
          <Loader2Icon className="size-4 animate-spin text-amber-500" />
          Building your widget{inProgress > 1 ? `s (${inProgress})` : ""}…
          {runningTokens > 0 && (
            <span className="font-normal text-muted-foreground tabular-nums">{formatTokens(runningTokens)} tokens</span>
          )}
        </button>
      )}

      <ErrorBoundary>
        <SubmitSheet
          open={submitOpen}
          onOpenChange={setSubmitOpen}
          prefill={prefill}
          forkOf={forkOf}
          editOf={editOf}
          onSubmitted={onSubmitted}
          builds={builds}
          widgets={widgets}
          onViewWidget={viewWidget}
          onEdit={openEdit}
          onRetry={retry}
        />
        <ForkDialog widget={forkWidget} onOpenChange={(open) => !open && setForkWidget(undefined)} onFork={fork} />
        <BuildsSheet
          open={buildsOpen}
          onOpenChange={setBuildsOpen}
          builds={builds}
          widgets={widgets}
          highlightId={highlightBuild}
          onViewWidget={viewWidget}
          onEdit={openEdit}
          onRetry={retry}
        />
      </ErrorBoundary>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (text?: string) => void }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-6 py-16 text-center sm:py-24">
      <div className="text-7xl">∞</div>
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">Nothing here yet</h1>
        <p className="text-muted-foreground">
          This dashboard builds itself. Press <b className="text-foreground">+</b> and describe the first widget, and an
          AI agent will build it live for everyone.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {EXAMPLES.slice(0, 3).map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => onPick(ex)}
            className="rounded-full border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
