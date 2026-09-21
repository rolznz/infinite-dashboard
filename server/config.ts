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
  widgetsRepo: path.join(dataDir, "widgets-repo"),
  worktrees: path.join(dataDir, "worktrees"),
  logs: path.join(dataDir, "logs"),
  shots: path.join(dataDir, "shots"),
  piAgentDir: path.join(dataDir, "pi-agent"),
  widgetsRemote: process.env.WIDGETS_REMOTE || undefined,

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

  maxBuilds: Number(process.env.MAX_BUILDS ?? 2),
  buildTimeoutMs: Number(process.env.BUILD_TIMEOUT_MIN ?? 15) * 60_000,
  minTaskfuelBalance: Number(process.env.MIN_TASKFUEL_BALANCE ?? 1),
  maxPending: 50,
  submitsPerIpPerHour: Number(process.env.SUBMITS_PER_IP_PER_HOUR ?? 10),
};
