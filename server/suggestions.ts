import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.ts";
import { db, getSuggestion, type EventRow, type Status, type Suggestion } from "./db.ts";
import { broadcast } from "./sse.ts";

export const suggestionDto = (s: Suggestion) => ({
  id: s.id,
  prompt: s.prompt,
  author: s.author,
  source: s.source,
  status: s.status,
  reason: s.reason,
  widgetId: s.widget_id,
  summary: s.summary,
  editOf: s.edit_of,
  fun: s.fun,
  tokens: s.llm_tokens,
  createdAt: s.created_at,
  updatedAt: s.updated_at,
});

export function createSuggestion(input: {
  prompt: string;
  author: string | null;
  visitor: string | null;
  ipHash: string;
  editOf?: string;
}) {
  const now = Date.now();
  const id = `s_${now.toString(36)}${crypto.randomBytes(3).toString("hex")}`;
  db.prepare(
    `INSERT INTO suggestions (id, prompt, author, status, visitor, ip_hash, edit_of, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
  ).run(id, input.prompt, input.author, input.visitor, input.ipHash, input.editOf ?? null, now, now);
  addEvent(id, "pending", "Submitted");
  const s = getSuggestion(id)!;
  broadcast("suggestion.updated", suggestionDto(s));
  return s;
}

function addEvent(id: string, status: string, message?: string) {
  const at = Date.now();
  const r = db
    .prepare("INSERT INTO events (suggestion_id, status, message, at) VALUES (?, ?, ?, ?)")
    .run(id, status, message ?? null, at);
  return { id: Number(r.lastInsertRowid), suggestion_id: id, status, message: message ?? null, at };
}

/** The only way status changes: every transition is an event row + an SSE broadcast. */
export function setStatus(
  id: string,
  status: Status,
  message?: string,
  fields: Partial<Pick<Suggestion, "reason" | "widget_id" | "taskfuel_usd" | "llm_tokens" | "summary" | "fun" | "jev">> = {},
) {
  const sets = ["status = ?", "updated_at = ?"];
  const values: (string | number | null)[] = [status, Date.now()];
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k} = ?`);
    values.push(v ?? null);
  }
  db.prepare(`UPDATE suggestions SET ${sets.join(", ")} WHERE id = ?`).run(...values, id);
  const event = addEvent(id, status, message);
  const s = getSuggestion(id)!;
  jobLog(id, `STATUS ${status}${message ? `: ${message}` : ""}`);
  broadcast("suggestion.updated", { ...suggestionDto(s), event });
  return s;
}

/** A user-facing step in the build timeline (e.g. "Generating image") that doesn't change the status. */
export function addStep(id: string, message: string) {
  const s = getSuggestion(id);
  if (!s) return;
  const event = addEvent(id, s.status, message);
  jobLog(id, `STEP ${message}`);
  broadcast("suggestion.updated", { ...suggestionDto(s), event });
}

/** Live token count while a build runs. Not a timeline event, so it doesn't clutter the timeline. */
export function setTokens(id: string, tokens: number) {
  db.prepare("UPDATE suggestions SET llm_tokens = ? WHERE id = ?").run(tokens, id);
  broadcast("suggestion.tokens", { id, tokens });
}

export function listSuggestions(opts: { before?: number; limit: number; ids?: string[] }) {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (opts.before) {
    where.push("created_at < ?");
    args.push(opts.before);
  }
  if (opts.ids) {
    where.push(`id IN (${opts.ids.map(() => "?").join(",") || "''"})`);
    args.push(...opts.ids);
  }
  const sql = `SELECT * FROM suggestions ${where.length ? "WHERE " + where.join(" AND ") : ""}
               ORDER BY created_at DESC LIMIT ?`;
  return (db.prepare(sql).all(...args, opts.limit) as unknown as Suggestion[]).map(suggestionDto);
}

export const listEvents = (id: string) =>
  db.prepare("SELECT * FROM events WHERE suggestion_id = ? ORDER BY id").all(id) as unknown as EventRow[];

export const jobLogFile = (id: string) => path.join(config.logs, `${id}.log`);

/**
 * Private, human-readable job log: data/logs/<id>.log, also echoed to the server console.
 * `full` goes only to the file (e.g. model thinking); the console gets a one-line preview.
 */
export function jobLog(id: string, text: string, full?: string) {
  const ts = new Date().toISOString();
  fs.mkdirSync(config.logs, { recursive: true });
  fs.appendFileSync(jobLogFile(id), `${ts} ${full ?? text}\n`);
  const oneLine = text.replace(/\s+/g, " ");
  console.log(`[job ${id}] ${oneLine.length > 240 ? oneLine.slice(0, 240) + "…" : oneLine}`);
}

/** Build progress (tool calls, model text, errors). Backend only: never sent to the frontend. */
export function appendLog(id: string, kind: "tool" | "text" | "info" | "error", text: string) {
  jobLog(id, `${kind.toUpperCase()} ${text}`);
}
