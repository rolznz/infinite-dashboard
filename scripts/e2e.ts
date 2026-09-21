/**
 * End-to-end test through the real UI: open the dashboard, press (+), submit a prompt, watch the
 * log until the build finishes, then check the widget renders and responds to a click.
 * Fails on any browser console error or uncaught exception.
 *
 *   npm run e2e -- "A button that plays a silly fart sound"            (defaults to http://localhost:8080)
 *   E2E_URL=http://localhost:8090 npm run e2e -- "<prompt>"
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, type ConsoleMessage } from "playwright";

const base = process.env.E2E_URL ?? "http://localhost:8080";
const prompt = process.argv.slice(2).join(" ").trim();
const outDir = process.env.E2E_OUT ?? "e2e-results";
if (!prompt) {
  console.error('Usage: npm run e2e -- "<prompt>"');
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

const problems: string[] = [];
const ignore = [/\[vite\]/, /React DevTools/, /GL Driver Message/, /GPU stall/];
const onConsole = (m: ConsoleMessage) => {
  if ((m.type() === "error" || m.type() === "warning") && !ignore.some((r) => r.test(m.text()))) {
    problems.push(`console.${m.type()}: ${m.text().slice(0, 500)}`);
  }
};

const browser = await chromium.launch();
const results: Record<string, string> = {};
try {
  for (const [name, viewport, colorScheme] of [
    ["desktop-light", { width: 1280, height: 850 }, "light"],
    ["mobile-dark", { width: 390, height: 844 }, "dark"],
  ] as const) {
    const context = await browser.newContext({ viewport, colorScheme });
    const page = await context.newPage();
    page.on("console", onConsole);
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));

    await page.goto(base);
    await page.getByTestId("header").waitFor();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(outDir, `${name}-1-home.png`) });

    if (name !== "desktop-light") {
      // Second pass: only check the dashboard renders on mobile.
      await context.close();
      continue;
    }

    // Submit through the UI.
    await page.getByLabel("Suggest a widget").click();
    await page.getByPlaceholder(/rain emojis/).fill(prompt);
    await page.getByPlaceholder(/name or @handle/).fill("e2e");
    await page.screenshot({ path: path.join(outDir, `${name}-2-submit.png`) });
    await page.getByRole("button", { name: "Build it" }).click();

    // "Your builds" opens with our entry highlighted; follow it until it finishes.
    const entry = page.locator("li.ring-2").first();
    await entry.waitFor({ timeout: 10_000 });
    console.log("Submitted. Watching the log…");
    const started = Date.now();
    let status = "";
    let lastStatus = "";
    while (Date.now() - started < 15 * 60_000) {
      status = (await entry.locator('[data-slot="badge"]').first().textContent())?.trim() ?? "";
      if (status !== lastStatus) {
        console.log(`  ${((Date.now() - started) / 1000).toFixed(0)}s  ${status}`);
        lastStatus = status;
      }
      if (["Live", "Failed", "Denied"].includes(status)) break;
      await page.waitForTimeout(1000);
    }
    await page.screenshot({ path: path.join(outDir, `${name}-3-log-done.png`) });
    results.status = status;
    results.seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (status !== "Live") {
      results.reason = (await entry.locator("p.text-destructive").textContent().catch(() => "")) ?? "";
      break;
    }

    // Jump to the widget and interact with it.
    await entry.getByRole("button", { name: /View widget/ }).click();
    const widgetId = await page.locator(".ring-4").first().getAttribute("data-card-id", { timeout: 2000 });
    const card = page.locator(`[data-card-id="${widgetId}"]`);
    await page.waitForTimeout(1500);
    results.widgetId = widgetId ?? "?";
    const state = await page.locator(`[data-widget-id="${widgetId}"]`).getAttribute("data-widget-state");
    results.widgetState = state ?? "missing";
    if (state !== "mounted") problems.push(`widget state is ${state}`);
    const button = page.locator(`[data-widget-id="${widgetId}"] button`).first();
    if (await button.count()) {
      // force: animated buttons (pulsing, bobbing) never count as "stable" for Playwright.
      await button.click({ force: true });
      await page.waitForTimeout(1500);
    }
    await card.screenshot({ path: path.join(outDir, `${name}-4-widget.png`) });
    await context.close();
  }
} finally {
  await browser.close();
}

console.log("\nResult:", JSON.stringify(results));
console.log(`Screenshots: ${path.resolve(outDir)}`);
if (problems.length) {
  console.log(`\n${problems.length} console problem(s):`);
  for (const p of problems) console.log(" -", p);
  process.exit(1);
}
console.log("No console errors.");
process.exit(results.status === "Live" ? 0 : 1);
