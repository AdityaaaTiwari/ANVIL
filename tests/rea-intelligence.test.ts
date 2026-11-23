import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { safeRm } from "./test-helpers.js";
import { analyzeReaIntelligence, getReaMcpServerConfig } from "../src/core/rea-intelligence.js";

describe("REA binary intelligence & clean-room engine", () => {
  let root = "";

  afterEach(async () => {
    if (root) await safeRm(root);
    root = "";
  });

  it("discovers various binary and bundle assets by category", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "anvil-rea-test-"));
    const assetsDir = path.join(root, "assets");
    await mkdir(assetsDir, { recursive: true });

    await writeFile(path.join(assetsDir, "app.wasm"), "dummy-wasm-content");
    await writeFile(path.join(assetsDir, "bundle.min.js"), "console.log(1);");
    await writeFile(path.join(assetsDir, "bundle.js.map"), '{"version":3,"sources":[]}');
    await writeFile(path.join(assetsDir, "app.apk"), "dummy-apk");
    await writeFile(path.join(assetsDir, "traffic.pcap"), "pcap-header");

    const report = await analyzeReaIntelligence(root);
    expect(report.totalAssets).toBe(5);
    expect(report.categories.wasm).toBe(1);
    expect(report.categories["web-bundle"]).toBe(1);
    expect(report.categories["source-map"]).toBe(1);
    expect(report.categories["mobile-package"]).toBe(1);
    expect(report.categories["network-capture"]).toBe(1);
    expect(report.cleanRoomReport.compliant).toBe(true);
  });

  it("flags native binaries in source tree as clean-room violation REA-CR-001", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "anvil-rea-test-"));
    const srcDir = path.join(root, "src", "native");
    await mkdir(srcDir, { recursive: true });
    await writeFile(path.join(srcDir, "helper.dll"), "MZ-binary-header");

    const report = await analyzeReaIntelligence(root);
    expect(report.categories["native-binary"]).toBe(1);
    expect(report.cleanRoomReport.compliant).toBe(false);
    const finding = report.cleanRoomReport.findings.find((f) => f.ruleId === "REA-CR-001");
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("high");
    expect(finding?.file).toContain("src/native/helper.dll");
  });

  it("flags network captures with authorization headers as REA-CR-003", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "anvil-rea-test-"));
    const logsDir = path.join(root, "logs");
    await mkdir(logsDir, { recursive: true });
    await writeFile(
      path.join(logsDir, "session.har"),
      '{"log":{"entries":[{"request":{"headers":[{"name":"Authorization","value":"Bearer supersecrettoken"}]}}]}}'
    );

    const report = await analyzeReaIntelligence(root);
    expect(report.categories["network-capture"]).toBe(1);
    expect(report.cleanRoomReport.compliant).toBe(false);
    const finding = report.cleanRoomReport.findings.find((f) => f.ruleId === "REA-CR-003");
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("high");
  });

  it("provides standard MCP server configuration for rea-agents", () => {
    const config = getReaMcpServerConfig();
    expect(config.command).toBe("npx");
    expect(config.args).toEqual(["-y", "rea-agents", "serve"]);
  });
});
