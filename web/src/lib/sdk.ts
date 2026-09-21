import { toast } from "sonner";
import { api } from "./api";
import { getTheme, onThemeChange, scoreStore } from "./live";
import { visitorId } from "./storage";
import type { Widget } from "./types";

// The pre-merge load test clicks buttons, and those clicks must not change the real global score.
const isPreview = new URLSearchParams(location.search).has("preview");

/** The object passed to every widget's mount(root, sdk). Keep in sync with sdk/sdk.d.ts. */
export function createSdk(w: Widget) {
  const prefix = `wd:${w.id}:`;
  return {
    id: w.id,
    visitor: visitorId,
    // Legacy: no longer documented for new widgets (the global score was removed from the UI),
    // but kept so widgets built earlier still work.
    score: {
      get: () => scoreStore.get(),
      add: async (delta: number) => {
        if (isPreview) {
          scoreStore.set(scoreStore.get() + (Math.trunc(Number(delta)) || 0));
          return scoreStore.get();
        }
        const value = await api.addScore(Number(delta) || 0);
        scoreStore.set(value);
        return value;
      },
      subscribe: (cb: (v: number) => void) => scoreStore.subscribe(cb),
    },
    store: {
      get<T>(key: string, fallback?: T): T {
        try {
          const raw = localStorage.getItem(prefix + key);
          return raw == null ? (fallback as T) : JSON.parse(raw);
        } catch {
          return fallback as T;
        }
      },
      set(key: string, value: unknown) {
        try {
          localStorage.setItem(prefix + key, JSON.stringify(value));
        } catch {}
      },
    },
    asset: (path: string) => new URL(String(path).replace(/^\.?\//, ""), location.origin + w.base).href,
    toast: (text: string) => toast(`${w.emoji ?? "✨"} ${String(text).slice(0, 140)}`),
    get theme() {
      return getTheme();
    },
    onThemeChange,
    tools: {
      async twitterSearch(query: string) {
        const res = await fetch(`/api/tools/twitter-search?q=${encodeURIComponent(String(query))}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? `Tweet search failed (${res.status})`);
        return json.tweets;
      },
    },
  };
}
