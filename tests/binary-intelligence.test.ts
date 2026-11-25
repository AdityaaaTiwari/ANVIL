import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { safeRm } from "./test-helpers.js";
import { analyzeBinaryIntelligence } from "../src/core/binary-intelligence.js";

describe("ANVIL binary intelligence & provenance engine", () => {
  let root = "";

  afterEach(async () => {
    if (root) await safeRm(root);
    root = "";
  });

  it("discovers binary and bundle assets and classifies magic-byte headers", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "anvil-bin-test-"));
    const assetsDir = path.join(root, "assets");
    await mkdir(assetsDir, { recursive: true });

    await writeFile(path.join(assetsDir, "app.wasm"), Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
    await writeFile(path.join(assetsDir, "bundle.min.js"), "console.log(1);");
    await writeFile(path.join(assetsDir, "bundle.js.map"), '{"version":3,"sources":[]}');
    await writeFile(path.join(assetsDir, "app.apk"), Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]));
    await writeFile(path.join(assetsDir, "traffic.pcap"), "pcap-header");
    await writeFile(path.join(assetsDir, "data.sqlite"), Buffer.from("SQLite format 3\0extra"));

    const report = await analyzeBinaryIntelligence(root);
    expect(report.totalAssets).toBe(6);
    expect(report.categories.wasm).toBe(1);
    expect(report.categories["web-bundle"]).toBe(1);
    expect(report.categories["source-map"]).toBe(1);
    expect(report.categories["mobile-package"]).toBe(1);
    expect(report.categories["network-capture"]).toBe(1);
    expect(report.categories.database).toBe(1);
    expect(report.cleanRoomReport.compliant).toBe(true);

    expect(report.assets.find((a) => a.path.endsWith("app.wasm"))?.detectedFormat).toBe("WASM");
    expect(report.assets.find((a) => a.path.endsWith("app.apk"))?.detectedFormat).toBe("ZIP/Archive");
    expect(report.assets.find((a) => a.path.endsWith("data.sqlite"))?.detectedFormat).toBe("SQLite 3");
  });

  it("flags native binaries in source tree as provenance violation ANVIL-BIN-001", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "anvil-bin-test-"));
    const srcDir = path.join(root, "src", "native");
    await mkdir(srcDir, { recursive: true });
    await writeFile(path.join(srcDir, "helper.dll"), Buffer.from([0x4d, 0x5a, 0x90, 0x00]));

    const report = await analyzeBinaryIntelligence(root);
    expect(report.categories["native-binary"]).toBe(1);
    expect(report.cleanRoomReport.compliant).toBe(false);
    expect(report.assets[0]?.detectedFormat).toBe("PE/COFF");

    const finding = report.cleanRoomReport.findings.find((f) => f.ruleId === "ANVIL-BIN-001");
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("high");
    expect(finding?.file).toContain("src/native/helper.dll");
    expect(finding?.message).toContain("PE/COFF");
  });

  it("flags source maps exposing credentials as ANVIL-BIN-002", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "anvil-bin-test-"));
    const distDir = path.join(root, "public");
    await mkdir(distDir, { recursive: true });
    await writeFile(
      path.join(distDir, "app.js.map"),
      '{"version":3,"sources":["a.ts"],"sourcesContent":["const auth = \\"Bearer secret\\";"]}'
    );

    const report = await analyzeBinaryIntelligence(root);
    expect(report.categories["source-map"]).toBe(1);
    const finding = report.cleanRoomReport.findings.find((f) => f.ruleId === "ANVIL-BIN-002");
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("medium");
  });

  it("flags network captures with authorization headers as ANVIL-BIN-003", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "anvil-bin-test-"));
    const logsDir = path.join(root, "logs");
    await mkdir(logsDir, { recursive: true });
    await writeFile(
      path.join(logsDir, "session.har"),
      '{"log":{"entries":[{"request":{"headers":[{"name":"Authorization","value":"Bearer supersecrettoken"}]}}]}}'
    );

    const report = await analyzeBinaryIntelligence(root);
    expect(report.categories["network-capture"]).toBe(1);
    expect(report.cleanRoomReport.compliant).toBe(false);
    const finding = report.cleanRoomReport.findings.find((f) => f.ruleId === "ANVIL-BIN-003");
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("high");
  });

  it("classifies ELF and Mach-O headers cleanly", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "anvil-bin-test-"));
    const binDir = path.join(root, "dist-bins");
    await mkdir(binDir, { recursive: true });
    await writeFile(path.join(binDir, "libfoo.so"), Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01]));
    await writeFile(path.join(binDir, "libbar.dylib"), Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0x00, 0x00]));

    const report = await analyzeBinaryIntelligence(root);
    expect(report.categories["native-binary"]).toBe(2);
    expect(report.assets.find((a) => a.path.endsWith("libfoo.so"))?.detectedFormat).toBe("ELF");
    expect(report.assets.find((a) => a.path.endsWith("libbar.dylib"))?.detectedFormat).toBe("Mach-O (64-bit)");
    expect(report.cleanRoomReport.compliant).toBe(true);
  });
});
