import { describe, expect, it } from "vitest";
import {
  clearSessionCookie,
  getCookie,
  getQuery,
  isValidSessionRepository,
  pkceChallenge,
  randomToken,
  stateKey,
  sessionKey,
} from "../api/_lib/github-auth";
import type { VercelRequest, VercelResponse } from "../api/_lib/vercel-types";

function request(headers: VercelRequest["headers"], query?: VercelRequest["query"]): VercelRequest {
  return {
    headers,
    query,
    async *[Symbol.asyncIterator]() {},
  };
}

describe("GitHub OAuth helpers", () => {
  it("creates URL-safe random state and session identifiers", () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{40,60}$/);
    expect(stateKey(token)).toBe(`anvil:github:oauth-state:${token}`);
    expect(sessionKey(token)).toBe(`anvil:github:session:${token}`);
  });

  it("creates a 43-character base64url S256 PKCE challenge", () => {
    const challenge = pkceChallenge("a-long-test-verifier-value-for-pkce");
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("reads only the requested cookie and safely decodes it", () => {
    const req = request({ cookie: "other=one; anvil_github_session=abc%2Fdef; theme=dark" });
    expect(getCookie(req, "anvil_github_session")).toBe("abc/def");
    expect(getCookie(req, "missing")).toBeUndefined();
    expect(getCookie(request({ cookie: "anvil_github_session=%E0%A4%A" }), "anvil_github_session")).toBeUndefined();
  });

  it("reads only scalar query parameters", () => {
    expect(getQuery(request({}, { code: "abc" }), "code")).toBe("abc");
    expect(getQuery(request({}, { code: ["a", "b"] }), "code")).toBeUndefined();
  });

  it("validates stored session repositories and clears the session cookie", () => {
    expect(isValidSessionRepository({ fullName: "acme/app", installationId: 12, private: false })).toBe(true);
    expect(isValidSessionRepository({ fullName: "invalid", installationId: 12, private: false })).toBe(false);
    expect(isValidSessionRepository({ fullName: "acme/app", installationId: 0, private: false })).toBe(false);
    const headers: Record<string, string | string[]> = {};
    const mockRes: VercelResponse = {
      setHeader(name, value) {
        headers[name] = value;
      },
      status() {
        return this;
      },
      json() {
        return this;
      },
      redirect() {
        return this;
      },
    };
    clearSessionCookie(mockRes);
    expect(String(headers["Set-Cookie"])).toContain("anvil_github_session=;");
  });
});
