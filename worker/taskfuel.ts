import { config } from "../server/config.ts";

/** Remaining TaskFuel balance in USD, or undefined when no key is configured / the gateway is unreachable. */
let cached: { at: number; value: number | undefined } | undefined;

export async function taskfuelBalance(fresh = false): Promise<number | undefined> {
  if (!fresh && cached && Date.now() - cached.at < 30_000) return cached.value;
  const value = await fetchBalance();
  cached = { at: Date.now(), value };
  return value;
}

async function fetchBalance(): Promise<number | undefined> {
  const key = config.taskfuelApiKey;
  if (!key) return undefined;
  try {
    const res = await fetch(`${config.taskfuelBaseUrl}/v1/me`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return undefined;
    const me = (await res.json()) as { balance_usd?: number };
    return typeof me.balance_usd === "number" ? me.balance_usd : undefined;
  } catch {
    return undefined;
  }
}

export interface TaskfuelResult {
  status: number;
  /** USD charged for this call (0 for free endpoints and failures). */
  costUsd: number;
  contentType: string;
  body: Buffer;
  json<T = unknown>(): T;
}

/** One upstream call through the TaskFuel gateway (POST /v1/call). Throws on non-2xx (nothing is charged then). */
export async function taskfuelCall(opts: {
  url: string;
  method?: "GET" | "POST";
  body?: unknown;
  /** Spend ceiling for this call. Omit for free endpoints (e.g. polling a job). */
  maxAmountUsd?: number;
  timeoutMs?: number;
}): Promise<TaskfuelResult> {
  const key = config.taskfuelApiKey;
  if (!key || !config.taskfuelEnabled) throw new Error("TaskFuel is disabled");
  const res = await fetch(`${config.taskfuelBaseUrl}/v1/call`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url: opts.url,
      method: opts.method ?? "GET",
      ...(opts.body !== undefined ? { body: opts.body } : {}),
      ...(opts.maxAmountUsd !== undefined ? { maxAmountUsd: opts.maxAmountUsd } : {}),
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
  });
  const body = Buffer.from(await res.arrayBuffer());
  const costUsd = Number(res.headers.get("x-taskfuel-cost") ?? 0) || 0;
  if (!res.ok) {
    const source = res.headers.get("x-taskfuel-source") === "upstream" ? "upstream" : "TaskFuel";
    throw new Error(`${source} returned ${res.status}: ${body.toString("utf8").slice(0, 300)}`);
  }
  return {
    status: res.status,
    costUsd,
    contentType: res.headers.get("content-type") ?? "",
    body,
    json: <T>() => JSON.parse(body.toString("utf8")) as T,
  };
}
