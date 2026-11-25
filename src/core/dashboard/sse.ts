import type { IncomingMessage, Server, ServerResponse } from "node:http";

const sseClients = new Set<ServerResponse>();
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

/** Broadcasts a Server-Sent Event payload to all connected dashboard clients. */
export function broadcastEvent(type: string, data: unknown): void {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

/** Handles `GET /api/events` SSE subscriptions. */
export function handleSseRequest(request: IncomingMessage, response: ServerResponse): void {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  response.write("retry: 3000\n\n");
  sseClients.add(response);
  try {
    response.write(`event: connected\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
  } catch {
    sseClients.delete(response);
  }
  request.on("close", () => {
    sseClients.delete(response);
  });
}

/** Starts periodic SSE heartbeats and cleans up open streams when the server closes. */
export function attachDashboardHeartbeat(server: Server): void {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(() => {
    broadcastEvent("heartbeat", { at: new Date().toISOString() });
  }, 15000);
  server.once("close", () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    sseClients.clear();
  });
}
