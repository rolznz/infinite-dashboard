import fs from "node:fs";
import path from "node:path";
import { config } from "./config.ts";
import { db, type WidgetRow } from "./db.ts";
import { git, gitOk } from "./git.ts";

export interface Manifest {
  id: string;
  title: string;
  emoji?: string;
  prompt?: string;
  author?: string | null;
  createdAt?: string;
  taskfuelUsd?: number;
}

const README = `# Infinite Dash widgets

Every folder in \`widgets/\` is one widget on https://infinitedash.lol, built autonomously by an
AI agent from a user's prompt. Each widget is a plain ES module (\`widget.js\`) plus a
\`manifest.json\`, loaded at runtime by the dashboard with no redeploys.
`;

export async function initWidgetsRepo() {
  const repo = config.widgetsRepo;
  for (const dir of [config.worktrees, config.logs, config.shots, config.piAgentDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(path.join(repo, ".git"))) {
    if (config.widgetsRemote) {
      await git(config.dataDir, "clone", config.widgetsRemote, repo);
      if (!(await gitOk(repo, "rev-parse", "--verify", "master"))) await seedRepo(repo, true);
    } else {
      fs.mkdirSync(repo, { recursive: true });
      await git(repo, "init", "-b", "master");
      await seedRepo(repo, false);
    }
  }
  // Interrupted builds leave stale worktrees behind.
  await gitOk(repo, "worktree", "prune");
  syncWidgetsFromRepo();
}

async function seedRepo(repo: string, push: boolean) {
  fs.writeFileSync(path.join(repo, "README.md"), README);
  fs.mkdirSync(path.join(repo, "widgets"), { recursive: true });
  fs.writeFileSync(path.join(repo, "widgets", ".gitkeep"), "");
  await git(repo, "add", "-A");
  await git(repo, "commit", "-m", "Initial commit");
  if (push) await git(repo, "push", "-u", "origin", "master");
}

export function readManifest(dir: string): Manifest | undefined {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  } catch {
    return undefined;
  }
}

/** The widget list is the list of folders on master; mirror it into SQLite. */
export function syncWidgetsFromRepo() {
  const dir = path.join(config.widgetsRepo, "widgets");
  if (!fs.existsSync(dir)) return;
  const insert = db.prepare(
    `INSERT OR IGNORE INTO widgets (id, title, emoji, author, prompt, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const id of fs.readdirSync(dir)) {
    const m = readManifest(path.join(dir, id));
    if (!m || !fs.existsSync(path.join(dir, id, "widget.js"))) continue;
    insert.run(id, m.title || id, m.emoji ?? null, m.author ?? null, m.prompt ?? null, Date.parse(m.createdAt ?? "") || Date.now());
  }
}

export type WidgetWithLikes = WidgetRow & { likes: number; liked: number };

/** Most liked first, then newest. */
export function listWidgets(ipHash = ""): WidgetWithLikes[] {
  return db
    .prepare(
      `SELECT w.*,
         (SELECT COUNT(*) FROM likes l WHERE l.widget_id = w.id) AS likes,
         EXISTS (SELECT 1 FROM likes l WHERE l.widget_id = w.id AND l.ip_hash = ?) AS liked
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

export const widgetDto = (w: WidgetRow & { likes?: number; liked?: number }, base = `/w/${w.id}/`) => ({
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
});
