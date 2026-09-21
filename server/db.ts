import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.ts";

fs.mkdirSync(config.dataDir, { recursive: true });

export const db = new DatabaseSync(config.dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS suggestions (
    id TEXT PRIMARY KEY,
    prompt TEXT NOT NULL,
    author TEXT,
    source TEXT NOT NULL DEFAULT 'web',
    status TEXT NOT NULL,
    reason TEXT,
    widget_id TEXT,
    taskfuel_usd REAL,
    llm_tokens INTEGER,
    visitor TEXT,
    ip_hash TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS suggestions_status ON suggestions(status, created_at);
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    suggestion_id TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT,
    at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS events_suggestion ON events(suggestion_id, id);
  CREATE TABLE IF NOT EXISTS widgets (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    emoji TEXT,
    author TEXT,
    prompt TEXT,
    suggestion_id TEXT,
    commit_sha TEXT,
    hidden INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS likes (
    widget_id TEXT NOT NULL,
    ip_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (widget_id, ip_hash)
  );
  CREATE TABLE IF NOT EXISTS score (id INTEGER PRIMARY KEY CHECK (id = 1), value INTEGER NOT NULL);
  INSERT OR IGNORE INTO score (id, value) VALUES (1, 0);
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
`);
// Migrations for databases created before a column existed.
for (const sql of [
  "ALTER TABLE suggestions ADD COLUMN summary TEXT",
  // Set when the suggestion is a follow-up edit of the visitor's own live widget.
  "ALTER TABLE suggestions ADD COLUMN edit_of TEXT",
  // Jev's triage: the fun rating (0-4, shown in the UI) and all raw judgments as JSON (for tuning).
  "ALTER TABLE suggestions ADD COLUMN fun REAL",
  "ALTER TABLE suggestions ADD COLUMN jev TEXT",
]) {
  try {
    db.exec(sql);
  } catch {}
}

export type Status =
  | "pending"
  | "triaging"
  | "accepted"
  | "denied"
  | "building"
  | "testing"
  | "merged"
  | "failed";

export interface Suggestion {
  id: string;
  prompt: string;
  author: string | null;
  source: string;
  status: Status;
  reason: string | null;
  widget_id: string | null;
  taskfuel_usd: number | null;
  llm_tokens: number | null;
  summary: string | null;
  edit_of: string | null;
  fun: number | null;
  jev: string | null;
  visitor: string | null;
  ip_hash: string | null;
  created_at: number;
  updated_at: number;
}

export interface WidgetRow {
  id: string;
  title: string;
  emoji: string | null;
  author: string | null;
  prompt: string | null;
  suggestion_id: string | null;
  commit_sha: string | null;
  hidden: number;
  created_at: number;
}

export interface EventRow {
  id: number;
  suggestion_id: string;
  status: string;
  message: string | null;
  at: number;
}

export const getSuggestion = (id: string) =>
  db.prepare("SELECT * FROM suggestions WHERE id = ?").get(id) as Suggestion | undefined;

export const getSetting = (key: string) =>
  (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value;
