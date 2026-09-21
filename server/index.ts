import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { config } from "./config.ts";
import { db, getSuggestion, type WidgetRow } from "./db.ts";
import { onlineCount, broadcast, sseHandler } from "./sse.ts";
import { createSuggestion, listEvents, listSuggestions, suggestionDto } from "./suggestions.ts";
import { initDataDirs, listWidgets, toggleLike, widgetDto } from "./widgets.ts";
import { cancelSuggestion, startOrchestrator } from "../worker/orchestrator.ts";
import { checkModelAvailable } from "../worker/build.ts";
import { llmComplete, ToolError, twitterSearch } from "../worker/tools.ts";

initDataDirs();

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "32kb" }));

const isLocal = (req: Request) =>
  ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "") &&
  !req.headers["fly-client-ip"];

const getScore = () => (db.prepare("SELECT value FROM score WHERE id = 1").get() as { value: number }).value;

// ---------- widget files (no build step: served straight from disk) ----------
const widgetStatic = (root: string) =>
  express.static(root, {
    fallthrough: false,
    setHeaders: (res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "no-cache");
    },
  });
app.use("/w", widgetStatic(config.widgets));
// Unmerged widgets for the pre-merge load test. Only reachable from this machine.
app.use("/w-preview", (req, res, next) => (isLocal(req) ? next() : res.status(404).end()), widgetStatic(config.builds));

// ---------- API ----------
app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

const clientIp = (req: Request) => String(req.headers["fly-client-ip"] ?? req.ip ?? "unknown");
const ipHash = (req: Request) => crypto.createHash("sha256").update(`infinitedash:${clientIp(req)}`).digest("hex").slice(0, 24);

app.get("/api/widgets", (req, res) => {
  const widgets = listWidgets(ipHash(req)).map((w) => widgetDto(w));
  const preview = String(req.query.preview ?? "");
  if (preview && isLocal(req) && /^[a-z0-9-]+$/.test(preview)) {
    const manifestPath = path.join(config.builds, preview, "manifest.json");
    let m: { title?: string; emoji?: string; author?: string; prompt?: string } = {};
    try {
      m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch {}
    const row: WidgetRow = {
      id: preview,
      title: m.title || preview,
      emoji: m.emoji ?? null,
      author: m.author ?? null,
      prompt: m.prompt ?? null,
      suggestion_id: null,
      commit_sha: String(Date.now()),
      hidden: 0,
      created_at: Date.now(),
    };
    // An edit previews in place of its live version.
    res.json({ widgets: [widgetDto(row, `/w-preview/${preview}/`), ...widgets.filter((w) => w.id !== preview)] });
    return;
  }
  res.json({ widgets });
});

// One like per hashed IP per widget; liking again removes it.
app.post("/api/widgets/:id/like", (req, res) => {
  const w = db.prepare("SELECT id FROM widgets WHERE id = ? AND hidden = 0").get(req.params.id);
  if (!w) return res.status(404).json({ error: "Not found" });
  const result = toggleLike(req.params.id, ipHash(req));
  broadcast("widget.likes", { id: req.params.id, likes: result.likes });
  res.json(result);
});

app.get("/api/score", (_req, res) => {
  res.json({ value: getScore() });
});

app.post("/api/score", (req, res) => {
  const delta = Math.max(-100, Math.min(100, Math.trunc(Number(req.body?.delta) || 0)));
  if (delta !== 0) {
    db.prepare("UPDATE score SET value = value + ? WHERE id = 1").run(delta);
    broadcast("score", { value: getScore() });
  }
  res.json({ value: getScore() });
});

app.get("/api/events", sseHandler(() => ({ score: getScore() })));

app.get("/api/online", (_req, res) => {
  res.json({ count: onlineCount() });
});

const submits = new Map<string, number[]>();

app.post("/api/suggestions", (req, res) => {
  const prompt = String(req.body?.prompt ?? "").trim().replace(/\s+/g, " ");
  const author = String(req.body?.author ?? "").trim().slice(0, 40) || null;
  const visitor = String(req.body?.visitor ?? "").slice(0, 64) || null;
  const editOf = String(req.body?.editOf ?? "") || undefined;
  if (prompt.length < (editOf ? 3 : 10) || prompt.length > 300) {
    const what = editOf ? "Your change should be between 3" : "Your idea should be between 10";
    return res.status(400).json({ error: `${what} and 300 characters.` });
  }
  const ip = ipHash(req);
  const hourAgo = Date.now() - 3_600_000;
  const recent = (submits.get(ip) ?? []).filter((t) => t > hourAgo);
  if (recent.length >= config.submitsPerIpPerHour) {
    return res.status(429).json({ error: "Whoa, lots of ideas! Try again in a bit." });
  }
  const pending = db
    .prepare("SELECT COUNT(*) AS n FROM suggestions WHERE status IN ('pending','triaging','accepted')")
    .get() as { n: number };
  if (pending.n >= config.maxPending) {
    return res.status(503).json({ error: "The build queue is full right now. Try again soon." });
  }
  if (editOf) {
    // Only the visitor who built a widget can edit it, one edit at a time.
    const owner = db
      .prepare(
        `SELECT s.visitor FROM widgets w JOIN suggestions s ON s.id = w.suggestion_id WHERE w.id = ? AND w.hidden = 0`,
      )
      .get(editOf) as { visitor: string | null } | undefined;
    if (!owner || !visitor || owner.visitor !== visitor) {
      return res.status(403).json({ error: "You can only edit widgets you built." });
    }
    const busy = db
      .prepare(`SELECT id FROM suggestions WHERE edit_of = ? AND status IN ('pending','triaging','accepted','building','testing')`)
      .get(editOf);
    if (busy) return res.status(409).json({ error: "This widget is already being edited. Wait for that change to finish." });
  }
  // Forks start from a live widget's prompt; they must change it, not rebuild the same thing.
  const live = !editOf && db
    .prepare("SELECT id FROM widgets WHERE hidden = 0 AND lower(trim(prompt)) = lower(?)")
    .get(prompt);
  if (live) return res.status(409).json({ error: "That exact idea is already live! Change it a bit to make it your own." });
  const dup = !editOf && db
    .prepare(
      `SELECT id FROM suggestions WHERE lower(prompt) = lower(?) AND created_at > ? AND status NOT IN ('failed','denied')`,
    )
    .get(prompt, Date.now() - 86_400_000);
  if (dup) return res.status(409).json({ error: "Someone already suggested exactly that!" });

  recent.push(Date.now());
  submits.set(ip, recent);
  const s = createSuggestion({ prompt, author, visitor, ipHash: ip, editOf });
  res.status(201).json(suggestionDto(s));
});

// Only a visitor's own builds (ids kept in their browser); there is no public list of prompts.
app.get("/api/suggestions", (req, res) => {
  const ids = String(req.query.ids ?? "").split(",").filter(Boolean).slice(0, 200);
  res.json({ suggestions: ids.length ? listSuggestions({ limit: 200, ids }) : [] });
});

app.get("/api/suggestions/:id", (req, res) => {
  const s = getSuggestion(req.params.id);
  if (!s) return res.status(404).json({ error: "Not found" });
  const events = listEvents(s.id).map((e) => ({ id: e.id, status: e.status, message: e.message, at: e.at }));
  res.json({ suggestion: suggestionDto(s), events });
});

// Only the visitor who submitted a build can cancel it.
app.post("/api/suggestions/:id/cancel", (req, res) => {
  const s = getSuggestion(req.params.id);
  const visitor = String(req.body?.visitor ?? "");
  if (!s || !visitor || s.visitor !== visitor) return res.status(404).json({ error: "Not found" });
  if (!["pending", "triaging", "accepted", "building", "testing"].includes(s.status)) {
    return res.status(409).json({ error: "This build has already finished." });
  }
  cancelSuggestion(s.id);
  res.json({ ok: true });
});

// ---------- runtime tools for widgets (paid via TaskFuel on the server, cached and capped) ----------
app.get("/api/tools/twitter-search", async (req, res) => {
  try {
    res.json({ tweets: await twitterSearch(String(req.query.q ?? "")) });
  } catch (e) {
    const status = e instanceof ToolError ? e.status : 502;
    res.status(status).json({ error: e instanceof ToolError ? e.message : "Tweet search failed, try again later" });
  }
});

app.post("/api/tools/llm", async (req, res) => {
  try {
    res.json({ text: await llmComplete(req.body ?? {}, clientIp(req)) });
  } catch (e) {
    const status = e instanceof ToolError ? e.status : 502;
    res.status(status).json({ error: e instanceof ToolError ? e.message : "The AI failed, try again later" });
  }
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);
  const status = (err as { status?: number }).status ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).end();
});

// ---------- frontend ----------
if (config.isProd) {
  const dist = path.join(config.root, "dist");
  app.use(express.static(dist));
  app.get("/{*splat}", (_req, res) => res.sendFile(path.join(dist, "index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    configFile: path.join(config.root, "vite.config.ts"),
    // Own HMR port per server port, so several dev servers can run side by side.
    server: { middlewareMode: true, hmr: { port: config.port + 16000 } },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

app.listen(config.port, () => {
  console.log(`Infinite Dash on http://localhost:${config.port}`);
  checkModelAvailable().catch((e) => console.warn("[model check]", e.message));
  startOrchestrator();
});
