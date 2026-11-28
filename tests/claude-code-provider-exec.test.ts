import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";

const childProcessMock = vi.hoisted(() => ({
  execFile: vi.fn(),
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const customPromisify = (...args: unknown[]) =>
    new Promise((resolve, reject) => {
      const cb = (error: Error | null, stdout = "", stderr = "") => {
        if (error) reject(error);
        else resolve({ stdout, stderr });
      };
      childProcessMock.execFile(...args, cb);
    });
  Object.assign(childProcessMock.execFile, { [promisify.custom]: customPromisify });
  return {
    ...actual,
    execFile: childProcessMock.execFile,
  };
});

import { buildClaudeCodeArgs, ClaudeCodeProvider, parseClaudeCodeOutput } from "../src/ai/claude-code-provider.js";

describe("claude-code-provider helpers and execution", () => {
  afterEach(() => {
    childProcessMock.execFile.mockReset();
  });

  it("builds CLI arguments without --model when model is omitted", () => {
    const args = buildClaudeCodeArgs("Inspect repository");
    expect(args).not.toContain("--model");
    expect(args).toContain("-p");
    expect(args).toContain("Inspect repository");
  });

  it("handles error payloads and invalid JSON in parseClaudeCodeOutput", () => {
    expect(() => parseClaudeCodeOutput("   ")).toThrow();
    expect(() => parseClaudeCodeOutput(JSON.stringify({ is_error: true, result: "Rate limit exceeded" }))).toThrow(
      "Rate limit exceeded"
    );
    expect(() => parseClaudeCodeOutput(JSON.stringify({ is_error: true }))).toThrow();
    expect(parseClaudeCodeOutput(JSON.stringify({ result: "Done" }))).toEqual({ text: "Done" });
    expect(() => parseClaudeCodeOutput("Plain stdout fallback")).toThrow("Claude Code returned invalid JSON output");
  });

  it("rejects empty messages before invoking the CLI", async () => {
    const provider = new ClaudeCodeProvider({ model: "sonnet" });
    await expect(provider.generate({ messages: [] })).rejects.toThrow();
    expect(childProcessMock.execFile).not.toHaveBeenCalled();
  });

  it("generates and completes agent tasks through mocked claude CLI execution", async () => {
    childProcessMock.execFile
      .mockImplementationOnce(
        (
          file: string,
          args: string[],
          options: Record<string, unknown>,
          callback: (err: Error | null, stdout: string, stderr: string) => void
        ) => {
          expect(file).toBe("claude");
          expect(args).toContain("--model");
          expect(args).toContain("opus");
          expect(options.timeout).toBe(25_000);
          callback(null, JSON.stringify({ result: "Approved changes", session_id: "sess-9" }), "");
        }
      )
      .mockImplementationOnce(
        (
          file: string,
          args: string[],
          options: Record<string, unknown>,
          callback: (err: Error | null, stdout: string, stderr: string) => void
        ) => {
          expect(file).toBe("claude");
          expect(args).toContain("--model");
          expect(args).toContain("sonnet");
          expect(options.timeout).toBe(25_000);
          callback(null, JSON.stringify({ result: "Approved changes", session_id: "sess-10" }), "");
        }
      );

    const provider = new ClaudeCodeProvider({ model: "sonnet", timeoutMs: 25_000 });
    expect(provider.name).toBe("claude-code");

    const generated = await provider.generate({
      model: "opus",
      messages: [
        { role: "system", content: "Be concise" },
        { role: "user", content: "Review diff" },
        { role: "assistant", content: "Checking..." },
      ],
    });
    expect(generated).toEqual({
      provider: "claude-code",
      model: "opus",
      text: "Approved changes",
    });

    const completed = await provider.complete({
      task: {
        id: "task-2",
        agent: "reviewer",
        title: "Security review",
        prompt: "Audit PR diff",
      },
      completedDependencies: [
        { id: "task-1", fromAgent: "architect", taskTitle: "Architecture plan", result: "Looks modular" },
      ],
      projectContext: "TypeScript CLI",
    });
    expect(completed.content).toBe("Approved changes");
    expect(completed.provider).toBe("claude-code");
  });

  it("surfaces actionable errors for ENOENT and non-zero CLI failures", async () => {
    childProcessMock.execFile.mockImplementationOnce(
      (
        _file: string,
        _args: string[],
        _options: Record<string, unknown>,
        callback: (err: Error | null, stdout: string, stderr: string) => void
      ) => {
        const enoent = Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" });
        callback(enoent, "", "");
      }
    );

    const provider = new ClaudeCodeProvider();
    await expect(
      provider.complete({
        task: { id: "t1", agent: "planner", title: "Plan", prompt: "Plan tests" },
        completedDependencies: [],
      })
    ).rejects.toThrow(/Claude Code CLI|claude/i);

    childProcessMock.execFile.mockImplementationOnce(
      (
        _file: string,
        _args: string[],
        _options: Record<string, unknown>,
        callback: (err: Error | null, stdout: string, stderr: string) => void
      ) => {
        const execErr = Object.assign(new Error("Command failed"), { stderr: "auth required" });
        callback(execErr, "", "auth required");
      }
    );

    await expect(provider.generate({ messages: [{ role: "user", content: "hello" }] })).rejects.toThrow(
      /auth required|Command failed/
    );
  });
});
