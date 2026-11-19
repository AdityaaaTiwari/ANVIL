import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "../src/core/anthropic-provider.js";

afterEach(() => vi.unstubAllGlobals());

describe("Anthropic Claude provider", () => {
  it("rejects empty or whitespace-only API keys", () => {
    expect(() => new AnthropicProvider({ apiKey: "", model: "claude-3-7-sonnet" })).toThrow(/API key is required/);
    expect(() => new AnthropicProvider({ apiKey: "   ", model: "claude-3-7-sonnet" })).toThrow(/API key is required/);
  });

  it("rejects empty or whitespace-only model names", () => {
    expect(() => new AnthropicProvider({ apiKey: "valid-key", model: "" })).toThrow(/model name is required/);
    expect(() => new AnthropicProvider({ apiKey: "valid-key", model: "   " })).toThrow(/model name is required/);
  });

  it("rejects non-HTTPS remote endpoints", () => {
    expect(() => new AnthropicProvider({
      apiKey: "key",
      model: "claude-3-7-sonnet",
      baseUrl: "http://api.anthropic.com",
    })).toThrow(/HTTPS/);
  });

  it("allows loopback HTTP endpoints", () => {
    expect(() => new AnthropicProvider({
      apiKey: "key",
      model: "claude-3-7-sonnet",
      baseUrl: "http://localhost:8080",
    })).not.toThrow();
  });

  it("rejects endpoints containing credentials or query parameters", () => {
    expect(() => new AnthropicProvider({
      apiKey: "key",
      model: "claude-3-7-sonnet",
      baseUrl: "https://user:pass@api.anthropic.com",
    })).toThrow(/credentials/);

    expect(() => new AnthropicProvider({
      apiKey: "key",
      model: "claude-3-7-sonnet",
      baseUrl: "https://api.anthropic.com?debug=true",
    })).toThrow(/query/);
  });

  it("rejects invalid timeout values", async () => {
    const provider = new AnthropicProvider({ apiKey: "key", model: "claude-3-7-sonnet", timeoutMs: 50 });
    await expect(provider.complete({
      task: { id: "t1", agent: "planner", title: "Plan", prompt: "Do plan" },
      completedDependencies: [],
    })).rejects.toThrow(/timeout must be between 1000 and 180000/);
  });

  it("rejects out-of-range maxTokens", async () => {
    const provider = new AnthropicProvider({ apiKey: "key", model: "claude-3-7-sonnet", maxTokens: 99999 });
    await expect(provider.complete({
      task: { id: "t1", agent: "planner", title: "Plan", prompt: "Do plan" },
      completedDependencies: [],
    })).rejects.toThrow(/maxTokens must be an integer between 1 and 8192/);
  });

  it("successfully parses a valid Anthropic messages response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "msg_123",
      type: "message",
      role: "assistant",
      content: [
        {
          type: "text",
          text: "Here is the rigorous code review proposal.",
        },
      ],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new AnthropicProvider({
      apiKey: "test-anthropic-key",
      model: "claude-3-7-sonnet",
      maxTokens: 4096,
    });

    const result = await provider.complete({
      task: { id: "rev", agent: "code-reviewer", title: "Review patch", prompt: "Review staged files" },
      completedDependencies: [],
    });

    expect(result.content).toBe("Here is the rigorous code review proposal.");
    expect(result.provider).toBe("anthropic");
    expect(result.model).toBe("claude-3-7-sonnet");
    expect(fetchMock).toHaveBeenCalledOnce();

    const [calledUrl, calledOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe("https://api.anthropic.com/v1/messages");
    expect(calledOptions.method).toBe("POST");
    expect(calledOptions.redirect).toBe("error");

    const headers = calledOptions.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("test-anthropic-key");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("handles non-2xx HTTP responses safely without leaking response bodies", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private quota exceeded", { status: 429 })));
    const provider = new AnthropicProvider({ apiKey: "key", model: "claude-3-7-sonnet" });

    await expect(provider.complete({
      task: { id: "t1", agent: "planner", title: "Plan", prompt: "Do plan" },
      completedDependencies: [],
    })).rejects.toThrow("Anthropic request failed with HTTP 429.");
  });

  it("throws on unexpected response schema", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));
    const provider = new AnthropicProvider({ apiKey: "key", model: "claude-3-7-sonnet" });

    await expect(provider.complete({
      task: { id: "t1", agent: "planner", title: "Plan", prompt: "Do plan" },
      completedDependencies: [],
    })).rejects.toThrow("Anthropic returned an unexpected response format.");
  });
});
