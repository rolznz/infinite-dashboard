import fs from "node:fs";
import path from "node:path";
import { config } from "./config.ts";
import { db, type WidgetRow } from "./db.ts";

export interface Manifest {
  id: string;
  title: string;
  emoji?: string;
  prompt?: string;
  author?: string | null;
  createdAt?: string;
  taskfuelUsd?: number;
}

export function initDataDirs() {
  for (const dir of [config.widgets, config.builds, config.logs, config.shots, config.piAgentDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  syncWidgetsFromDisk();
}

export function readManifest(dir: string): Manifest | undefined {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  } catch {
    return undefined;
  }
}

/** The widget list is the list of widget folders; mirror it into SQLite. */
function syncWidgetsFromDisk() {
  const dir = config.widgets;
  const insert = db.prepare(
    `INSERT OR IGNORE INTO widgets (id, title, emoji, author, prompt, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const id of fs.readdirSync(dir)) {
    const m = readManifest(path.join(dir, id));
    if (!m || !fs.existsSync(path.join(dir, id, "widget.js"))) continue;
    insert.run(id, m.title || id, m.emoji ?? null, m.author ?? null, m.prompt ?? null, Date.parse(m.createdAt ?? "") || Date.now());
  }
}

export type WidgetWithLikes = WidgetRow & { likes: number; liked: number; fun: number | null };

/** Jev's fun rating of the idea that created the widget. */
export const FUN_SQL = "(SELECT s.fun FROM suggestions s WHERE s.id = w.suggestion_id) AS fun";

/** Most liked first, then newest. */
export function listWidgets(ipHash = ""): WidgetWithLikes[] {
  return db
    .prepare(
      `SELECT w.*,
         (SELECT COUNT(*) FROM likes l WHERE l.widget_id = w.id) AS likes,
         EXISTS (SELECT 1 FROM likes l WHERE l.widget_id = w.id AND l.ip_hash = ?) AS liked,
         ${FUN_SQL}
       FROM widgets w WHERE w.hidden = 0
       ORDER BY likes DESC, w.created_at DESC`,
    )
    .all(ipHash) as unknown as WidgetWithLikes[];
}

export function toggleLike(widgetId: string, ipHash: string) {
  const exists = db.prepare("SELECT 1 FROM likes WHERE widget_id = ? AND ip_hash = ?").get(widgetId, ipHash);
  if (exists) db.prepare("DELETE FROM likes WHERE widget_id = ? AND ip_hash = ?").run(widgetId, ipHash);
  else db.prepare("INSERT INTO likes (widget_id, ip_hash, created_at) VALUES (?, ?, ?)").run(widgetId, ipHash, Date.now());
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM likes WHERE widget_id = ?").get(widgetId) as { n: number };
  return { likes: n, liked: !exists };
}

export const widgetDto = (w: WidgetRow & { likes?: number; liked?: number; fun?: number | null }, base = `/w/${w.id}/`) => ({
  id: w.id,
  title: w.title,
  emoji: w.emoji,
  author: w.author,
  prompt: w.prompt,
  createdAt: w.created_at,
  base,
  version: w.commit_sha ?? "0",
  likes: w.likes ?? 0,
  liked: !!w.liked,
  fun: w.fun ?? null,
});
