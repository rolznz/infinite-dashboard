import fs from "node:fs";
import path from "node:path";
import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { config } from "../server/config.ts";
import { taskfuelCall } from "./taskfuel.ts";

// Dedicated TaskFuel tools. The agent never sees the TaskFuel API itself: small models got stuck
// browsing the catalog and hand-writing curl calls, so it gets a few tools that just work.

const IMAGE_URL = "https://stablestudio.dev/api/generate/gpt-image-2.5-flare/generate";
const IMAGE_QUALITY = "high"; // $0.05 per image (medium is $0.01)
const SOUND_URL = "https://blockrun.ai/api/v1/audio/sound-effects"; // $0.0535 flat
const TWEET_SEARCH_URL = "https://x402.ottoai.services/tweet-search"; // $0.005 per search

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }], details: {} });

/** A safe, unused file name in assets/, e.g. "assets/duck-2.webp". */
function assetPath(dir: string, name: string | undefined, fallback: string, ext: string) {
  const base =
    String(name ?? "")
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || fallback;
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
  let rel = `assets/${base}.${ext}`;
  for (let i = 2; fs.existsSync(path.join(dir, rel)); i++) rel = `assets/${base}-${i}.${ext}`;
  return rel;
}

async function download(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/** First http(s) URL anywhere in a JSON value (providers nest file URLs differently). */
function findUrl(v: unknown): string | undefined {
  if (typeof v === "string") return /^https?:\/\//.test(v) ? v : undefined;
  if (v && typeof v === "object") {
    for (const x of Object.values(v)) {
      const u = findUrl(x);
      if (u) return u;
    }
  }
  return undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const kb = (n: number) => `${Math.round(n / 1024)} KB`;

/** Build-time tools for one widget build. `spentUsd()` is the TaskFuel total, written to the manifest. */
export function createBuildTools(
  widgetDir: string,
  { log, step }: { log: (line: string) => void; /** User-facing line in the web app's build log. */ step: (message: string) => void },
) {
  let spent = 0;
  const charge = (usd: number) => {
    spent += usd;
    return `Cost $${usd.toFixed(4)}. Spent so far on this widget: $${spent.toFixed(4)} of the $1.00 budget.`;
  };

  const createImage = defineTool({
    name: "create_image",
    label: "Create image",
    description:
      "Generate one image (GPT Image 2.5) and save it into ./assets/. Returns the saved file path, e.g. assets/duck.webp. " +
      "Use it in widget.js with sdk.asset(\"assets/duck.webp\"). Takes ~20-60 seconds. Costs $0.05.",
    parameters: Type.Object({
      prompt: Type.String({ description: "Detailed description of the image: subject, style, colors, composition." }),
      name: Type.Optional(Type.String({ description: "Short file name without extension, e.g. \"duck\"." })),
      shape: Type.Optional(
        Type.Union([Type.Literal("square"), Type.Literal("landscape"), Type.Literal("portrait")], {
          description: "Default square (1024x1024). landscape is 1536x1024, portrait is 1024x1536.",
        }),
      ),
      transparent: Type.Optional(
        Type.Boolean({ description: "Transparent background (for stickers, sprites, characters). Default false." }),
      ),
    }),
    executionMode: "sequential",
    async execute(_id, p, signal) {
      const size = { square: "1024x1024", landscape: "1536x1024", portrait: "1024x1536" }[p.shape ?? "square"];
      step("Generating image");
      log(`create_image: ${size}${p.transparent ? " transparent" : ""} "${p.prompt.slice(0, 120)}"`);
      const job = await taskfuelCall({
        url: IMAGE_URL,
        method: "POST",
        body: {
          prompt: p.prompt,
          size,
          quality: IMAGE_QUALITY,
          background: p.transparent ? "transparent" : "opaque",
          output_format: "webp",
          output_compression: 80,
        },
        maxAmountUsd: 0.1,
      });
      const cost = charge(job.costUsd);
      const { pollUrl } = job.json<{ pollUrl?: string }>();
      if (!pollUrl) throw new Error(`No job returned: ${job.body.toString("utf8").slice(0, 200)}. ${cost}`);

      // Polling the job is free. Never resubmit a pending job: that would pay twice.
      const deadline = Date.now() + 5 * 60_000;
      while (Date.now() < deadline) {
        if (signal?.aborted) throw new Error(`Aborted. ${cost}`);
        await sleep(4000);
        let s: { status?: string; result?: { imageUrl?: string }; error?: string | null };
        try {
          s = (await taskfuelCall({ url: pollUrl, timeoutMs: 30_000 })).json();
        } catch {
          continue; // transient poll error, keep waiting
        }
        if (s.status === "failed") throw new Error(`Image generation failed: ${s.error ?? "unknown"}. ${cost}`);
        if (s.status === "complete") {
          const url = s.result?.imageUrl ?? findUrl(s.result);
          if (!url) throw new Error(`Image finished without a URL. ${cost}`);
          const buf = await download(url);
          const rel = assetPath(widgetDir, p.name, "image", "webp");
          fs.writeFileSync(path.join(widgetDir, rel), buf);
          log(`create_image: saved ${rel} (${kb(buf.length)})`);
          return text(`Saved ${rel} (${size}, ${kb(buf.length)}). Use sdk.asset("${rel}"). ${cost}`);
        }
      }
      throw new Error(`Image generation timed out. ${cost}`);
    },
  });

  const createSoundEffect = defineTool({
    name: "create_sound_effect",
    label: "Create sound effect",
    description:
      "Generate one sound effect (ElevenLabs) and save it into ./assets/ as mp3. Returns the saved file path, e.g. assets/pop.mp3. " +
      "Play it in widget.js with new Audio(sdk.asset(\"assets/pop.mp3\")).play() after a user click. Costs $0.0535.",
    parameters: Type.Object({
      prompt: Type.String({ description: "Description of the sound, e.g. \"cartoon rubber duck squeak\"." }),
      name: Type.Optional(Type.String({ description: "Short file name without extension, e.g. \"squeak\"." })),
      duration_seconds: Type.Optional(
        Type.Number({ minimum: 0.5, maximum: 22, description: "Length in seconds (0.5-22). Omit to let the model decide." }),
      ),
    }),
    executionMode: "sequential",
    async execute(_id, p) {
      step("Generating sound effect");
      log(`create_sound_effect: ${p.duration_seconds ?? "auto"}s "${p.prompt.slice(0, 120)}"`);
      const r = await taskfuelCall({
        url: SOUND_URL,
        method: "POST",
        body: {
          text: p.prompt,
          response_format: "mp3",
          ...(p.duration_seconds ? { duration_seconds: p.duration_seconds } : {}),
        },
        maxAmountUsd: 0.1,
      });
      const cost = charge(r.costUsd);
      let buf: Buffer;
      if (r.contentType.startsWith("audio/")) buf = r.body;
      else {
        const url = findUrl(r.json());
        if (!url) throw new Error(`No audio in response: ${r.body.toString("utf8").slice(0, 200)}. ${cost}`);
        buf = url.startsWith("data:") ? Buffer.from(url.split(",")[1], "base64") : await download(url);
      }
      const rel = assetPath(widgetDir, p.name, "sound", "mp3");
      fs.writeFileSync(path.join(widgetDir, rel), buf);
      log(`create_sound_effect: saved ${rel} (${kb(buf.length)})`);
      return text(`Saved ${rel} (${kb(buf.length)}). Play it with new Audio(sdk.asset("${rel}")).play(). ${cost}`);
    },
  });

  return { tools: [createImage, createSoundEffect], spentUsd: () => Math.round(spent * 10000) / 10000 };
}

// ---------- runtime APIs (called by widgets in the browser via /api/tools/*) ----------

export interface Tweet {
  id: string;
  url: string;
  text: string;
  author: string;
  createdAt: string;
  likes: number;
  retweets: number;
  replies: number;
}

const TWEET_CACHE_MS = 10 * 60_000;
const tweetCache = new Map<string, { at: number; tweets: Promise<Tweet[]> }>();
const paidCalls: number[] = [];

export class ToolError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Every visitor shares one cached result per query, so a popular widget costs one search per 10 minutes. */
export function twitterSearch(rawQuery: string): Promise<Tweet[]> {
  const query = rawQuery.trim().replace(/\s+/g, " ");
  if (!query || query.length > 200) throw new ToolError(400, "query must be 1-200 characters");
  if (!config.taskfuelEnabled) throw new ToolError(503, "Tweet search is not available right now");
  const key = query.toLowerCase();
  const hit = tweetCache.get(key);
  if (hit && Date.now() - hit.at < TWEET_CACHE_MS) return hit.tweets;

  const hourAgo = Date.now() - 3_600_000;
  while (paidCalls.length && paidCalls[0] < hourAgo) paidCalls.shift();
  if (paidCalls.length >= config.toolCallsPerHour) {
    if (hit) return hit.tweets; // stale is better than nothing
    throw new ToolError(429, "Too many searches right now, try again soon");
  }
  paidCalls.push(Date.now());

  const tweets = taskfuelCall({ url: `${TWEET_SEARCH_URL}?${new URLSearchParams({ query })}`, maxAmountUsd: 0.02 }).then(
    (r) => {
      const j = r.json<{ status?: string; data?: { tweets?: Partial<Tweet>[] } }>();
      console.log(`[tools] twitter-search "${query}" cost $${r.costUsd} → ${j.data?.tweets?.length ?? 0} tweets`);
      return (j.data?.tweets ?? []).slice(0, 20).map((t) => ({
        id: String(t.id ?? ""),
        url: String(t.url ?? ""),
        text: String(t.text ?? ""),
        author: String(t.author ?? ""),
        createdAt: String(t.createdAt ?? ""),
        likes: Number(t.likes) || 0,
        retweets: Number(t.retweets) || 0,
        replies: Number(t.replies) || 0,
      }));
    },
  );
  tweetCache.set(key, { at: Date.now(), tweets });
  // Don't cache failures.
  tweets.catch((e) => {
    console.warn(`[tools] twitter-search "${query}" failed: ${e.message}`);
    if (tweetCache.get(key)?.tweets === tweets) tweetCache.delete(key);
  });
  return tweets;
}
