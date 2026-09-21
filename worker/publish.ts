import fs from "node:fs";
import path from "node:path";
import { config } from "../server/config.ts";
import { db } from "../server/db.ts";
import { broadcast } from "../server/sse.ts";
import { FUN_SQL, readManifest, widgetDto } from "../server/widgets.ts";
import type { WidgetRow } from "../server/db.ts";

export const buildDir = (widgetId: string) => path.join(config.builds, widgetId);

/** Move a passing build into the live widgets folder. The rename is atomic, so visitors never see half a widget. */
export function publishWidget(widgetId: string, suggestionId: string) {
  const dir = path.join(config.widgets, widgetId);
  fs.renameSync(buildDir(widgetId), dir);

  const m = readManifest(dir);
  db.prepare(
    `INSERT OR REPLACE INTO widgets (id, title, emoji, author, prompt, suggestion_id, commit_sha, hidden, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
  ).run(widgetId, m?.title || widgetId, m?.emoji ?? null, m?.author ?? null, m?.prompt ?? null, suggestionId, String(Date.now()), Date.now());
  broadcastWidget(widgetId);
}

/** Swap an edited build in for the live widget. It keeps its id, likes, owner and place; the new version reloads live. */
export function publishEdit(widgetId: string) {
  const dir = path.join(config.widgets, widgetId);
  const old = path.join(config.builds, `${widgetId}.old-${Date.now()}`);
  fs.renameSync(dir, old);
  fs.renameSync(buildDir(widgetId), dir);
  fs.rmSync(old, { recursive: true, force: true });

  const m = readManifest(dir);
  db.prepare("UPDATE widgets SET title = ?, emoji = ?, prompt = ?, commit_sha = ? WHERE id = ?").run(
    m?.title || widgetId,
    m?.emoji ?? null,
    m?.prompt ?? null,
    String(Date.now()),
    widgetId,
  );
  broadcastWidget(widgetId);
}

function broadcastWidget(widgetId: string) {
  const row = db.prepare(`SELECT w.*, ${FUN_SQL} FROM widgets w WHERE w.id = ?`).get(widgetId) as unknown as WidgetRow & {
    fun: number | null;
  };
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM likes WHERE widget_id = ?").get(widgetId) as { n: number };
  // `liked` is per viewer, so leave it out and let each client keep its own.
  const { liked: _, ...dto } = widgetDto({ ...row, likes: n });
  broadcast("widget.added", dto);
}

export function removeBuild(widgetId: string) {
  fs.rmSync(buildDir(widgetId), { recursive: true, force: true });
}
