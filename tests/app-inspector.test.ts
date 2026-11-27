import { deflateRawSync } from "node:zlib";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { safeRm } from "./test-helpers.js";
import { detectAppKind, inspectApp } from "../src/core/app-intel/app-inspector.js";
import { parseAxml } from "../src/core/app-intel/axml.js";
import { parsePlist } from "../src/core/app-intel/plist.js";
import { readZip } from "../src/core/app-intel/zip.js";
import { normalizeSourcePath } from "../src/core/app-intel/sourcemap.js";
import { maskSecret } from "../src/core/app-intel/text-scan.js";
import { runApp } from "../src/commands/app.js";

// ---------- fixture builders (test-only encoders for the formats ANVIL reads) ----------

function buildZip(entries: Array<{ name: string; data: Buffer | string; deflate?: boolean }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const data = entry.deflate ? deflateRawSync(raw) : raw;
    const name = Buffer.from(entry.name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(entry.deflate ? 8 : 0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(entry.deflate ? 8 : 0, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

type Attr = [name: string, value: string | number | boolean];
interface Node {
  tag: string;
  attrs?: Attr[];
  children?: Node[];
}

function buildAxml(root: Node): Buffer {
  const strings: string[] = [];
  const index = (value: string) => {
    let at = strings.indexOf(value);
    if (at === -1) at = strings.push(value) - 1;
    return at;
  };
  const chunks: Buffer[] = [];
  const walk = (node: Node) => {
    const attrs = node.attrs ?? [];
    const start = Buffer.alloc(36 + attrs.length * 20);
    start.writeUInt16LE(0x0102, 0);
    start.writeUInt16LE(16, 2);
    start.writeUInt32LE(start.length, 4);
    start.writeUInt32LE(0xffffffff, 12);
    start.writeUInt32LE(0xffffffff, 16);
    start.writeUInt32LE(index(node.tag), 20);
    start.writeUInt16LE(20, 24);
    start.writeUInt16LE(20, 26);
    start.writeUInt16LE(attrs.length, 28);
    attrs.forEach(([name, value], i) => {
      const at = 36 + i * 20;
      start.writeUInt32LE(0xffffffff, at);
      start.writeUInt32LE(index(name), at + 4);
      start.writeUInt16LE(8, at + 12);
      if (typeof value === "string") {
        start.writeUInt32LE(index(value), at + 8);
        start.writeUInt8(0x03, at + 15);
        start.writeUInt32LE(index(value), at + 16);
      } else {
        start.writeUInt32LE(0xffffffff, at + 8);
        start.writeUInt8(typeof value === "boolean" ? 0x12 : 0x10, at + 15);
        start.writeUInt32LE(typeof value === "boolean" ? (value ? 0xffffffff : 0) : value, at + 16);
      }
    });
    chunks.push(start);
    (node.children ?? []).forEach(walk);
    const end = Buffer.alloc(24);
    end.writeUInt16LE(0x0103, 0);
    end.writeUInt16LE(16, 2);
    end.writeUInt32LE(24, 4);
    end.writeUInt32LE(0xffffffff, 12);
    end.writeUInt32LE(0xffffffff, 16);
    end.writeUInt32LE(index(node.tag), 20);
    chunks.push(end);
  };
  walk(root);

  const data = Buffer.concat(
    strings.map((value) => {
      const text = Buffer.from(value, "utf16le");
      const out = Buffer.alloc(2 + text.length + 2);
      out.writeUInt16LE(value.length, 0);
      text.copy(out, 2);
      return out;
    })
  );
  const padded = Buffer.concat([data, Buffer.alloc((4 - (data.length % 4)) % 4)]);
  const offsets = Buffer.alloc(strings.length * 4);
  let cursor = 0;
  strings.forEach((value, i) => {
    offsets.writeUInt32LE(cursor, i * 4);
    cursor += 4 + value.length * 2;
  });
  const poolHeader = Buffer.alloc(28);
  poolHeader.writeUInt16LE(0x0001, 0);
  poolHeader.writeUInt16LE(28, 2);
  poolHeader.writeUInt32LE(28 + offsets.length + padded.length, 4);
  poolHeader.writeUInt32LE(strings.length, 8);
  poolHeader.writeUInt32LE(28 + offsets.length, 20);
  const body = Buffer.concat([poolHeader, offsets, padded, ...chunks]);
  const header = Buffer.alloc(8);
  header.writeUInt16LE(0x0003, 0);
  header.writeUInt16LE(8, 2);
  header.writeUInt32LE(8 + body.length, 4);
  return Buffer.concat([header, body]);
}

function buildAsar(files: Record<string, string>): Buffer {
  const tree: { files: Record<string, unknown> } = { files: {} };
  const contents: Buffer[] = [];
  let offset = 0;
  for (const [file, text] of Object.entries(files)) {
    const parts = file.split("/");
    let node = tree;
    for (const dir of parts.slice(0, -1)) {
      node.files[dir] ??= { files: {} };
      node = node.files[dir] as typeof tree;
    }
    const data = Buffer.from(text);
    node.files[parts[parts.length - 1] ?? ""] = { size: data.length, offset: String(offset) };
    contents.push(data);
    offset += data.length;
  }
  const json = Buffer.from(JSON.stringify(tree));
  const padding = (4 - (json.length % 4)) % 4;
  const headerPickle = Buffer.alloc(8 + json.length + padding);
  headerPickle.writeUInt32LE(4 + json.length + padding, 0);
  headerPickle.writeUInt32LE(json.length, 4);
  json.copy(headerPickle, 8);
  const sizePickle = Buffer.alloc(8);
  sizePickle.writeUInt32LE(4, 0);
  sizePickle.writeUInt32LE(headerPickle.length, 4);
  return Buffer.concat([sizePickle, headerPickle, ...contents]);
}

function wasmName(value: string): number[] {
  return [value.length, ...Buffer.from(value)];
}

function buildWasm(): Buffer {
  const imports = [2, ...wasmName("wasi_snapshot_preview1"), ...wasmName("fd_write"), 0x00, 0x00];
  imports.push(...wasmName("env"), ...wasmName("memory"), 0x02, 0x00, 0x01);
  const importSection = [0x02, imports.length, ...imports];
  const exports = [1, ...wasmName("_start"), 0x00, 0x01];
  const exportSection = [0x07, exports.length, ...exports];
  const custom = [...wasmName("producers"), 0x00];
  const customSection = [0x00, custom.length, ...custom];
  return Buffer.from([
    0x00,
    0x61,
    0x73,
    0x6d,
    0x01,
    0x00,
    0x00,
    0x00,
    ...importSection,
    ...exportSection,
    ...customSection,
  ]);
}

// ---------- tests ----------

const directories: string[] = [];
afterEach(async () => {
  process.exitCode = 0;
  await Promise.all(directories.splice(0).map((directory) => safeRm(directory)));
});

async function workspace(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "anvil-app-"));
  directories.push(directory);
  return directory;
}

const FAKE_AWS = "AKIA" + "ABCDEFGHIJKLMNOP";

describe("app inspector building blocks", () => {
  it("reads stored and deflated zip entries", () => {
    const zip = readZip(
      buildZip([
        { name: "a.txt", data: "hello" },
        { name: "b.txt", data: "world ".repeat(50), deflate: true },
      ])
    );
    expect(zip.entries.map((entry) => entry.name)).toEqual(["a.txt", "b.txt"]);
    expect(zip.read(zip.entries[1]!).toString()).toBe("world ".repeat(50));
    expect(() => readZip(Buffer.from("not a zip at all, definitely not"))).toThrow();
  });

  it("decodes Android binary XML", () => {
    const tree = parseAxml(
      buildAxml({
        tag: "manifest",
        attrs: [["package", "com.example"]],
        children: [{ tag: "uses-sdk", attrs: [["targetSdkVersion", 30]] }],
      })
    );
    expect(tree.tag).toBe("manifest");
    expect(tree.attrs.package).toBe("com.example");
    expect(tree.children[0]?.attrs.targetSdkVersion).toBe(30);
  });

  it("parses binary and XML property lists", () => {
    const xml = Buffer.from(
      '<?xml version="1.0"?><plist><dict><key>Name</key><string>A &amp; B</string><key>On</key><true/><key>List</key><array><integer>3</integer></array></dict></plist>'
    );
    expect(parsePlist(xml)).toEqual({ Name: "A & B", On: true, List: [3] });
    const bplist = Buffer.concat([
      Buffer.from("bplist00"),
      Buffer.from([0xd1, 0x01, 0x02]),
      Buffer.from([0x52, ...Buffer.from("id")]),
      Buffer.from([0x55, ...Buffer.from("com.x")]),
      Buffer.from([0x08, 0x0b, 0x0e]),
      Buffer.from([0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x14]),
    ]);
    expect(parsePlist(bplist)).toEqual({ id: "com.x" });
  });

  it("keeps extracted source paths inside the output folder and masks secrets", () => {
    expect(normalizeSourcePath("webpack://app/./src/a.ts")).toBe("app/src/a.ts");
    expect(normalizeSourcePath("../../../etc/passwd")).toBe("etc/passwd");
    expect(normalizeSourcePath("C:\\Users\\x\\a.js")).toBe("Users/x/a.js");
    expect(maskSecret(FAKE_AWS)).not.toContain("EFGHIJ");
  });

  it("rejects unknown formats", () => {
    expect(() => detectAppKind("x.bin", Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow("Unrecognised app format");
  });
});

describe("anvil app", () => {
  it("reviews an Android APK", async () => {
    const root = await workspace();
    const manifest = buildAxml({
      tag: "manifest",
      attrs: [
        ["package", "com.example.shop"],
        ["versionName", "2.1.0"],
      ],
      children: [
        {
          tag: "uses-sdk",
          attrs: [
            ["minSdkVersion", 24],
            ["targetSdkVersion", 28],
          ],
        },
        { tag: "uses-permission", attrs: [["name", "android.permission.READ_SMS"]] },
        { tag: "uses-permission", attrs: [["name", "android.permission.INTERNET"]] },
        {
          tag: "application",
          attrs: [
            ["debuggable", true],
            ["usesCleartextTraffic", true],
          ],
          children: [
            {
              tag: "activity",
              attrs: [
                ["name", ".MainActivity"],
                ["exported", true],
              ],
              children: [
                {
                  tag: "intent-filter",
                  children: [{ tag: "category", attrs: [["name", "android.intent.category.LAUNCHER"]] }],
                },
              ],
            },
            {
              tag: "receiver",
              attrs: [
                ["name", ".PushReceiver"],
                ["exported", true],
              ],
            },
          ],
        },
      ],
    });
    const apk = path.join(root, "shop.apk");
    await writeFile(
      apk,
      buildZip([
        { name: "AndroidManifest.xml", data: manifest },
        {
          name: "classes.dex",
          data: `dex\n${FAKE_AWS}\nhttp://api.shop-example.net/v1\nhttps://cdn.shop-example.net/x`,
          deflate: true,
        },
        { name: "lib/arm64-v8a/libflutter.so", data: "ELF" },
      ])
    );
    const report = await inspectApp(apk);
    expect(report.kind).toBe("android-apk");
    expect(report.summary).toMatchObject({
      package: "com.example.shop",
      versionName: "2.1.0",
      targetSdk: 28,
      nativeAbis: ["arm64-v8a"],
    });
    expect(report.summary.frameworks).toContain("Flutter");
    expect(report.summary.dangerousPermissions).toEqual(["android.permission.READ_SMS"]);
    const ids = report.findings.map((item) => item.ruleId);
    expect(ids).toEqual(
      expect.arrayContaining([
        "ANVIL-APP-SECRET-AWS",
        "ANVIL-APP-APK-DEBUGGABLE",
        "ANVIL-APP-APK-CLEARTEXT",
        "ANVIL-APP-APK-EXPORTED",
        "ANVIL-APP-APK-OLD-TARGET",
        "ANVIL-APP-APK-UNSIGNED",
        "ANVIL-APP-HTTP-ENDPOINT",
      ])
    );
    expect(report.findings.find((item) => item.ruleId === "ANVIL-APP-APK-EXPORTED")?.message).toContain(
      ".PushReceiver"
    );
    expect(report.findings.find((item) => item.ruleId === "ANVIL-APP-APK-EXPORTED")?.message).not.toContain(
      ".MainActivity"
    );
    expect(JSON.stringify(report)).not.toContain(FAKE_AWS);
    expect(report.endpoints.map((item) => item.host)).toEqual(
      expect.arrayContaining(["api.shop-example.net", "cdn.shop-example.net"])
    );
  });

  it("reviews an iOS IPA", async () => {
    const root = await workspace();
    const plist =
      "<plist><dict><key>CFBundleIdentifier</key><string>com.example.ios</string><key>CFBundleShortVersionString</key><string>3.0</string><key>NSAppTransportSecurity</key><dict><key>NSAllowsArbitraryLoads</key><true/></dict><key>NSCameraUsageDescription</key><string>Scan</string></dict></plist>";
    const ipa = path.join(root, "app.ipa");
    await writeFile(
      ipa,
      buildZip([
        { name: "Payload/Demo.app/Info.plist", data: plist },
        { name: "Payload/Demo.app/Frameworks/Alamofire.framework/Alamofire", data: "bin" },
      ])
    );
    const report = await inspectApp(ipa);
    expect(report.summary).toMatchObject({
      bundleId: "com.example.ios",
      version: "3.0",
      app: "Demo.app",
      frameworks: ["Alamofire"],
    });
    expect(report.summary.privacyUsage).toEqual(["NSCameraUsageDescription"]);
    expect(report.findings.map((item) => item.ruleId)).toContain("ANVIL-APP-IOS-ATS-DISABLED");
  });

  it("reviews an Electron app.asar", async () => {
    const root = await workspace();
    const asar = path.join(root, "app.asar");
    await writeFile(
      asar,
      buildAsar({
        "package.json": JSON.stringify({ name: "desk", version: "1.0.0", main: "main.js", dependencies: { a: "1" } }),
        "main.js": "new BrowserWindow({ webPreferences: { nodeIntegration: true, contextIsolation: false } })",
        "node_modules/x/index.js": "nodeIntegration: true",
      })
    );
    const report = await inspectApp(asar);
    expect(report.kind).toBe("electron-asar");
    expect(report.summary).toMatchObject({ name: "desk", version: "1.0.0", files: 3 });
    const electron = report.findings.filter((item) => item.ruleId.startsWith("ANVIL-APP-ELECTRON"));
    expect(electron.map((item) => item.ruleId).sort()).toEqual([
      "ANVIL-APP-ELECTRON-CONTEXT-ISOLATION",
      "ANVIL-APP-ELECTRON-NODE-INTEGRATION",
    ]);
    expect(electron.every((item) => item.file === "main.js")).toBe(true);
  });

  it("reads WebAssembly imports and exports", async () => {
    const root = await workspace();
    const wasm = path.join(root, "mod.wasm");
    await writeFile(wasm, buildWasm());
    const report = await inspectApp(wasm);
    expect(report.summary).toMatchObject({
      host: "wasi",
      importModules: ["wasi_snapshot_preview1", "env"],
      customSections: ["producers"],
    });
    expect(report.summary.exports).toEqual(["_start (function)"]);
  });

  it("summarizes a source map and extracts sources safely", async () => {
    const root = await workspace();
    const map = path.join(root, "main.js.map");
    await writeFile(
      map,
      JSON.stringify({
        version: 3,
        file: "main.js",
        mappings: "AAAA",
        sources: ["webpack://app/./src/api.ts", "../../../escape.ts", "webpack://app/node_modules/lib/index.js"],
        sourcesContent: [`export const key = "${FAKE_AWS}";`, "export const x = 1;", "module.exports = 1;"],
      })
    );
    const out = path.join(root, "recovered");
    const report = await inspectApp(map, { extractSourcesTo: out });
    expect(report.summary).toMatchObject({ sources: 3, withContent: 3, firstParty: 2, thirdParty: 1, extracted: 2 });
    expect(report.findings.map((item) => item.ruleId)).toEqual(
      expect.arrayContaining(["ANVIL-APP-SECRET-AWS", "ANVIL-APP-SOURCEMAP-CONTENT"])
    );
    expect(await readFile(path.join(out, "app", "src", "api.ts"), "utf8")).toContain("export const key");
    expect((await readdir(out)).sort()).toEqual(["app", "escape.ts"]);
  });

  it("scans a JS bundle and notes its source map", async () => {
    const root = await workspace();
    const bundle = path.join(root, "bundle.js");
    await writeFile(
      bundle,
      'const s="sk_live_' +
        "a".repeat(24) +
        '";fetch("https://api.bundle-example.io/x")\n//# sourceMappingURL=bundle.js.map\n'
    );
    const report = await inspectApp(bundle);
    expect(report.kind).toBe("js-bundle");
    expect(report.findings.map((item) => item.ruleId)).toContain("ANVIL-APP-SECRET-STRIPE");
    expect(report.notes.join(" ")).toContain("bundle.js.map");
  });

  it("exits 1 with --fail-on when a finding is severe enough", async () => {
    const root = await workspace();
    const bundle = path.join(root, "bundle.js");
    await writeFile(bundle, `const k = "${FAKE_AWS}";\n`);
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = (() => true) as typeof process.stdout.write;
    try {
      await runApp("app", [bundle, "--fail-on", "high", "--json"]);
    } finally {
      process.stdout.write = write;
    }
    expect(process.exitCode).toBe(1);
  });
});
