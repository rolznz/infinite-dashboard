import fs from "node:fs";
import path from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";
import { config } from "../server/config.ts";
import { addStep, appendLog, jobLog } from "../server/suggestions.ts";
import { createBuildTools } from "./tools.ts";

/** OpenAI-compatible endpoints for providers whose newest models may not be in PI's catalog yet. */
const PROVIDERS: Record<string, { baseUrl: string; compat: Record<string, unknown> }> = {
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    compat: { supportsDeveloperRole: false, thinkingFormat: "openrouter", requiresReasoningContentOnAssistantMessages: true },
  },
  cerebras: { baseUrl: "https://api.cerebras.ai/v1", compat: { supportsStore: false, supportsDeveloperRole: false } },
};

const apiKeyEnv = () => `${config.piProvider.toUpperCase()}_API_KEY`;

let runtimePromise: Promise<ModelRuntime> | undefined;

/** Registers PI_MODEL on its provider via models.json when PI's built-in catalog doesn't know it. */
function writeModelsJson() {
  const modelsPath = path.join(config.piAgentDir, "models.json");
  const p = PROVIDERS[config.piProvider];
  const models = p
    ? {
        providers: {
          [config.piProvider]: {
            baseUrl: p.baseUrl,
            api: "openai-completions",
            apiKey: `$${apiKeyEnv()}`,
            compat: p.compat,
            models: [
              {
                id: config.piModel,
                name: config.piModel,
                reasoning: true,
                input: ["text"],
                contextWindow: 131072,
                maxTokens: 32768,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              },
            ],
          },
        },
      }
    : { providers: {} };
  fs.mkdirSync(config.piAgentDir, { recursive: true });
  fs.writeFileSync(modelsPath, JSON.stringify(models, null, 2));
  return modelsPath;
}

function getRuntime() {
  runtimePromise ??= (async () => {
    const runtime = await ModelRuntime.create({
      authPath: path.join(config.piAgentDir, "auth.json"),
      modelsPath: writeModelsJson(),
    });
    const envKey = process.env[apiKeyEnv()];
    if (envKey) await runtime.setRuntimeApiKey(config.piProvider, envKey);
    return runtime;
  })();
  return runtimePromise;
}

/** Log at boot whether the provider really serves PI_MODEL, so a wrong id is obvious. */
export async function checkModelAvailable() {
  const key = process.env[apiKeyEnv()];
  if (!key) {
    console.warn(`[model] ${apiKeyEnv()} is not set, so builds will fail. Add it to .env`);
    return;
  }
  const p = PROVIDERS[config.piProvider];
  if (!p) return;
  const res = await fetch(`${p.baseUrl}/models`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`${config.piProvider} /models returned ${res.status}`);
  const ids = ((await res.json()) as { data: { id: string }[] }).data.map((m) => m.id);
  if (ids.includes(config.piModel)) console.log(`[model] using ${config.piProvider}/${config.piModel}`);
  else console.warn(`[model] PI_MODEL "${config.piModel}" is not available on ${config.piProvider}`);
}

function buildSystemPrompt() {
  const read = (p: string) => fs.readFileSync(path.join(config.root, p), "utf8");
  // Free test runs (TASKFUEL_ENABLED=0) don't register the paid tools, so drop their section too.
  const paidTools = /<!-- paid-tools -->\n([\s\S]*?)<!-- \/paid-tools -->\n/;
  return read("worker/pi/system-prompt.md")
    .replace(paidTools, config.taskfuelEnabled ? "$1" : "")
    .replace("{{SDK_TYPES}}", read("sdk/sdk.d.ts"))
    .replace("{{SDK_DOCS}}", read("sdk/docs.md"));
}

export interface Builder {
  session: AgentSession;
  run(message: string): Promise<void>;
  tokens(): number;
  /** Files the agent wrote or edited outside its widget folder (usually a mistyped absolute path). */
  outsideWrites(): string[];
  /** The agent's final "SUMMARY: …" line (what it built), for users. */
  summary(): string | undefined;
  /** The agent's "PROMPT: …" line after an edit: the original idea with all changes merged in. */
  mergedPrompt(): string | undefined;
  /** TaskFuel USD spent by the build tools. */
  spentUsd(): number;
  dispose(): void;
}

export async function createBuilder(opts: { suggestionId: string; cwd: string }): Promise<Builder> {
  const runtime = await getRuntime();
  const model = runtime.getModel(config.piProvider, config.piModel);
  if (!model) throw new Error(`Model ${config.piProvider}/${config.piModel} not found`);

  const loader = new DefaultResourceLoader({
    cwd: opts.cwd,
    agentDir: config.piAgentDir,
    noExtensions: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    // No skills at all: paid capabilities come only from our dedicated tools (never a globally installed skill).
    noSkills: true,
    appendSystemPromptOverride: () => [buildSystemPrompt()],
  });
  await loader.reload();
  const buildTools = createBuildTools(opts.cwd, {
    log: (line) => jobLog(opts.suggestionId, line),
    step: (message) => addStep(opts.suggestionId, message),
  });
  const customTools = config.taskfuelEnabled ? buildTools.tools : [];
  jobLog(
    opts.suggestionId,
    `PI session: model=${config.piProvider}/${config.piModel} thinking=${config.piThinking} cwd=${opts.cwd} ` +
      `tools=[${customTools.map((t) => t.name).join(",")}] taskfuel=${config.taskfuelEnabled ? "on" : "off"}`,
  );

  const { session } = await createAgentSession({
    cwd: opts.cwd,
    agentDir: config.piAgentDir,
    modelRuntime: runtime,
    model,
    thinkingLevel: config.piThinking,
    resourceLoader: loader,
    customTools,
    sessionManager: SessionManager.inMemory(opts.cwd),
    settingsManager: SettingsManager.inMemory({
      compaction: { enabled: true },
      retry: { enabled: true, maxRetries: 3 },
    }),
  });

  const rawLog = fs.createWriteStream(path.join(config.logs, `${opts.suggestionId}.jsonl`), { flags: "a" });
  let tokens = 0;
  let summary: string | undefined;
  let mergedPrompt: string | undefined;
  const outside = new Set<string>();
  const unsubscribe = session.subscribe((event) => {
    if (event.type === "tool_execution_start" && (event.toolName === "write" || event.toolName === "edit")) {
      const p = String(event.args?.path ?? event.args?.file_path ?? "");
      const abs = path.resolve(opts.cwd, p);
      if (p && abs !== opts.cwd && !abs.startsWith(opts.cwd + path.sep)) outside.add(p);
    }
    if (event.type !== "message_update" && event.type !== "tool_execution_update") {
      rawLog.write(JSON.stringify({ at: Date.now(), ...event }) + "\n");
    }
    summarize(opts.suggestionId, opts.cwd, event, (n) => (tokens += n));
    if (event.type === "message_end" && event.message.role === "assistant") {
      const content = (event.message as { content?: { type: string; text?: string }[] }).content ?? [];
      const text = content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
      const m = text.match(/SUMMARY:\s*(.+)/);
      const clean = (t: string) => t.trim().replace(/[*_`#]/g, "").replace(/^["“]|["”]$/g, "");
      if (m) summary = clean(m[1]).slice(0, 280);
      const p = text.match(/PROMPT:\s*(.+)/);
      if (p) mergedPrompt = clean(p[1]).replace(/\s+/g, " ");
    }
  });

  return {
    session,
    async run(message) {
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          session.abort().catch(() => {});
          reject(new Error("took too long"));
        }, config.buildTimeoutMs);
      });
      try {
        await Promise.race([session.prompt(message), timeout]);
      } finally {
        clearTimeout(timer);
      }
    },
    tokens: () => tokens,
    outsideWrites: () => [...outside],
    summary: () => summary,
    mergedPrompt: () => mergedPrompt,
    spentUsd: buildTools.spentUsd,
    dispose() {
      unsubscribe();
      rawLog.end();
      session.dispose();
    },
  };
}

function summarize(id: string, cwd: string, event: AgentSessionEvent, addTokens: (n: number) => void) {
  const rel = (p: unknown) => String(p ?? "").split(`${cwd}/`).join("").split(cwd).join(".");
  switch (event.type) {
    case "tool_execution_start": {
      const a = event.args ?? {};
      if (event.toolName === "bash") appendLog(id, "tool", `$ ${redact(rel(a.command))}`);
      else if (a.prompt) appendLog(id, "tool", `${event.toolName} "${String(a.prompt).slice(0, 200)}"`);
      else appendLog(id, "tool", `${event.toolName} ${rel(a.path ?? a.file_path)}`.trim());
      break;
    }
    case "tool_execution_end": {
      if (event.isError) appendLog(id, "error", `${event.toolName} failed: ${redact(resultText(event.result))}`);
      else jobLog(id, `  → ${event.toolName} ok: ${redact(rel(resultText(event.result))).slice(0, 200)}`, `  → ${event.toolName} ok:\n${redact(rel(resultText(event.result, 4000)))}`);
      break;
    }
    case "message_end": {
      const m = event.message as {
        role?: string;
        content?: unknown;
        usage?: { totalTokens?: number };
        stopReason?: string;
        errorMessage?: string;
      };
      if (m.role !== "assistant") break;
      addTokens(m.usage?.totalTokens ?? 0);
      const thinking = Array.isArray(m.content)
        ? m.content
            .filter((c: { type?: string }) => c.type === "thinking")
            .map((c: { thinking?: string }) => c.thinking ?? "")
            .join("\n")
            .trim()
        : "";
      if (thinking) jobLog(id, `THINKING (${thinking.length} chars): ${thinking.slice(0, 160)}`, `THINKING:\n${redact(thinking)}`);
      jobLog(id, `TURN tokens=${m.usage?.totalTokens ?? 0} stop=${m.stopReason ?? "?"}`);
      const text = Array.isArray(m.content)
        ? m.content
            .filter((c: { type?: string }) => c.type === "text")
            .map((c: { text?: string }) => c.text ?? "")
            .join("\n")
            .trim()
        : "";
      if (text) appendLog(id, "text", redact(text));
      if (m.stopReason === "error" && m.errorMessage) appendLog(id, "error", m.errorMessage);
      break;
    }
    case "auto_retry_start":
      appendLog(id, "info", `Retrying (${event.attempt}/${event.maxAttempts}): ${event.errorMessage}`);
      break;
  }
}

function resultText(result: unknown, max = 300): string {
  const content = (result as { content?: { type: string; text?: string }[] })?.content;
  if (Array.isArray(content)) return content.map((c) => c.text ?? "").join(" ").slice(0, max);
  return String(result ?? "").slice(0, max);
}

/** Keep secrets out of the public build log. */
function redact(s: string) {
  let out = config.taskfuelApiKey ? s.split(config.taskfuelApiKey).join("***") : s;
  for (const [k, v] of Object.entries(process.env)) {
    if (v && v.length >= 12 && /KEY|TOKEN|SECRET|PASS/i.test(k)) out = out.split(v).join("***");
  }
  return out.replace(/Bearer\s+[A-Za-z0-9._-]{12,}/g, "Bearer ***");
}
