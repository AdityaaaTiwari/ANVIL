import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import appHandler from "../api/app";
import type { VercelRequest, VercelResponse } from "../api/_lib/vercel-types";
import { badgeKey, escapeXml, renderVerificationBadgeSvg } from "../src/github/badge";
import { GitHubClient, type FetchLike } from "../src/github/github-client";

function mockResponse() {
  const headers: Record<string, string | string[]> = {};
  let statusCode = 200;
  let body: unknown;
  const res: VercelResponse = {
    setHeader(name, value) {
      headers[name] = value;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
    send(payload) {
      body = payload;
      return this;
    },
    redirect() {
      return this;
    },
  };
  return { res, headers, getStatus: () => statusCode, getBody: () => body };
}

describe("ANVIL public verification badge", () => {
  it("renders a valid Shields-style SVG badge with Shield and Readiness scores", () => {
    const svg = renderVerificationBadgeSvg({
      record: {
        fullName: "AdityaaaTiwari/ANVIL",
        isPrivate: false,
        shieldScore: 100,
        shieldGrade: "A",
        readinessPercent: 95,
        readinessGrade: "A",
        updatedAt: "2026-11-26T00:00:00Z",
      },
    });
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain("Shield 100/100 · A · ready 95%");
    expect(svg).toContain("#10b981");
  });

  it("never exposes private repository scores or PR metrics", () => {
    const svg = renderVerificationBadgeSvg({
      metric: "readiness",
      record: {
        fullName: "acme/secret-repo",
        isPrivate: true,
        shieldScore: 41,
        readinessPercent: 25,
        lastPrNumber: 912,
        lastPrConclusion: "failure",
        updatedAt: "2026-11-26T00:00:00Z",
      },
    });
    expect(svg).toContain("private repo");
    expect(svg).not.toContain("secret-repo");
    expect(svg).not.toContain("41");
    expect(svg).not.toContain("25%");
    expect(svg).not.toContain("readiness");
    expect(svg).not.toContain("912");
  });

  it("escapes XML characters and sanitizes custom labels against XSS", () => {
    expect(escapeXml(`<script>"'&`)).toBe("&lt;script&gt;&quot;&apos;&amp;");
    const svg = renderVerificationBadgeSvg({
      label: `<script>alert(1)</script>`,
      state: "not-installed",
    });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("app not installed");
  });

  it("renders stable cache key and supports pr and readiness metrics", () => {
    expect(badgeKey("AdityaaaTiwari/ANVIL")).toBe("anvil:repo:adityaaatiwari/anvil:badge");
    const prSvg = renderVerificationBadgeSvg({
      metric: "pr",
      record: {
        fullName: "AdityaaaTiwari/ANVIL",
        isPrivate: false,
        lastPrNumber: 42,
        lastPrConclusion: "success",
        lastPrRiskLevel: "low",
        updatedAt: "2026-11-26T00:00:00Z",
      },
    });
    expect(prSvg).toContain("PR #42 · low risk");
    expect(prSvg).toContain("#10b981");
  });

  it("rejects invalid repository names on /api/app?op=badge without requiring auth", async () => {
    const req: VercelRequest = {
      method: "GET",
      headers: {},
      query: { op: "badge", name: "../bad-repo" },
      async *[Symbol.asyncIterator]() {},
    };
    const { res, getStatus, getBody } = mockResponse();
    await appHandler(req, res);
    expect(getStatus()).toBe(400);
    expect(getBody()).toEqual({ error: "Use name=owner/repo" });
  });

  it("serves SVG even when GitHub/Redis env vars are absent", async () => {
    const req: VercelRequest = {
      method: "GET",
      headers: {},
      query: { op: "badge", name: "AdityaaaTiwari/ANVIL" },
      async *[Symbol.asyncIterator]() {},
    };
    const { res, headers, getStatus, getBody } = mockResponse();
    await appHandler(req, res);
    expect(getStatus()).toBe(200);
    expect(String(headers["Content-Type"])).toContain("image/svg+xml");
    expect(String(headers["Content-Security-Policy"])).toContain("default-src 'none'");
    expect(String(getBody())).toContain("<svg ");
  });

  it("discovers installation ID or handles 404 via GitHubClient.getRepoInstallation", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    const fetchFound: FetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: 98765 }),
      text: async () => "",
    });
    const fetchMissing: FetchLike = async () => ({
      ok: false,
      status: 404,
      json: async () => ({ message: "Not Found" }),
      text: async () => "",
    });

    const found = await GitHubClient.getRepoInstallation({
      appId: 1,
      privateKey: pem,
      owner: "AdityaaaTiwari",
      repo: "ANVIL",
      fetchImpl: fetchFound,
    });
    expect(found).toEqual({ id: 98765 });

    const missing = await GitHubClient.getRepoInstallation({
      appId: 1,
      privateKey: pem,
      owner: "AdityaaaTiwari",
      repo: "missing",
      fetchImpl: fetchMissing,
    });
    expect(missing).toBeUndefined();
  });
});
