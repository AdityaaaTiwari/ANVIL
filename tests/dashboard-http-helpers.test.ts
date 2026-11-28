import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  readJsonBody,
  rejectDisallowedPostHeaders,
  safeProviderOrigin,
  sendJson,
} from "../src/core/dashboard/http-helpers.js";

function createMockResponse(): {
  response: ServerResponse;
  statusCode: () => number;
  headers: () => Record<string, string>;
  body: () => string;
} {
  let code = 200;
  let capturedHeaders: Record<string, string> = {};
  let text = "";
  const mock = {
    writeHead(status: number, hdrs: Record<string, string> = {}) {
      code = status;
      capturedHeaders = hdrs;
      return mock;
    },
    end(chunk?: string | Buffer) {
      if (chunk !== undefined) text += chunk.toString();
      return mock;
    },
  };
  return {
    response: mock as unknown as ServerResponse,
    statusCode: () => code,
    headers: () => capturedHeaders,
    body: () => text,
  };
}

describe("dashboard http-helpers", () => {
  it("writes UTF-8 JSON payloads via sendJson", () => {
    const res = createMockResponse();
    sendJson(res.response, 201, { ok: true, count: 2 });
    expect(res.statusCode()).toBe(201);
    expect(res.headers()["content-type"]).toBe("application/json; charset=utf-8");
    expect(JSON.parse(res.body())).toEqual({ ok: true, count: 2 });
  });

  it("rejects mismatched, opaque, and malformed Origin headers with 403", () => {
    for (const origin of ["http://evil.example:4173", "null", "not-a-valid-url"]) {
      const res = createMockResponse();
      const req = {
        headers: {
          host: "127.0.0.1:4173",
          origin,
          "content-type": "application/json",
        },
      } as unknown as IncomingMessage;

      expect(rejectDisallowedPostHeaders(req, res.response)).toBe(true);
      expect(res.statusCode()).toBe(403);
      expect(JSON.parse(res.body())).toEqual({ error: "Cross-origin requests are not allowed." });
    }
  });

  it("rejects non-JSON Content-Type headers with 415 and allows valid loopback POSTs", () => {
    const wrongTypeRes = createMockResponse();
    const wrongTypeReq = {
      headers: {
        host: "127.0.0.1:4173",
        origin: "http://127.0.0.1:4173",
        "content-type": "text/plain",
      },
    } as unknown as IncomingMessage;

    expect(rejectDisallowedPostHeaders(wrongTypeReq, wrongTypeRes.response)).toBe(true);
    expect(wrongTypeRes.statusCode()).toBe(415);
    expect(JSON.parse(wrongTypeRes.body())).toEqual({ error: "Expected application/json." });

    const missingTypeRes = createMockResponse();
    const missingTypeReq = {
      headers: { host: "127.0.0.1:4173" },
    } as unknown as IncomingMessage;
    expect(rejectDisallowedPostHeaders(missingTypeReq, missingTypeRes.response)).toBe(true);
    expect(missingTypeRes.statusCode()).toBe(415);

    const validRes = createMockResponse();
    const validReq = {
      headers: {
        host: "127.0.0.1:4173",
        origin: "http://127.0.0.1:4173",
        "content-type": "application/json; charset=utf-8",
      },
    } as unknown as IncomingMessage;
    expect(rejectDisallowedPostHeaders(validReq, validRes.response)).toBe(false);
  });

  it("reads bounded multi-chunk JSON bodies and returns 413 when exceeding maxBytes", async () => {
    const okRes = createMockResponse();
    const okReq = Readable.from([Buffer.from('{"hello":'), Buffer.from('"world"}')]) as unknown as IncomingMessage;
    expect(await readJsonBody(okReq, okRes.response, 128)).toEqual({ ok: true, body: { hello: "world" } });

    const bigRes = createMockResponse();
    const bigReq = Readable.from([Buffer.from('{"payload":"1234567890"}')]) as unknown as IncomingMessage;
    expect(await readJsonBody(bigReq, bigRes.response, 8)).toEqual({ ok: false });
    expect(bigRes.statusCode()).toBe(413);
    expect(JSON.parse(bigRes.body())).toEqual({ error: "Request body is too large." });
  });

  it("extracts safe provider origins and falls back on malformed URLs", () => {
    expect(safeProviderOrigin("https://user:secret@ollama.example:11434/api?token=abc")).toBe(
      "https://ollama.example:11434"
    );
    expect(safeProviderOrigin("://bad-url")).toBe("configured endpoint (invalid URL)");
  });
});
