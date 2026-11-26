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

  it("parses PE x86_64, ELF x86_64, Mach-O arm64, WASI hints, SHA-256 digests, and detects .node addons", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "anvil-bin-deep-"));
    const buildDir = path.join(root, "native-build");
    await mkdir(buildDir, { recursive: true });

    // Minimal valid PE32+ x86_64 DLL header at e_lfanew = 0x80
    const peBuf = Buffer.alloc(0xc0, 0);
    peBuf[0] = 0x4d;
    peBuf[1] = 0x5a;
    peBuf.writeUInt32LE(0x80, 0x3c);
    peBuf.write("PE\0\0", 0x80, "latin1");
    peBuf.writeUInt16LE(0x8664, 0x84); // Machine: x86_64
    peBuf.writeUInt16LE(0x2000, 0x96); // Characteristics (e_lfanew + 22): DLL
    peBuf.writeUInt16LE(0x20b, 0x98); // Optional header magic (e_lfanew + 24): PE32+
    await writeFile(path.join(buildDir, "addon.node"), peBuf);

    // Valid 64-bit little-endian ELF shared object for x86_64
    const elfBuf = Buffer.alloc(64, 0);
    elfBuf[0] = 0x7f;
    elfBuf[1] = 0x45;
    elfBuf[2] = 0x4c;
    elfBuf[3] = 0x46;
    elfBuf[4] = 2; // 64-bit
    elfBuf[5] = 1; // LE
    elfBuf.writeUInt16LE(3, 16); // ET_DYN
    elfBuf.writeUInt16LE(62, 18); // EM_X86_64
    await writeFile(path.join(buildDir, "mod.so"), elfBuf);

    // Mach-O 64-bit LE arm64 dylib (0xcffaedfe, cpu=0x0100000c, filetype=6)
    const machBuf = Buffer.alloc(32, 0);
    machBuf.writeUInt32BE(0xcffaedfe, 0);
    machBuf.writeUInt32LE(0x0100000c, 4);
    machBuf.writeUInt32LE(6, 12);
    await writeFile(path.join(buildDir, "libarm.dylib"), machBuf);

    // WASM with WASI import token
    const wasmBuf = Buffer.concat([
      Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]),
      Buffer.from("wasi_snapshot_preview1"),
    ]);
    await writeFile(path.join(buildDir, "edge.wasm"), wasmBuf);

    const report = await analyzeBinaryIntelligence(root);
    const addon = report.assets.find((a) => a.path.endsWith("addon.node"));
    expect(addon?.category).toBe("native-binary");
    expect(addon?.binaryMetadata?.arch).toBe("x86_64");
    expect(addon?.binaryMetadata?.objectKind).toBe("shared-library");
    expect(addon?.sha256).toMatch(/^[0-9a-f]{64}$/);

    const mod = report.assets.find((a) => a.path.endsWith("mod.so"));
    expect(mod?.binaryMetadata?.bits).toBe(64);
    expect(mod?.binaryMetadata?.endianness).toBe("little");
    expect(mod?.binaryMetadata?.arch).toBe("x86_64");

    const mach = report.assets.find((a) => a.path.endsWith("libarm.dylib"));
    expect(mach?.binaryMetadata?.arch).toBe("arm64");
    expect(mach?.binaryMetadata?.objectKind).toBe("shared-library");

    const wasm = report.assets.find((a) => a.path.endsWith("edge.wasm"));
    expect(wasm?.binaryMetadata?.wasiImports).toContain("wasi_snapshot_preview1");
    expect(report.cleanRoomReport.compliant).toBe(true);
  });

  it("flags disguised native binaries (ANVIL-BIN-004) without false-triggering on plain text MZ files", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "anvil-bin-spoof-"));
    await mkdir(path.join(root, "public"), { recursive: true });

    // Real ELF disguised as .png
    const fakePng = Buffer.alloc(32, 0);
    fakePng[0] = 0x7f;
    fakePng[1] = 0x45;
    fakePng[2] = 0x4c;
    fakePng[3] = 0x46;
    fakePng[4] = 2;
    fakePng[5] = 1;
    fakePng.writeUInt16LE(62, 18);
    await writeFile(path.join(root, "public", "logo.png"), fakePng);

    // Plain JS file starting with MZ comment/text (no valid PE\0\0 header) must NOT false positive
    await writeFile(path.join(root, "public", "safe.js"), "MZ = { version: 1 }; // safe js");

    const report = await analyzeBinaryIntelligence(root);
    expect(report.cleanRoomReport.compliant).toBe(false);
    const spoofFindings = report.cleanRoomReport.findings.filter((f) => f.ruleId === "ANVIL-BIN-004");
    expect(spoofFindings).toHaveLength(1);
    expect(spoofFindings[0]?.severity).toBe("critical");
    expect(spoofFindings[0]?.file).toBe("public/logo.png");
  });
});
