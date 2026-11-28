import { deflateRawSync } from "node:zlib";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { safeRm } from "./test-helpers.js";
import { analyzeNative, detectNativeFormat, formatHardening, nativeIssues } from "../src/core/app-intel/native.js";
import { inspectApp } from "../src/core/app-intel/app-inspector.js";

// ---------- synthetic binaries ----------

interface ElfOptions {
  type: 2 | 3;
  interp?: boolean;
  execStack?: boolean;
  relro?: boolean;
  bindNow?: boolean;
  needed?: string[];
  runpath?: string;
  symbols?: string[];
}

/** Minimal little-endian ELF64 with program headers, a dynamic section and an optional .dynsym. */
function buildElf(options: ElfOptions): Buffer {
  const strings = ["", ...(options.needed ?? []), ...(options.runpath ? [options.runpath] : [])];
  const symbolNames = options.symbols ?? [];
  const symStrings = ["", ...symbolNames];
  const strtab = Buffer.from(strings.join("\0") + "\0");
  const symStrtab = Buffer.from(symStrings.join("\0") + "\0");
  const offsetOf = (list: string[], value: string) =>
    Buffer.from(list.slice(0, list.indexOf(value)).join("\0") + "\0").length;

  const dyn: Array<[number, number]> = [];
  for (const lib of options.needed ?? []) dyn.push([1, offsetOf(strings, lib)]);
  if (options.runpath) dyn.push([29, offsetOf(strings, options.runpath)]);
  if (options.bindNow) dyn.push([30, 0x8]);
  dyn.push([5, 0]); // DT_STRTAB, patched below
  dyn.push([0, 0]);

  const phdrs: Array<{ type: number; flags: number; offset: number; size: number }> = [];
  const headerSize = 64;
  const phCount = 2 + (options.interp ? 1 : 0) + (options.relro ? 1 : 0) + 1;
  const phOffset = headerSize;
  const dynOffset = phOffset + phCount * 56;
  const dynSize = dyn.length * 16;
  const strOffset = dynOffset + dynSize;
  const symStrOffset = strOffset + strtab.length;
  const symOffset = Math.ceil((symStrOffset + symStrtab.length) / 8) * 8;
  const symSize = symbolNames.length ? (symbolNames.length + 1) * 24 : 0;
  const shOffset = Math.ceil((symOffset + symSize) / 8) * 8;
  const shCount = symbolNames.length ? 3 : 0;
  const total = shOffset + shCount * 64;

  dyn[dyn.length - 2] = [5, strOffset];
  phdrs.push({ type: 1, flags: 5, offset: 0, size: total });
  phdrs.push({ type: 2, flags: 6, offset: dynOffset, size: dynSize });
  if (options.interp) phdrs.push({ type: 3, flags: 4, offset: 0, size: 0 });
  if (options.relro) phdrs.push({ type: 0x6474e552, flags: 4, offset: 0, size: 0 });
  phdrs.push({ type: 0x6474e551, flags: options.execStack ? 7 : 6, offset: 0, size: 0 });

  const buffer = Buffer.alloc(total);
  buffer.writeUInt32BE(0x7f454c46, 0);
  buffer[4] = 2;
  buffer[5] = 1;
  buffer[6] = 1;
  buffer.writeUInt16LE(options.type, 16);
  buffer.writeUInt16LE(62, 18);
  buffer.writeBigUInt64LE(BigInt(phOffset), 32);
  buffer.writeBigUInt64LE(BigInt(shCount ? shOffset : 0), 40);
  buffer.writeUInt16LE(56, 54);
  buffer.writeUInt16LE(phdrs.length, 56);
  buffer.writeUInt16LE(64, 58);
  buffer.writeUInt16LE(shCount, 60);
  phdrs.forEach((ph, i) => {
    const at = phOffset + i * 56;
    buffer.writeUInt32LE(ph.type, at);
    buffer.writeUInt32LE(ph.flags, at + 4);
    buffer.writeBigUInt64LE(BigInt(ph.offset), at + 8);
    buffer.writeBigUInt64LE(BigInt(ph.offset), at + 16);
    buffer.writeBigUInt64LE(BigInt(ph.size), at + 32);
  });
  dyn.forEach(([tag, value], i) => {
    buffer.writeBigUInt64LE(BigInt(tag), dynOffset + i * 16);
    buffer.writeBigUInt64LE(BigInt(value), dynOffset + i * 16 + 8);
  });
  strtab.copy(buffer, strOffset);
  symStrtab.copy(buffer, symStrOffset);
  symbolNames.forEach((name, i) => buffer.writeUInt32LE(offsetOf(symStrings, name), symOffset + (i + 1) * 24));
  if (shCount) {
    const dynsym = shOffset + 64;
    buffer.writeUInt32LE(11, dynsym + 4);
    buffer.writeBigUInt64LE(BigInt(symOffset), dynsym + 24);
    buffer.writeBigUInt64LE(BigInt(symSize), dynsym + 32);
    buffer.writeUInt32LE(2, dynsym + 40);
    const dynstr = shOffset + 128;
    buffer.writeUInt32LE(3, dynstr + 4);
    buffer.writeBigUInt64LE(BigInt(symStrOffset), dynstr + 24);
    buffer.writeBigUInt64LE(BigInt(symStrtab.length), dynstr + 32);
  }
  return buffer;
}

function buildPe(dllCharacteristics: number): Buffer {
  const buffer = Buffer.alloc(0x40 + 24 + 240);
  buffer.write("MZ", 0, "latin1");
  buffer.writeUInt32LE(0x40, 0x3c);
  buffer.writeUInt32LE(0x00004550, 0x40);
  buffer.writeUInt16LE(0x8664, 0x44);
  buffer.writeUInt16LE(240, 0x40 + 20);
  buffer.writeUInt16LE(0x22, 0x40 + 22);
  const optional = 0x40 + 24;
  buffer.writeUInt16LE(0x20b, optional);
  buffer.writeUInt16LE(dllCharacteristics, optional + 70);
  buffer.writeUInt32LE(16, optional + 108);
  return buffer;
}

function buildMacho(flags: number): Buffer {
  const name = Buffer.from("/usr/lib/libSystem.B.dylib\0");
  const cmdSize = Math.ceil((24 + name.length) / 8) * 8;
  const buffer = Buffer.alloc(32 + cmdSize);
  buffer.writeUInt32LE(0xfeedfacf, 0);
  buffer.writeUInt32LE(0x0100000c, 4);
  buffer.writeUInt32LE(2, 12);
  buffer.writeUInt32LE(1, 16);
  buffer.writeUInt32LE(cmdSize, 20);
  buffer.writeUInt32LE(flags, 24);
  buffer.writeUInt32LE(0xc, 32);
  buffer.writeUInt32LE(cmdSize, 36);
  buffer.writeUInt32LE(24, 40);
  name.copy(buffer, 32 + 24);
  return buffer;
}

function buildZip(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const data = deflateRawSync(entry.data);
    const name = Buffer.from(entry.name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    centrals.push(central, name);
    offset += 30 + name.length + data.length;
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

// ---------- tests ----------

const ids = (buffer: Buffer) =>
  nativeIssues(analyzeNative(buffer))
    .map((issue) => issue.ruleId)
    .sort();

describe("native binary hardening", () => {
  it("detects ELF, PE and Mach-O and ignores Java class files", () => {
    expect(detectNativeFormat(buildElf({ type: 2 }))).toBe("elf");
    expect(detectNativeFormat(buildPe(0))).toBe("pe");
    expect(detectNativeFormat(buildMacho(0))).toBe("macho");
    const javaClass = Buffer.alloc(64);
    javaClass.writeUInt32BE(0xcafebabe, 0);
    javaClass.writeUInt32BE(0x00000041, 4);
    expect(detectNativeFormat(javaClass)).toBeUndefined();
  });

  it("flags an unhardened ELF executable", () => {
    const elf = buildElf({ type: 2, execStack: true, needed: ["libc.so.6"], runpath: "/tmp/libs" });
    const info = analyzeNative(elf);
    expect(info).toMatchObject({ type: "executable", arch: "x86-64", pie: false, nx: false, relro: "none" });
    expect(info.libraries).toEqual(["libc.so.6"]);
    expect(info.rpaths).toEqual(["/tmp/libs"]);
    expect(info.canary).toBeUndefined();
    expect(ids(elf)).toEqual([
      "ANVIL-NATIVE-EXEC-STACK",
      "ANVIL-NATIVE-NO-ASLR",
      "ANVIL-NATIVE-NO-RELRO",
      "ANVIL-NATIVE-RPATH",
    ]);
  });

  it("passes a hardened PIE with full RELRO and a stack canary", () => {
    const elf = buildElf({
      type: 3,
      interp: true,
      relro: true,
      bindNow: true,
      runpath: "$ORIGIN/../lib",
      symbols: ["__stack_chk_fail", "__memcpy_chk", "main"],
    });
    const info = analyzeNative(elf);
    expect(info).toMatchObject({ type: "executable", pie: true, nx: true, relro: "full", canary: true, fortify: true });
    expect(ids(elf)).toEqual([]);
    expect(formatHardening(info)).toBe(
      "ELF executable x86-64/64 · pie yes · nx yes · relro full · canary yes · fortify yes · stripped yes"
    );
  });

  it("treats an ELF without an interpreter as a shared library", () => {
    const info = analyzeNative(buildElf({ type: 3, relro: true, symbols: ["foo"] }));
    expect(info).toMatchObject({ type: "shared-library", pie: null, relro: "partial", canary: false });
    expect(nativeIssues(info).map((issue) => issue.ruleId)).toEqual(["ANVIL-NATIVE-NO-CANARY"]);
  });

  it("reads PE mitigations", () => {
    expect(ids(buildPe(0))).toEqual([
      "ANVIL-NATIVE-EXEC-STACK",
      "ANVIL-NATIVE-NO-ASLR",
      "ANVIL-NATIVE-NO-CFG",
      "ANVIL-NATIVE-UNSIGNED",
    ]);
    const hardened = analyzeNative(buildPe(0x40 | 0x100 | 0x4000 | 0x20));
    expect(hardened).toMatchObject({
      format: "pe",
      arch: "x86-64",
      pie: true,
      nx: true,
      cfg: true,
      highEntropyVa: true,
    });
    expect(nativeIssues(hardened).map((issue) => issue.ruleId)).toEqual(["ANVIL-NATIVE-UNSIGNED"]);
  });

  it("reads Mach-O load commands and the PIE flag", () => {
    const info = analyzeNative(buildMacho(0));
    expect(info).toMatchObject({ format: "macho", arch: "arm64", type: "executable", pie: false, signed: false });
    expect(info.libraries).toEqual(["/usr/lib/libSystem.B.dylib"]);
    expect(nativeIssues(analyzeNative(buildMacho(0x200000))).map((issue) => issue.ruleId)).toEqual([
      "ANVIL-NATIVE-UNSIGNED",
    ]);
  });

  it("rejects truncated binaries instead of reading out of bounds", () => {
    const elf = buildElf({ type: 2, needed: ["libc.so.6"] });
    elf.writeBigUInt64LE(BigInt(10_000_000), 32);
    expect(() => analyzeNative(elf)).toThrow("truncated or malformed");
  });
});

describe("anvil app with native code", () => {
  const directories: string[] = [];
  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => safeRm(directory)));
  });

  it("inspects a standalone binary and the native libraries inside an APK", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "anvil-native-"));
    directories.push(root);
    const bad = buildElf({ type: 3, execStack: true, symbols: ["foo"] });

    const binary = path.join(root, "tool.exe");
    await writeFile(binary, buildPe(0x40 | 0x100 | 0x4000));
    const standalone = await inspectApp(binary);
    expect(standalone.kind).toBe("native");
    expect(standalone.summary).toMatchObject({ format: "pe", type: "executable" });

    const apk = path.join(root, "app.apk");
    await writeFile(
      apk,
      buildZip([
        { name: "lib/arm64-v8a/libbad.so", data: bad },
        { name: "lib/armeabi-v7a/libbad.so", data: bad },
      ])
    );
    const report = await inspectApp(apk);
    expect(report.summary.nativeHardening).toHaveLength(2);
    const execStack = report.findings.find((item) => item.ruleId === "ANVIL-NATIVE-EXEC-STACK");
    expect(execStack?.file).toBe("2 native binaries");
    expect(execStack?.message).toContain("lib/arm64-v8a/libbad.so");
  });
});
