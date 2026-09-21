/**
 * The SDK every Infinite Dash widget receives as the second argument of `mount(root, sdk)`.
 *
 *   export default function mount(root: HTMLElement, sdk: SDK): void | (() => void)
 */
export interface SDK {
  /** This widget's id (also its folder name). */
  id: string;
  /** Anonymous, stable id of the current visitor (per browser). */
  visitor: string;

  /** Per-widget, per-visitor persistent storage (localStorage under the hood, JSON values). */
  store: {
    get<T = unknown>(key: string, fallback?: T): T;
    set(key: string, value: unknown): void;
  };

  /** Absolute URL of a file inside this widget's folder, e.g. sdk.asset("assets/quack.mp3"). */
  asset(path: string): string;

  /** Show a small toast notification at the bottom of the page. */
  toast(text: string): void;

  /** Current colour scheme (follows the visitor's system setting). */
  theme: "light" | "dark";
  /** Called when the colour scheme changes. Returns an unsubscribe fn. */
  onThemeChange(cb: (theme: "light" | "dark") => void): () => void;

  /** Live data APIs, paid by the dashboard. Results are cached ~10 minutes and shared by all visitors. */
  tools: {
    /**
     * Search X/Twitter, newest first (up to 20 tweets). The query supports:
     * keywords ("cats"), "$BTC" cashtags, "from:NASA" (a user's own tweets),
     * "@NASA" (tweets mentioning them), OR, and -is:retweet.
     * Rejects when the search fails or is rate limited, so always catch.
     */
    twitterSearch(query: string): Promise<Tweet[]>;
  };
}

export interface Tweet {
  id: string;
  /** Link to the tweet on x.com */
  url: string;
  text: string;
  /** "@handle" */
  author: string;
  /** ISO timestamp */
  createdAt: string;
  likes: number;
  retweets: number;
  replies: number;
}
