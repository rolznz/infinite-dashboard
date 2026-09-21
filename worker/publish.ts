import fs from "node:fs";
import path from "node:path";
import { config } from "../server/config.ts";
import { db } from "../server/db.ts";
import { broadcast } from "../server/sse.ts";
import { readManifest, widgetDto } from "../server/widgets.ts";
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
  const row = db.prepare("SELECT * FROM widgets WHERE id = ?").get(widgetId) as unknown as WidgetRow;
  broadcast("widget.added", widgetDto(row));
}

export function removeBuild(widgetId: string) {
  fs.rmSync(buildDir(widgetId), { recursive: true, force: true });
}
