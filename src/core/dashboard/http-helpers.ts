import type { IncomingMessage, ServerResponse } from "node:http";

/** Writes a JSON response with UTF-8 content type. */
export function sendJson(response: ServerResponse, statusCode: number, data: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(data));
}

/** Validates Origin and Content-Type for mutating dashboard POST routes. */
export function rejectDisallowedPostHeaders(request: IncomingMessage, response: ServerResponse): boolean {
  const origin = request.headers.origin;
  if (origin && new URL(origin).host !== request.headers.host) {
    sendJson(response, 403, { error: "Cross-origin requests are not allowed." });
    return true;
  }
  if (!request.headers["content-type"]?.includes("application/json")) {
    sendJson(response, 415, { error: "Expected application/json." });
    return true;
  }
  return false;
}

/** Reads and parses a bounded JSON request body, responding with 413 if it exceeds `maxBytes`. */
export async function readJsonBody(
  request: IncomingMessage,
  response: ServerResponse,
  maxBytes: number
): Promise<{ ok: true; body: unknown } | { ok: false }> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      sendJson(response, 413, { error: "Request body is too large." });
      return { ok: false };
    }
    chunks.push(Buffer.from(chunk));
  }
  return { ok: true, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown };
}

/** Extracts the URL origin safely without leaking credentials or query parameters. */
export function safeProviderOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return "configured endpoint (invalid URL)";
  }
}
