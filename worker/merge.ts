import fs from "node:fs";
import path from "node:path";
import { config } from "../server/config.ts";
import { db } from "../server/db.ts";
import { git, gitOk } from "../server/git.ts";
import { broadcast } from "../server/sse.ts";
import { readManifest, widgetDto } from "../server/widgets.ts";
import type { WidgetRow } from "../server/db.ts";

let chain: Promise<unknown> = Promise.resolve();

/** Merges run one at a time. Widgets live in separate folders, so they never conflict. */
export function mergeWidget(widgetId: string, suggestionId: string) {
  const p = chain.then(() => doMerge(widgetId, suggestionId));
  chain = p.catch(() => {});
  return p;
}

export const worktreeDir = (widgetId: string) => path.join(config.worktrees, widgetId);

/** Commit the agent's work, dropping anything it touched outside its own folder. */
export async function commitWorktree(widgetId: string, title: string) {
  const wt = worktreeDir(widgetId);
  const own = `widgets/${widgetId}/`;
  await git(wt, "add", "-A", "--", own);
  if (!(await gitOk(wt, "diff", "--cached", "--quiet"))) {
    await git(wt, "commit", "-m", `widget: ${title} (${widgetId})`);
  }
  const changed = (await git(wt, "diff", "--name-only", "master...HEAD")).split("\n").filter(Boolean);
  const stray = changed.filter((f) => !f.startsWith(own));
  if (stray.length) {
    for (const f of stray) {
      if (await gitOk(wt, "cat-file", "-e", `master:${f}`)) await git(wt, "checkout", "master", "--", f);
      else await git(wt, "rm", "-q", "--cached", "--ignore-unmatch", "--", f);
    }
    await git(wt, "commit", "-m", `Keep ${widgetId} inside its own folder`);
  }
}

async function doMerge(widgetId: string, suggestionId: string) {
  const repo = config.widgetsRepo;
  await git(repo, "merge", "--no-ff", `widget/${widgetId}`, "-m", `Merge widget ${widgetId}`);
  const sha = (await git(repo, "rev-parse", "--short", "HEAD")).trim();

  const m = readManifest(path.join(repo, "widgets", widgetId));
  db.prepare(
    `INSERT OR REPLACE INTO widgets (id, title, emoji, author, prompt, suggestion_id, commit_sha, hidden, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
  ).run(widgetId, m?.title || widgetId, m?.emoji ?? null, m?.author ?? null, m?.prompt ?? null, suggestionId, sha, Date.now());
  const row = db.prepare("SELECT * FROM widgets WHERE id = ?").get(widgetId) as unknown as WidgetRow;
  broadcast("widget.added", widgetDto(row));

  await removeWorktree(widgetId);
  pushInBackground();
  return sha;
}

export async function removeWorktree(widgetId: string) {
  const repo = config.widgetsRepo;
  await gitOk(repo, "worktree", "remove", "--force", worktreeDir(widgetId));
  fs.rmSync(worktreeDir(widgetId), { recursive: true, force: true });
  await gitOk(repo, "worktree", "prune");
  await gitOk(repo, "branch", "-D", `widget/${widgetId}`);
}

let pushing = false;
let pushAgain = false;

/** Push master after every merge, if a remote is configured (M2+). Never blocks or fails a build. */
function pushInBackground() {
  if (pushing) {
    pushAgain = true;
    return;
  }
  pushing = true;
  (async () => {
    const repo = config.widgetsRepo;
    if (!(await gitOk(repo, "remote", "get-url", "origin"))) return;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        await git(repo, "push", "origin", "master");
        return;
      } catch (e) {
        console.warn(`[push] attempt ${attempt} failed: ${(e as Error).message.split("\n")[0]}`);
        await gitOk(repo, "pull", "--rebase", "origin", "master");
        await new Promise((r) => setTimeout(r, attempt * 5000));
      }
    }
  })().finally(() => {
    pushing = false;
    if (pushAgain) {
      pushAgain = false;
      pushInBackground();
    }
  });
}
