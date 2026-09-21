import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { chromium, type Page } from "playwright";
import { config } from "../server/config.ts";
import type { Manifest } from "../server/widgets.ts";

const execFileAsync = promisify(execFile);

const MAX_WIDGET_JS = 150 * 1024;
const MAX_TOTAL = 5 * 1024 * 1024;

export interface CheckResult {
  ok: boolean;
  errors: string[];
}

function dirSize(dir: string): number {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return total;
}

export function checkFiles(widgetDir: string, expected: Pick<Manifest, "id" | "prompt" | "author">): string[] {
  const errors: string[] = [];
  const js = path.join(widgetDir, "widget.js");
  if (!fs.existsSync(js)) return ["widget.js is missing"];
  const size = fs.statSync(js).size;
  if (size > MAX_WIDGET_JS) errors.push(`widget.js is ${Math.round(size / 1024)} KB (max ${MAX_WIDGET_JS / 1024} KB)`);
  if (dirSize(widgetDir) > MAX_TOTAL) errors.push("widget folder is larger than 5 MB");

  let m: Manifest;
  try {
    m = JSON.parse(fs.readFileSync(path.join(widgetDir, "manifest.json"), "utf8"));
  } catch (e) {
    return [...errors, `manifest.json is missing or invalid JSON: ${(e as Error).message}`];
  }
  if (m.id !== expected.id) errors.push(`manifest.id must stay "${expected.id}"`);
  if (m.prompt !== expected.prompt) errors.push("manifest.prompt must not be changed");
  if ((m.author ?? null) !== (expected.author ?? null)) errors.push("manifest.author must not be changed");
  if (typeof m.title !== "string" || !m.title.trim() || m.title.length > 60) errors.push("manifest.title must be 1-60 characters");
  if (m.emoji != null && (typeof m.emoji !== "string" || m.emoji.length > 16)) errors.push("manifest.emoji must be a single emoji");
  if (m.taskfuelUsd != null && typeof m.taskfuelUsd !== "number") errors.push("manifest.taskfuelUsd must be a number");
  return errors;
}

export async function checkSyntax(widgetDir: string): Promise<string[]> {
  const tmp = path.join(os.tmpdir(), `widget-check-${process.pid}-${Date.now()}.mjs`);
  fs.copyFileSync(path.join(widgetDir, "widget.js"), tmp);
  try {
    await execFileAsync(process.execPath, ["--check", tmp]);
    return [];
  } catch (e) {
    const stderr = String((e as { stderr?: string }).stderr ?? e).replaceAll(tmp, "widget.js");
    return [`widget.js has a syntax error:\n${stderr.trim().slice(0, 800)}`];
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

const withTimeout = <T>(p: Promise<T>, ms: number, what: string) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${what} timed out`)), ms))]);

async function widgetState(page: Page, id: string) {
  return withTimeout(
    page.evaluate((id) => {
      const root = document.querySelector<HTMLElement>(`[data-widget-id="${id}"]`);
      const cards = [...document.querySelectorAll<HTMLElement>("[data-widget-id]")];
      return {
        state: root?.dataset.widgetState ?? "missing",
        error: root?.dataset.widgetError ?? "",
        hasContent: !!root && ((root.shadowRoot?.childNodes.length ?? 0) > 0 || root.childNodes.length > 0),
        headerVisible: !!document.querySelector("[data-testid=header]")?.getBoundingClientRect().height,
        otherCardsLoading: cards.filter((c) => c.dataset.widgetId !== id && c.dataset.widgetState === "loading").length,
      };
    }, id),
    5000,
    "The page stopped responding (infinite loop?). Checking the widget",
  );
}

/** Load the real dashboard with the unmerged widget in it, in light and dark mode. */
export async function checkInBrowser(widgetId: string): Promise<string[]> {
  const url = `http://127.0.0.1:${config.port}/?preview=${encodeURIComponent(widgetId)}`;
  const browser = await chromium.launch();
  const errors: string[] = [];
  try {
    for (const colorScheme of ["light", "dark"] as const) {
      const context = await browser.newContext({ colorScheme, viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      const pageErrors: string[] = [];
      page.on("pageerror", (err) => pageErrors.push(`${err.message}\n${(err.stack ?? "").split("\n").slice(1, 4).join("\n")}`));
      page.on("console", (msg) => {
        if (msg.type() === "error" && msg.text().includes(widgetId)) pageErrors.push(msg.text());
      });

      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
        await page
          .locator(`[data-widget-id="${widgetId}"]:not([data-widget-state="loading"])`)
          .waitFor({ state: "attached", timeout: 20_000 });
        await page.waitForTimeout(3000);

        let s = await widgetState(page, widgetId);
        if (s.state === "error") errors.push(`[${colorScheme}] widget crashed while mounting: ${s.error}`);
        else if (s.state !== "mounted") errors.push(`[${colorScheme}] widget did not mount (state: ${s.state})`);
        else if (!s.hasContent) errors.push(`[${colorScheme}] widget rendered nothing into its root`);
        if (!s.headerVisible) errors.push(`[${colorScheme}] the dashboard header disappeared, so the widget broke the page`);

        if (s.state === "mounted") {
          const buttons = page.locator(`[data-widget-id="${widgetId}"] button`);
          const n = Math.min(await buttons.count(), 3);
          for (let i = 0; i < n; i++) {
            await buttons.nth(i).click({ timeout: 2000, force: true }).catch(() => {});
          }
          if (n) await page.waitForTimeout(1000);
          s = await widgetState(page, widgetId);
          if (s.state === "error") errors.push(`[${colorScheme}] widget crashed after clicking its buttons: ${s.error}`);
          if (!s.headerVisible) errors.push(`[${colorScheme}] the dashboard broke after clicking the widget's buttons`);
        }

        const card = page.locator(`[data-card-id="${widgetId}"]`);
        if (await card.count()) {
          await card.screenshot({ path: path.join(config.shots, `${widgetId}-${colorScheme}.png`), timeout: 5000 }).catch(() => {});
        }
      } catch (e) {
        errors.push(`[${colorScheme}] ${(e as Error).message.split("\n")[0]}`);
      }

      const ours = pageErrors.filter((e) => e.includes(widgetId) || e.includes("/w-preview/"));
      for (const e of ours.slice(0, 5)) errors.push(`[${colorScheme}] uncaught error: ${e}`);
      await withTimeout(context.close(), 5000, "closing").catch(() => {});
      if (errors.length) break;
    }
  } finally {
    await withTimeout(browser.close(), 10_000, "closing browser").catch(() => {});
  }
  return errors;
}

export async function runChecks(widgetDir: string, expected: Pick<Manifest, "id" | "prompt" | "author">): Promise<CheckResult> {
  const errors = checkFiles(widgetDir, expected);
  if (!errors.length) errors.push(...(await checkSyntax(widgetDir)));
  if (!errors.length) errors.push(...(await checkInBrowser(expected.id)));
  return { ok: errors.length === 0, errors };
}
