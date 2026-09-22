# ∞ Infinite Dash

**A dashboard that builds itself.** Press **(+)**, describe a widget, and an AI agent builds it
and puts it live for everyone within a minute or so, with no redeploys.

Rule for the agent: *maximize fun, don't break the dashboard, and spend at most $1 of TaskFuel
per widget.*

## How it works

```
(+) prompt → pending → (triage: M1.5) → accepted → building → testing → merged → live
                                                       └──────────────→ failed (+ reason)
```

- **Shell** (this repo): Vite + React + shadcn/ui frontend and an Express backend with SQLite.
  It's deployed rarely.
- **Widgets**: plain folders on the data volume, `data/widgets/<id>/widget.js` + `manifest.json`
  (no git). Each one is loaded by the browser at runtime with
  dynamic `import()`. New widgets appear live over server-sent events, with no reload.
- **Builder**: [PI](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) runs
  in-process through its SDK (Qwen 3.8 27B on Cerebras by default), with full tools, in its own build
  folder per widget. Paid capabilities come from dedicated tools (`worker/tools.ts`), not the raw
  TaskFuel API: `create_image` (GPT Image 2.5) and `create_sound_effect` (ElevenLabs) at build
  time, and `sdk.tools.twitterSearch()`, `sdk.tools.newsSearch()`, `sdk.tools.llm()` and `sdk.tools.speak()` for widgets at runtime.
- **Checks before merge**: file/manifest checks, `node --check`, then Playwright loads the real
  dashboard with the new widget in it (light and dark) and clicks its buttons. On failure the
  agent gets one repair attempt.
- **Publish**: the build folder is renamed into `data/widgets/`. Widgets only touch their own
  folder, so parallel builds never conflict.
- **Status** is owned by the orchestrator (`worker/orchestrator.ts`). Every transition is
  stored and streamed to the submitter's "Your builds" sheet as friendly steps plus a one-line
  summary. Build internals (tool calls, model output, costs) stay in the backend logs.
- **Extras**: 🟢 online count, likes (one per hashed IP;
  most liked first), and light/dark mode that follows the system.

## Run locally

Requirements: Node 24+.

```sh
npm install
npx playwright install chromium   # headless browser for the pre-merge load test
cp .env.example .env              # then fill in CEREBRAS_API_KEY, TASKFUEL_API_KEY and TYPESAFE_API_KEY
npm run dev                       # http://localhost:8080
```

On boot the server creates `data/` (SQLite DB, widgets, builds, logs, screenshots) and
logs whether your provider serves `PI_MODEL`. To start completely fresh, stop the
server and delete `data/`.

Production build: `npm run build && npm start`.

### Where things are

| What | Where |
|---|---|
| Widget files (live) | `data/widgets/<widget-id>/` (`widget.js`, `manifest.json`, `assets/`) |
| In-progress builds | `data/builds/<widget-id>/` (moved into `data/widgets/` when the checks pass, deleted on failure) |
| Job log (readable, incl. model thinking + tool calls) | `data/logs/<suggestion-id>.log`, also streamed to the server console as `[job <id>] …` |
| Raw PI events | `data/logs/<suggestion-id>.jsonl` |
| Pre-merge screenshots | `data/shots/<widget-id>-{light,dark}.png` |

### End-to-end test

Drives the real UI with Playwright (submit → watch log → open widget → click) and fails on any
browser console error:

```sh
npm run e2e -- "A fortune cookie that cracks open with a random prophecy"
# free run: start a separate server without TaskFuel
PORT=8090 DATA_DIR=/tmp/idash-test TASKFUEL_ENABLED=0 npx tsx --env-file-if-exists=.env server/index.ts
E2E_URL=http://localhost:8090 npm run e2e -- "<prompt>"
```

### Triage (Jev)

Before an idea is queued, `worker/triage.ts` asks TypeSafe's Jev model (`TYPESAFE_API_KEY`, server
only) for a fun score, a feasibility score and six safety flags in one request. Unsafe, too complex
or dull ideas are denied; the fun rating is shown on builds and live widgets. Without a key every
idea is accepted. Raw judgments go to the job log (`TRIAGE {...}`) for tuning the thresholds.

### TaskFuel

Only the server holds `TASKFUEL_API_KEY` (it's removed from the environment the agent's bash
sees), and PI gets no skills. It uses TaskFuel only through dedicated tools in `worker/tools.ts`:

| Tool | When | Upstream | Price |
|---|---|---|---|
| `create_image` → `assets/<name>.webp` | build | StableStudio GPT Image 2.5 Flare, high quality | $0.05 |
| `create_sound_effect` → `assets/<name>.mp3` | build | BlockRun ElevenLabs sound effects | $0.0535 |
| `sdk.tools.twitterSearch(q)` → `GET /api/tools/twitter-search` | runtime | Otto AI tweet search | $0.005 |
| `sdk.tools.llm({ system, prompt })` → `POST /api/tools/llm` | runtime | BlockRun chat completions (`LLM_MODEL`, default Gemini 3.8 Flash) | ~$0.002 |
| `sdk.tools.newsSearch(q)` → `GET /api/tools/news-search` | runtime | Serper Google News | $0.002 |
| `sdk.tools.speak({ text, voice })` → `POST /api/tools/speak` | runtime | Grok text to speech (up to 500 chars) | ~$0.0015 per sentence |

The build tools total their spend, and the orchestrator writes it to `manifest.taskfuelUsd`.
Runtime calls are cached for 10 minutes per identical request (shared by all visitors) and capped at
`TOOL_CALLS_PER_HOUR` paid calls; LLM and speech calls are also capped per IP (`LLM_CALLS_PER_IP_PER_HOUR`
and `SPEAK_CALLS_PER_IP_PER_HOUR`, default 20 each), and LLM calls always get a fixed server-side guardrail prompt. `TASKFUEL_ENABLED=0` turns all of it off for free test runs.

## Layout

```
server/        Express API, SSE, SQLite, widget storage
worker/        orchestrator (queue), build (PI SDK), checks (Playwright), publish, triage (stub until M1.5)
worker/tools.ts  dedicated TaskFuel tools (build-time PI tools + runtime API for widgets)
worker/pi/     PI system prompt
sdk/           widget SDK types + authoring docs (both are fed to PI)
web/           Vite + React + shadcn/ui shell
```

## Widget contract

```js
// widgets/<id>/widget.js
export default function mount(root, sdk) {
  const shadow = root.attachShadow({ mode: "open" });
  shadow.innerHTML = `<button>🍪</button>`;
  shadow.querySelector("button").onclick = () => sdk.toast("Crunch!");
  return () => {}; // optional cleanup
}
```

Every widget gets the same fixed box (~300–480 × 320px). No npm: libraries come from pinned CDN
URLs (esm.sh / jsdelivr), and data comes from `sdk.tools` or public CORS endpoints. See
[`sdk/docs.md`](sdk/docs.md) and [`sdk/sdk.d.ts`](sdk/sdk.d.ts).

## Configuration

See [`.env.example`](.env.example). Main knobs: `PI_MODEL`, `MAX_BUILDS`, `BUILD_TIMEOUT_MIN`,
`MIN_TASKFUEL_BALANCE` (the queue pauses below it) and `SUBMITS_PER_IP_PER_HOUR`.
