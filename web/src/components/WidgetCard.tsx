import { HeartIcon } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { timeAgo } from "@/lib/format";
import { createSdk } from "@/lib/sdk";
import type { Widget } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FunBadge } from "./FunBadge";

type Mount = (root: HTMLElement, sdk: ReturnType<typeof createSdk>) => unknown;

/** Loads a widget module at runtime and mounts it. A broken widget only breaks its own card. */
function WidgetBody({ widget }: { widget: Widget }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const host = container.current!;
    // A fresh root per mount, since a shadow root can only be attached once.
    const root = document.createElement("div");
    root.className = "absolute inset-0";
    root.dataset.widgetId = widget.id;
    root.dataset.widgetState = "loading";
    host.replaceChildren(root);
    setError(undefined);

    let cancelled = false;
    let cleanup: (() => void) | undefined;
    const fail = (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      root.dataset.widgetState = "error";
      root.dataset.widgetError = msg;
      console.error(`[widget ${widget.id}]`, e);
      if (!cancelled) setError(msg);
    };

    (async () => {
      try {
        const mod = await import(/* @vite-ignore */ `${widget.base}widget.js?v=${widget.version}`);
        if (cancelled) return;
        if (typeof mod.default !== "function") throw new Error("widget.js has no default export mount(root, sdk)");
        const result = await (mod.default as Mount)(root, createSdk(widget));
        if (typeof result === "function") cleanup = result as () => void;
        if (cancelled) cleanup?.();
        else root.dataset.widgetState = "mounted";
      } catch (e) {
        fail(e);
      }
    })();

    return () => {
      cancelled = true;
      try {
        cleanup?.();
      } catch {}
      root.remove();
    };
  }, [widget.id, widget.base, widget.version]);

  return (
    <div className="relative flex-1 overflow-hidden">
      <div ref={container} className="absolute inset-0" />
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card p-6 text-center">
          <div className="text-4xl">💥</div>
          <div className="text-sm font-medium">This widget broke</div>
          <div className="line-clamp-3 text-xs text-muted-foreground">{error}</div>
        </div>
      )}
    </div>
  );
}

export const WidgetCard = memo(function WidgetCard(props: {
  widget: Widget;
  highlighted: boolean;
  onLike: (widget: Widget) => void;
}) {
  const { widget: w } = props;
  return (
    <Card
      id={`widget-${w.id}`}
      data-card-id={w.id}
      className={cn(
        "h-[360px] scroll-mt-24 gap-0 overflow-hidden py-0 transition-shadow duration-700",
        props.highlighted && "ring-4 ring-amber-400",
      )}
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <span className="text-base leading-none">{w.emoji ?? "✨"}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium leading-tight" title={w.prompt ?? undefined}>
            {w.title}
          </div>
          <div className="truncate text-[11px] leading-tight text-muted-foreground">
            {w.author && (
              <>
                by <Author name={w.author} />
                {" · "}
              </>
            )}
            {timeAgo(w.createdAt)}
          </div>
        </div>
        {w.fun !== null && <FunBadge fun={w.fun} />}
        <Button
          variant="ghost"
          size="sm"
          className={cn("gap-1 tabular-nums", w.liked && "text-rose-500 hover:text-rose-500")}
          onClick={() => props.onLike(w)}
          aria-label={w.liked ? "Unlike" : "Like"}
          aria-pressed={w.liked}
        >
          <HeartIcon className={cn(w.liked && "fill-current")} />
          {w.likes}
        </Button>
      </div>
      <WidgetBody widget={w} />
    </Card>
  );
});

const X_HANDLE = /^@([A-Za-z0-9_]{1,15})$/;

function Author({ name }: { name: string }) {
  const handle = name.match(X_HANDLE)?.[1];
  if (!handle) return <>{name}</>;
  return (
    <a
      href={`https://x.com/${handle}`}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:text-foreground hover:underline"
    >
      {name}
    </a>
  );
}
