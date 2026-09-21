import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dataDir = path.resolve(root, process.env.DATA_DIR ?? "data");
const taskfuelApiKey = process.env.TASKFUEL_API_KEY || undefined;
delete process.env.TASKFUEL_API_KEY;

export const config = {
  root,
  port: Number(process.env.PORT ?? 8080),
  isProd: process.env.NODE_ENV === "production",
  dataDir,
  dbPath: path.join(dataDir, "app.db"),
  /** Live widgets, one folder each. */
  widgets: path.join(dataDir, "widgets"),
  /** In-progress builds, moved into `widgets` once they pass the checks. */
  builds: path.join(dataDir, "builds"),
  logs: path.join(dataDir, "logs"),
  shots: path.join(dataDir, "shots"),
  piAgentDir: path.join(dataDir, "pi-agent"),

  piProvider: process.env.PI_PROVIDER ?? "cerebras",
  piModel: process.env.PI_MODEL ?? "qwen-3.8-27b",
  piThinking: (process.env.PI_THINKING ?? "high") as "off" | "minimal" | "low" | "medium" | "high",

  taskfuelBaseUrl: (process.env.TASKFUEL_BASE_URL ?? "https://app.taskfuel.ai").replace(/\/+$/, ""),
  /** TASKFUEL_ENABLED=0 turns TaskFuel off for builds (useful for free test runs). */
  taskfuelEnabled: !!taskfuelApiKey && process.env.TASKFUEL_ENABLED !== "0",
  /** Only the server holds the key. It's removed from process.env so the agent's bash never sees it. */
  taskfuelApiKey,
  /** Max paid runtime API calls (e.g. tweet searches from widgets) per hour, across all widgets. Cached hits are free. */
  toolCallsPerHour: Number(process.env.TOOL_CALLS_PER_HOUR ?? 120),
  /** Model for the runtime LLM tool (sdk.tools.llm), any BlockRun chat-completions model id. */
  llmModel: process.env.LLM_MODEL ?? "google/gemini-3.5-flash-lite",
  /** Paid LLM calls per visitor IP per hour (cached answers are free). */
  llmCallsPerIpPerHour: Number(process.env.LLM_CALLS_PER_IP_PER_HOUR ?? 20),

  maxBuilds: Number(process.env.MAX_BUILDS ?? 2),
  /** Wall-clock limit for a whole build job (first run + repair), so a stuck agent can't burn LLM credit. */
  buildTimeoutMs: Number(process.env.BUILD_TIMEOUT_MIN ?? 5) * 60_000,
  /** Max LLM turns per build job; normal builds take 5-25. */
  maxBuildTurns: Number(process.env.MAX_BUILD_TURNS ?? 40),
  minTaskfuelBalance: Number(process.env.MIN_TASKFUEL_BALANCE ?? 1),
  maxPending: 50,
  submitsPerIpPerHour: Number(process.env.SUBMITS_PER_IP_PER_HOUR ?? 10),
};
