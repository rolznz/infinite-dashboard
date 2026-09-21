import type { Request, Response } from "express";

interface Client {
  res: Response;
  visitor: string;
}

const clients = new Set<Client>();
const visitorConnections = new Map<string, number>();
let lastOnline = -1;
let onlineTimer: NodeJS.Timeout | undefined;

export const onlineCount = () => visitorConnections.size;

export function broadcast(event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) c.res.write(payload);
}

function scheduleOnlineBroadcast() {
  if (onlineTimer) return;
  onlineTimer = setTimeout(() => {
    onlineTimer = undefined;
    const count = onlineCount();
    if (count !== lastOnline) {
      lastOnline = count;
      broadcast("online", { count });
    }
  }, 2000);
}

export function sseHandler(hello: () => unknown) {
  return (req: Request, res: Response) => {
    const visitor = String(req.query.visitor ?? "") || `anon-${Math.random()}`;
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    const client: Client = { res, visitor };
    clients.add(client);
    visitorConnections.set(visitor, (visitorConnections.get(visitor) ?? 0) + 1);
    res.write(`event: hello\ndata: ${JSON.stringify({ ...(hello() as object), online: onlineCount() })}\n\n`);
    scheduleOnlineBroadcast();

    const ping = setInterval(() => res.write(`: ping\n\n`), 25_000);
    req.on("close", () => {
      clearInterval(ping);
      clients.delete(client);
      const n = (visitorConnections.get(visitor) ?? 1) - 1;
      if (n <= 0) visitorConnections.delete(visitor);
      else visitorConnections.set(visitor, n);
      scheduleOnlineBroadcast();
    });
  };
}
