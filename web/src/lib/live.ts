import { visitorId } from "./storage";

type Handler = (data: any) => void;

const handlers = new Map<string, Set<Handler>>();
let source: EventSource | undefined;

/** One shared SSE connection for the whole page. EventSource reconnects on its own. */
function connect() {
  if (source) return;
  source = new EventSource(`/api/events?visitor=${encodeURIComponent(visitorId)}`);
  for (const event of handlers.keys()) attach(event);
}

const attached = new Set<string>();
function attach(event: string) {
  if (!source || attached.has(event)) return;
  attached.add(event);
  source.addEventListener(event, (e) => {
    const data = JSON.parse((e as MessageEvent).data);
    for (const h of handlers.get(event) ?? []) h(data);
  });
}

export function on(event: string, handler: Handler) {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event)!.add(handler);
  connect();
  attach(event);
  return () => handlers.get(event)!.delete(handler);
}

// Global score store, shared by the header and every widget's SDK.
let score = 0;
const scoreSubs = new Set<(v: number) => void>();
export const scoreStore = {
  get: () => score,
  set(v: number) {
    if (v === score) return;
    score = v;
    for (const s of scoreSubs) s(v);
  },
  subscribe(cb: (v: number) => void) {
    scoreSubs.add(cb);
    return () => void scoreSubs.delete(cb);
  },
};
on("hello", (d) => scoreStore.set(d.score));
on("score", (d) => scoreStore.set(d.value));

// System colour scheme (the inline script in index.html applies the `dark` class).
const media = window.matchMedia("(prefers-color-scheme: dark)");
export const getTheme = (): "light" | "dark" => (media.matches ? "dark" : "light");
export function onThemeChange(cb: (t: "light" | "dark") => void) {
  const h = () => cb(getTheme());
  media.addEventListener("change", h);
  return () => media.removeEventListener("change", h);
}
