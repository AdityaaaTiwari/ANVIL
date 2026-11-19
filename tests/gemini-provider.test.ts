import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiProvider } from "../src/core/gemini-provider.js";

afterEach(() => vi.unstubAllGlobals());

describe("Google Gemini provider", () => {
  it("rejects empty or whitespace-only API keys", () => {
    expect(() => new GeminiProvider({ apiKey: "", model: "gemini-1.5-pro" })).toThrow(/API key is required/);
    expect(() => new GeminiProvider({ apiKey: "   ", model: "gemini-1.5-pro" })).toThrow(/API key is required/);
  });

  it("rejects empty or whitespace-only model names", () => {
    expect(() => new GeminiProvider({ apiKey: "valid-key", model: "" })).toThrow(/model name is required/);
    expect(() => new GeminiProvider({ apiKey: "valid-key", model: "   " })).toThrow(/model name is required/);
  });

  it("rejects non-HTTPS remote endpoints", () => {
    expect(() => new GeminiProvider({
      apiKey: "key",
      model: "gemini-1.5-pro",
      baseUrl: "http://generativelanguage.googleapis.com",
    })).toThrow(/HTTPS/);
  });

  it("allows loopback HTTP endpoints", () => {
    expect(() => new GeminiProvider({
      apiKey: "key",
      model: "gemini-1.5-pro",
      baseUrl: "http://localhost:8080",
    })).not.toThrow();
  });

  it("rejects endpoints containing credentials or query parameters", () => {
    expect(() => new GeminiProvider({
      apiKey: "key",
      model: "gemini-1.5-pro",
      baseUrl: "https://user:pass@generativelanguage.googleapis.com",
    })).toThrow(/credentials/);

    expect(() => new GeminiProvider({
      apiKey: "key",
      model: "gemini-1.5-pro",
      baseUrl: "https://generativelanguage.googleapis.com?query=1",
    })).toThrow(/query/);
  });

  it("rejects invalid timeout values", async () => {
    const provider = new GeminiProvider({ apiKey: "key", model: "gemini-1.5-pro", timeoutMs: 50 });
    await expect(provider.complete({
      task: { id: "t1", agent: "planner", title: "Plan", prompt: "Do plan" },
      completedDependencies: [],
    })).rejects.toThrow(/timeout must be between 1000 and 180000/);
  });

  it("successfully parses a valid Gemini response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [
        {
          content: {
            parts: [{ text: "Here is the architectural evaluation proposal." }],
          },
        },
      ],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GeminiProvider({
      apiKey: "test-gemini-key",
      model: "gemini-1.5-pro",
    });

    const result = await provider.complete({
      task: { id: "arch", agent: "architect", title: "Map architecture", prompt: "Map modules" },
      completedDependencies: [],
    });

    expect(result.content).toBe("Here is the architectural evaluation proposal.");
    expect(result.provider).toBe("gemini");
    expect(result.model).toBe("gemini-1.5-pro");
    expect(fetchMock).toHaveBeenCalledOnce();

    const [calledUrl, calledOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain("models/gemini-1.5-pro:generateContent?key=test-gemini-key");
    expect(calledOptions.method).toBe("POST");
    expect(calledOptions.redirect).toBe("error");
  });

  it("handles non-2xx HTTP responses safely without leaking response bodies", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("secret error message", { status: 403 })));
    const provider = new GeminiProvider({ apiKey: "key", model: "gemini-1.5-pro" });

    await expect(provider.complete({
      task: { id: "t1", agent: "planner", title: "Plan", prompt: "Do plan" },
      completedDependencies: [],
    })).rejects.toThrow("Gemini request failed with HTTP 403.");
  });

  it("throws on unexpected response schema", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));
    const provider = new GeminiProvider({ apiKey: "key", model: "gemini-1.5-pro" });

    await expect(provider.complete({
      task: { id: "t1", agent: "planner", title: "Plan", prompt: "Do plan" },
      completedDependencies: [],
    })).rejects.toThrow("Gemini returned an unexpected response format.");
  });
});
