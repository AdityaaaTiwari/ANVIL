import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const childProcessMock = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: childProcessMock.spawn,
  };
});

import {
  findPositionalArgs,
  readAgentDurationBudgets,
  readAgentTokenBudgets,
  resolvePackageVersion,
  runSandboxProbe,
} from "../src/commands/shared.js";

function createFakeChild() {
  const emitter = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    kill: ReturnType<typeof vi.fn>;
  };
  emitter.stdout = new PassThrough();
  emitter.stderr = new PassThrough();
  emitter.kill = vi.fn();
  return emitter;
}

describe("resolvePackageVersion", () => {
  it("resolves a valid semantic version from package.json", () => {
    const version = resolvePackageVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
    expect(version).not.toBe("0.0.0");
  });
});

describe("findPositionalArgs", () => {
  it("skips boolean flags and value-flag arguments cleanly", () => {
    const valueFlags = new Set(["--path", "--target"]);
    const positional = findPositionalArgs(
      ["--json", "--path", "./app", "src", "--target=claude", "--help", "extra"],
      valueFlags
    );
    expect(positional).toEqual(["src", "extra"]);
  });

  it("handles trailing value flags without a value and empty defaults", () => {
    expect(findPositionalArgs(["--flag", "one", "two"])).toEqual(["one", "two"]);
    expect(findPositionalArgs(["one", "--path"], new Set(["--path"]))).toEqual(["one"]);
  });
});

describe("runSandboxProbe", () => {
  afterEach(() => {
    vi.useRealTimers();
    childProcessMock.spawn.mockReset();
  });

  it("collects stdout and stderr up to 4096 bytes when docker exits 0", async () => {
    const child = createFakeChild();
    childProcessMock.spawn.mockReturnValue(child);

    const promise = runSandboxProbe(["--version"]);
    expect(childProcessMock.spawn).toHaveBeenCalledWith("docker", ["--version"], {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.write("Docker version ");
    child.stderr.write("27.0.0\n");
    child.stdout.end();
    child.stderr.end();
    child.emit("close", 0);

    await expect(promise).resolves.toBe("Docker version 27.0.0\n");
  });

  it("caps buffered probe output at 4096 bytes", async () => {
    const child = createFakeChild();
    childProcessMock.spawn.mockReturnValue(child);

    const promise = runSandboxProbe(["info"]);
    child.stdout.write("a".repeat(3000));
    child.stderr.write("b".repeat(2500));
    child.stdout.end();
    child.stderr.end();
    child.emit("close", 0);

    const result = await promise;
    expect(result.length).toBeLessThanOrEqual(4096);
    expect(result.startsWith("a".repeat(3000))).toBe(true);
  });

  it("rejects with exit code when docker exits non-zero", async () => {
    const failing = createFakeChild();
    childProcessMock.spawn.mockReturnValueOnce(failing);

    const p1 = runSandboxProbe(["info"]);
    failing.stderr.write("Cannot connect to the Docker daemon\n");
    failing.stderr.end();
    failing.emit("close", 1);
    await expect(p1).rejects.toThrow("Docker probe exited with status 1.");

    const silentFail = createFakeChild();
    childProcessMock.spawn.mockReturnValueOnce(silentFail);

    const p2 = runSandboxProbe(["info"]);
    silentFail.emit("close", 2);
    await expect(p2).rejects.toThrow("Docker probe exited with status 2.");
  });

  it("rejects on spawn error events", async () => {
    const child = createFakeChild();
    childProcessMock.spawn.mockReturnValue(child);

    const promise = runSandboxProbe(["--version"]);
    child.emit("error", new Error("spawn docker ENOENT"));

    await expect(promise).rejects.toThrow("spawn docker ENOENT");
  });

  it("kills the child process and rejects when the 15s timeout elapses", async () => {
    vi.useFakeTimers();
    const child = createFakeChild();
    childProcessMock.spawn.mockReturnValue(child);

    const promise = runSandboxProbe(["ps"]);
    const assertion = expect(promise).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });
});

describe("agent budget environment readers", () => {
  const tokenKey = "ANVIL_MAX_ESTIMATED_TOKENS_PER_AGENT";
  const durationKey = "ANVIL_MAX_TASK_DURATION_MS_BY_AGENT";
  let prevToken: string | undefined;
  let prevDuration: string | undefined;

  beforeEach(() => {
    prevToken = process.env[tokenKey];
    prevDuration = process.env[durationKey];
    delete process.env[tokenKey];
    delete process.env[durationKey];
  });

  afterEach(() => {
    if (prevToken === undefined) delete process.env[tokenKey];
    else process.env[tokenKey] = prevToken;
    if (prevDuration === undefined) delete process.env[durationKey];
    else process.env[durationKey] = prevDuration;
  });

  it("returns undefined when env vars are unset or empty", () => {
    expect(readAgentTokenBudgets()).toBeUndefined();
    expect(readAgentDurationBudgets()).toBeUndefined();
  });

  it("parses valid positive integer maps", () => {
    process.env[tokenKey] = JSON.stringify({ planner: 5000, "code-reviewer": 12000 });
    process.env[durationKey] = JSON.stringify({ planner: 45000 });
    expect(readAgentTokenBudgets()).toEqual({ planner: 5000, "code-reviewer": 12000 });
    expect(readAgentDurationBudgets()).toEqual({ planner: 45000 });
  });

  it("rejects arrays, primitives, and invalid budget values", () => {
    process.env[tokenKey] = "[1,2]";
    expect(() => readAgentTokenBudgets()).toThrow(
      "ANVIL_MAX_ESTIMATED_TOKENS_PER_AGENT must be a JSON object mapping agent IDs to token limits."
    );

    process.env[tokenKey] = JSON.stringify({ planner: 0 });
    expect(() => readAgentTokenBudgets()).toThrow();

    process.env[tokenKey] = JSON.stringify({ "": 100 });
    expect(() => readAgentTokenBudgets()).toThrow();

    process.env[durationKey] = '"fast"';
    expect(() => readAgentDurationBudgets()).toThrow(/ANVIL_MAX_TASK_DURATION_MS_BY_AGENT/);

    process.env[durationKey] = JSON.stringify({ planner: -5 });
    expect(() => readAgentDurationBudgets()).toThrow();

    process.env[durationKey] = JSON.stringify({ planner: 12.5 });
    expect(() => readAgentDurationBudgets()).toThrow();
  });
});
