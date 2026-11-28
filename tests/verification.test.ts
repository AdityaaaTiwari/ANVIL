import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { safeRm, trySymlink } from "./test-helpers.js";
import {
  discoverChecks,
  runVerification,
  formatVerificationResult,
  installVerificationDependencies,
} from "../src/core/verification.js";

async function fileExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

describe("verification engine", () => {
  let root = "";
  afterEach(async () => {
    if (root) await safeRm(root);
    root = "";
  });
  async function setup(scripts: Record<string, string>) {
    root = await mkdtemp(path.join(os.tmpdir(), "anvil-verify-"));
    await writeFile(path.join(root, "package.json"), JSON.stringify({ scripts }));
  }
  it("discovers named checks and hides lifecycle hooks", async () => {
    await setup({ test: "vitest run", build: "tsc", pretest: "echo before", posttest: "echo after", prepare: "tsc" });
    expect((await discoverChecks(root)).map((item) => item.name)).toEqual(["build", "test"]);
  });
  it("allows non-lifecycle scripts with pre/post prefixes such as prettier, preview, postcss", async () => {
    await setup({
      prettier: "echo prettier",
      preview: "echo preview",
      postcss: "echo postcss",
      build: "echo build",
      prebuild: "echo prebuild",
    });
    const checks = (await discoverChecks(root)).map((item) => item.name);
    expect(checks).toEqual(["build", "postcss", "prettier", "preview"]);
  });
  it("validates workspace root, package.json shape, scripts and symlink safety", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "anvil-verify-invalid-"));
    const plainFile = path.join(root, "not-a-dir.txt");
    await writeFile(plainFile, "hi");
    await expect(discoverChecks(plainFile)).rejects.toThrow(/real directory/);

    const arrayManifestDir = path.join(root, "arr");
    await mkdir(arrayManifestDir, { recursive: true });
    await writeFile(path.join(arrayManifestDir, "package.json"), "[]");
    await expect(discoverChecks(arrayManifestDir)).rejects.toThrow(/JSON object/);

    const noScriptsDir = path.join(root, "noscripts");
    await mkdir(noScriptsDir, { recursive: true });
    await writeFile(path.join(noScriptsDir, "package.json"), JSON.stringify({ name: "empty" }));
    expect(await discoverChecks(noScriptsDir)).toEqual([]);

    const symlinkDir = path.join(root, "symlinked");
    await mkdir(symlinkDir, { recursive: true });
    const targetPkg = path.join(root, "external-pkg.json");
    await writeFile(targetPkg, JSON.stringify({ scripts: { test: "echo ok" } }));
    if (await trySymlink(targetPkg, path.join(symlinkDir, "package.json"), "file")) {
      await expect(discoverChecks(symlinkDir)).rejects.toThrow(/regular, non-symlink file/);
    }
  });
  it("rejects unknown, invalid, post-lifecycle scripts and out-of-range timeouts", async () => {
    await setup({
      test: 'node -e "process.exit(0)"',
      pretest: "echo unsafe",
      posttest: "echo post",
      prepare: "echo prep",
    });
    await expect(runVerification(root, "missing")).rejects.toThrow(/not defined/);
    await expect(runVerification(root, "pretest")).rejects.toThrow(/valid, explicit/);
    await expect(runVerification(root, "posttest")).rejects.toThrow(/valid, explicit/);
    await expect(runVerification(root, "prepare")).rejects.toThrow(/valid, explicit/);
    await expect(runVerification(root, "bad script!")).rejects.toThrow(/valid, explicit/);
    await expect(runVerification(root, "test", { timeoutMs: 999 })).rejects.toThrow(/1,000 and 600,000/);
    await expect(runVerification(root, "test", { timeoutMs: 600_001 })).rejects.toThrow(/1,000 and 600,000/);
    await expect(runVerification(root, "test", { timeoutMs: 1500.5 })).rejects.toThrow(/1,000 and 600,000/);
  });
  it("executes only the selected script and records its actual exit code", async () => {
    await setup({ verify: "node -e \"console.log('ANVIL_CHECK_OK')\"" });
    const result = await runVerification(root, "verify");
    expect(result.status).toBe("passed");
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("ANVIL_CHECK_OK");
    expect(formatVerificationResult(result)).toContain("PASSED");
  });
  it("truncates output exceeding 64 KiB and formats null exitCode/empty output cleanly", async () => {
    await setup({ noisy: "node -e \"process.stdout.write('x'.repeat(70000))\"" });
    const result = await runVerification(root, "noisy");
    expect(result.status).toBe("passed");
    expect(result.outputTruncated).toBe(true);
    expect(result.output.length).toBe(64 * 1024);
    expect(formatVerificationResult(result)).toContain("[Output truncated at 64 KiB.]");

    const formattedEmpty = formatVerificationResult({
      ...result,
      status: "spawn_error",
      exitCode: null,
      output: "",
      outputTruncated: false,
    });
    expect(formattedEmpty).toContain("`not available`");
    expect(formattedEmpty).toContain("(No output captured.)");
  });
  it("marks long-running scripts as timed_out when exceeding timeoutMs", async () => {
    await setup({ slow: 'node -e "setTimeout(() => {}, 2500)"' });
    const result = await runVerification(root, "slow", { timeoutMs: 1000 });
    expect(result.status).toBe("timed_out");
  });
  it("does not forward arbitrary environment secrets to project scripts", async () => {
    await setup({ verify: "node -e \"console.log(process.env.ANVIL_TEST_SECRET || 'NOT_FORWARDED')\"" });
    process.env.ANVIL_TEST_SECRET = "test-secret-value";
    try {
      const result = await runVerification(root, "verify");
      expect(result.output).toContain("NOT_FORWARDED");
      expect(result.output).not.toContain("test-secret-value");
    } finally {
      delete process.env.ANVIL_TEST_SECRET;
    }
  });
  it("records a failing script as failed", async () => {
    await setup({ verify: 'node -e "process.exit(7)"' });
    const result = await runVerification(root, "verify");
    expect(result.status).toBe("failed");
    expect(result.exitCode).toBe(7);
  });
  it("requires a regular lockfile before dependency preparation", async () => {
    await setup({ verify: 'node -e "process.exit(0)"' });
    await expect(installVerificationDependencies(root)).rejects.toThrow(/requires a regular package-lock.json/);

    const externalLock = path.join(root, "external-lock.json");
    await writeFile(externalLock, "{}");
    if (await trySymlink(externalLock, path.join(root, "package-lock.json"), "file")) {
      await expect(installVerificationDependencies(root)).rejects.toThrow(/requires a regular package-lock.json/);
    }
  });
  it("validates dependency installation timeout and cleans temporary npm configs between runs", async () => {
    await setup({ verify: 'node -e "process.exit(0)"' });
    await writeFile(path.join(root, "package-lock.json"), "{invalid-json");
    await expect(installVerificationDependencies(root, { timeoutMs: 999 })).rejects.toThrow(
      /between 1,000 and 600,000/
    );
    await expect(installVerificationDependencies(root, { timeoutMs: 600_001 })).rejects.toThrow(
      /between 1,000 and 600,000/
    );

    const first = await installVerificationDependencies(root, { timeoutMs: 15_000 });
    expect(first.status).toBe("failed");
    expect(await fileExists(path.join(root, ".anvil-npm-user-config"))).toBe(false);
    expect(await fileExists(path.join(root, ".anvil-npm-global-config"))).toBe(false);

    // Repeating in the same directory must not fail with EEXIST on temporary config files.
    const second = await installVerificationDependencies(root, { timeoutMs: 15_000 });
    expect(second.status).toBe("failed");
    expect(await fileExists(path.join(root, ".anvil-npm-user-config"))).toBe(false);
  });
});
