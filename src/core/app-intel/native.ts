/**
 * Native binary hardening review ("checksec") for ELF, PE and Mach-O files,
 * in pure TypeScript. Reports what each binary links against and whether the
 * usual exploit mitigations are on.
 */

export type NativeFormat = "elf" | "pe" | "macho";

export interface NativeHardening {
  format: NativeFormat;
  /** "executable", "shared-library", "object" or "dll". */
  type: string;
  arch: string;
  bits: 32 | 64;
  /** Position-independent executable / ASLR. `null` when it does not apply (shared libraries). */
  pie: boolean | null;
  nx: boolean;
  relro?: "none" | "partial" | "full" | undefined;
  canary?: boolean | undefined;
  fortify?: boolean | undefined;
  cfg?: boolean | undefined;
  highEntropyVa?: boolean | undefined;
  signed?: boolean | undefined;
  stripped?: boolean | undefined;
  dotnet?: boolean | undefined;
  encrypted?: boolean | undefined;
  libraries: string[];
  rpaths: string[];
  slices?: string[] | undefined;
}

export interface NativeIssue {
  ruleId: string;
  severity: "high" | "medium" | "low";
  message: string;
  remediation: string;
}

class Bytes {
  constructor(
    readonly buffer: Buffer,
    readonly littleEndian: boolean
  ) {}

  private check(offset: number, size: number): void {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset + size > this.buffer.length) {
      throw new Error("Binary is truncated or malformed");
    }
  }

  u8(offset: number): number {
    this.check(offset, 1);
    return this.buffer.readUInt8(offset);
  }

  u16(offset: number): number {
    this.check(offset, 2);
    return this.littleEndian ? this.buffer.readUInt16LE(offset) : this.buffer.readUInt16BE(offset);
  }

  u32(offset: number): number {
    this.check(offset, 4);
    return this.littleEndian ? this.buffer.readUInt32LE(offset) : this.buffer.readUInt32BE(offset);
  }

  u64(offset: number): number {
    this.check(offset, 8);
    const value = this.littleEndian ? this.buffer.readBigUInt64LE(offset) : this.buffer.readBigUInt64BE(offset);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Binary offset is too large");
    return Number(value);
  }

  cstring(offset: number, max = 4096): string {
    if (offset < 0 || offset >= this.buffer.length) return "";
    const end = this.buffer.indexOf(0, offset);
    return this.buffer.toString("latin1", offset, Math.min(end === -1 ? this.buffer.length : end, offset + max));
  }
}

const MAX_SYMBOLS = 50_000;

export function detectNativeFormat(buffer: Buffer): NativeFormat | undefined {
  if (buffer.length < 64) return undefined;
  if (buffer.readUInt32BE(0) === 0x7f454c46) return "elf";
  if (buffer.readUInt16LE(0) === 0x5a4d) {
    const peOffset = buffer.readUInt32LE(0x3c);
    if (peOffset + 4 <= buffer.length && buffer.readUInt32LE(peOffset) === 0x00004550) return "pe";
  }
  const magic = buffer.readUInt32LE(0);
  if (magic === 0xfeedface || magic === 0xfeedfacf) return "macho";
  // Fat Mach-O shares 0xcafebabe with Java class files; a fat header has only a handful of slices.
  if (buffer.readUInt32BE(0) === 0xcafebabe && buffer.readUInt32BE(4) > 0 && buffer.readUInt32BE(4) < 20)
    return "macho";
  return undefined;
}

// ---------------------------------------------------------------- ELF

const ELF_MACHINES: Record<number, string> = {
  3: "x86",
  8: "mips",
  20: "ppc",
  21: "ppc64",
  40: "arm",
  62: "x86-64",
  183: "arm64",
  243: "riscv",
};

function analyzeElf(buffer: Buffer): NativeHardening {
  const bits = buffer[4] === 2 ? 64 : 32;
  const b = new Bytes(buffer, buffer[5] !== 2);
  const is64 = bits === 64;
  const type = b.u16(16);
  const phoff = is64 ? b.u64(32) : b.u32(28);
  const shoff = is64 ? b.u64(40) : b.u32(32);
  const phentsize = b.u16(is64 ? 54 : 42);
  const phnum = b.u16(is64 ? 56 : 44);
  const shentsize = b.u16(is64 ? 58 : 46);
  const shnum = b.u16(is64 ? 60 : 48);

  const loads: Array<{ vaddr: number; offset: number; size: number }> = [];
  let interp = false;
  let dynamic: { offset: number; size: number } | undefined;
  let gnuStack: number | undefined;
  let gnuRelro = false;
  for (let i = 0; i < phnum && i < 512; i += 1) {
    const at = phoff + i * phentsize;
    const pType = b.u32(at);
    const flags = is64 ? b.u32(at + 4) : b.u32(at + 24);
    const offset = is64 ? b.u64(at + 8) : b.u32(at + 4);
    const vaddr = is64 ? b.u64(at + 16) : b.u32(at + 8);
    const filesz = is64 ? b.u64(at + 32) : b.u32(at + 16);
    if (pType === 1) loads.push({ vaddr, offset, size: filesz });
    else if (pType === 2) dynamic = { offset, size: filesz };
    else if (pType === 3) interp = true;
    else if (pType === 0x6474e551) gnuStack = flags;
    else if (pType === 0x6474e552) gnuRelro = true;
  }
  const toOffset = (vaddr: number) => {
    const segment = loads.find((load) => vaddr >= load.vaddr && vaddr < load.vaddr + load.size);
    return segment ? vaddr - segment.vaddr + segment.offset : vaddr;
  };

  const needed: number[] = [];
  const rpathOffsets: number[] = [];
  let strtab = 0;
  let bindNow = false;
  let pieFlag = false;
  if (dynamic) {
    const entry = is64 ? 16 : 8;
    for (
      let at = dynamic.offset;
      at + entry <= dynamic.offset + dynamic.size && at + entry <= buffer.length;
      at += entry
    ) {
      const tag = is64 ? b.u64(at) : b.u32(at);
      const value = is64 ? b.u64(at + 8) : b.u32(at + 4);
      if (tag === 0) break;
      if (tag === 1) needed.push(value);
      else if (tag === 5) strtab = toOffset(value);
      else if (tag === 15 || tag === 29) rpathOffsets.push(value);
      else if (tag === 24) bindNow = true;
      else if (tag === 30 && value & 0x8) bindNow = true;
      else if (tag === 0x6ffffffb) {
        if (value & 0x1) bindNow = true;
        if (value & 0x08000000) pieFlag = true;
      }
    }
  }

  const symbols = new Set<string>();
  let stripped = true;
  if (shoff && shnum) {
    for (let i = 0; i < shnum && i < 4096; i += 1) {
      const at = shoff + i * shentsize;
      if (at + shentsize > buffer.length) break;
      const shType = b.u32(at + 4);
      if (shType === 2) stripped = false;
      if (shType !== 11 && shType !== 2) continue;
      const offset = is64 ? b.u64(at + 24) : b.u32(at + 16);
      const size = is64 ? b.u64(at + 32) : b.u32(at + 20);
      const link = b.u32(is64 ? at + 40 : at + 24);
      const strAt = shoff + link * shentsize;
      if (strAt + shentsize > buffer.length) continue;
      const strOffset = is64 ? b.u64(strAt + 24) : b.u32(strAt + 16);
      const symSize = is64 ? 24 : 16;
      for (let s = offset; s + symSize <= offset + size && s + symSize <= buffer.length; s += symSize) {
        if (symbols.size >= MAX_SYMBOLS) break;
        const name = b.cstring(strOffset + b.u32(s), 256);
        if (name) symbols.add(name);
      }
    }
  }

  const isShared = type === 3 && !interp && !pieFlag;
  return {
    format: "elf",
    type: type === 2 ? "executable" : isShared ? "shared-library" : type === 3 ? "executable" : "object",
    arch: ELF_MACHINES[b.u16(18)] ?? `machine-${b.u16(18)}`,
    bits,
    pie: isShared ? null : type === 3,
    nx: gnuStack !== undefined && (gnuStack & 1) === 0,
    relro: gnuRelro ? (bindNow ? "full" : "partial") : "none",
    // Without any symbol table (static and stripped) the canary and fortify checks can't tell.
    canary: symbols.size
      ? symbols.has("__stack_chk_fail") || symbols.has("__stack_chk_guard") || symbols.has("__intel_security_cookie")
      : undefined,
    fortify: symbols.size
      ? [...symbols].some((name) => /^__\w+_chk$/.test(name) && name !== "__stack_chk_fail")
      : undefined,
    stripped,
    libraries: strtab ? needed.map((offset) => b.cstring(strtab + offset)).filter(Boolean) : [],
    rpaths: strtab ? rpathOffsets.flatMap((offset) => b.cstring(strtab + offset).split(":")).filter(Boolean) : [],
  };
}

// ---------------------------------------------------------------- PE

const PE_MACHINES: Record<number, string> = { 0x14c: "x86", 0x8664: "x86-64", 0xaa64: "arm64", 0x1c4: "arm" };

function analyzePe(buffer: Buffer): NativeHardening {
  const b = new Bytes(buffer, true);
  const pe = b.u32(0x3c);
  const machine = b.u16(pe + 4);
  const sectionCount = b.u16(pe + 6);
  const optionalSize = b.u16(pe + 20);
  const characteristics = b.u16(pe + 22);
  const optional = pe + 24;
  const is64 = b.u16(optional) === 0x20b;
  const dllCharacteristics = b.u16(optional + 70);
  const dirCount = b.u32(optional + (is64 ? 108 : 92));
  const dirs = optional + (is64 ? 112 : 96);
  const directory = (index: number) =>
    index < dirCount ? { rva: b.u32(dirs + index * 8), size: b.u32(dirs + index * 8 + 4) } : { rva: 0, size: 0 };

  const sections: Array<{ va: number; vsize: number; raw: number; rawSize: number }> = [];
  const sectionTable = optional + optionalSize;
  for (let i = 0; i < sectionCount && i < 96; i += 1) {
    const at = sectionTable + i * 40;
    sections.push({ vsize: b.u32(at + 8), va: b.u32(at + 12), rawSize: b.u32(at + 16), raw: b.u32(at + 20) });
  }
  const rvaToOffset = (rva: number) => {
    const section = sections.find((s) => rva >= s.va && rva < s.va + Math.max(s.vsize, s.rawSize));
    return section ? rva - section.va + section.raw : -1;
  };

  const libraries: string[] = [];
  const imports = directory(1);
  const importOffset = imports.rva ? rvaToOffset(imports.rva) : -1;
  if (importOffset >= 0) {
    for (let at = importOffset; at + 20 <= buffer.length && libraries.length < 256; at += 20) {
      const nameRva = b.u32(at + 12);
      if (!nameRva && !b.u32(at) && !b.u32(at + 16)) break;
      const name = b.cstring(rvaToOffset(nameRva), 260);
      if (name) libraries.push(name);
    }
  }

  return {
    format: "pe",
    type: characteristics & 0x2000 ? "dll" : "executable",
    arch: PE_MACHINES[machine] ?? `machine-0x${machine.toString(16)}`,
    bits: is64 ? 64 : 32,
    pie: (dllCharacteristics & 0x40) !== 0,
    nx: (dllCharacteristics & 0x100) !== 0,
    cfg: (dllCharacteristics & 0x4000) !== 0,
    highEntropyVa: is64 ? (dllCharacteristics & 0x20) !== 0 : undefined,
    signed: directory(4).size > 0,
    dotnet: directory(14).size > 0,
    libraries,
    rpaths: [],
  };
}

// ---------------------------------------------------------------- Mach-O

const MACHO_CPUS: Record<number, string> = {
  7: "x86",
  0x01000007: "x86-64",
  12: "arm",
  0x0100000c: "arm64",
  0x0200000c: "arm64_32",
};

function analyzeMachoSlice(buffer: Buffer, start: number): NativeHardening {
  const b = new Bytes(buffer, true);
  const is64 = b.u32(start) === 0xfeedfacf;
  const cpu = b.u32(start + 4);
  const fileType = b.u32(start + 12);
  const ncmds = b.u32(start + 16);
  const flags = b.u32(start + 24);
  let at = start + (is64 ? 32 : 28);
  const libraries: string[] = [];
  const rpaths: string[] = [];
  let signed = false;
  let encrypted = false;
  const symbols = new Set<string>();
  let hasSymtab = false;
  for (let i = 0; i < ncmds && i < 1024; i += 1) {
    const cmd = b.u32(at);
    const size = b.u32(at + 4);
    if (size < 8) throw new Error("Malformed Mach-O load command");
    if (cmd === 0xc || cmd === 0x80000018 || cmd === 0x8000001f || cmd === 0x80000023) {
      libraries.push(b.cstring(at + b.u32(at + 8), size));
    } else if (cmd === 0x8000001c) rpaths.push(b.cstring(at + b.u32(at + 8), size));
    else if (cmd === 0x1d) signed = true;
    else if (cmd === 0x21 || cmd === 0x2c) encrypted = b.u32(at + 16) !== 0;
    else if (cmd === 0x2) {
      hasSymtab = true;
      const symoff = start + b.u32(at + 8);
      const nsyms = b.u32(at + 12);
      const stroff = start + b.u32(at + 16);
      const entry = is64 ? 16 : 12;
      for (let s = 0; s < nsyms && s < MAX_SYMBOLS && symoff + (s + 1) * entry <= buffer.length; s += 1) {
        const name = b.cstring(stroff + b.u32(symoff + s * entry), 256);
        if (name) symbols.add(name);
      }
    }
    at += size;
  }
  const isExecutable = fileType === 2;
  return {
    format: "macho",
    type: isExecutable ? "executable" : fileType === 6 ? "shared-library" : fileType === 8 ? "bundle" : "object",
    arch: MACHO_CPUS[cpu] ?? `cpu-${cpu}`,
    bits: is64 ? 64 : 32,
    pie: isExecutable ? (flags & 0x200000) !== 0 : null,
    nx: (flags & 0x20000) === 0,
    canary: hasSymtab ? symbols.has("___stack_chk_fail") || symbols.has("___stack_chk_guard") : undefined,
    signed,
    encrypted,
    stripped: !hasSymtab,
    libraries,
    rpaths,
  };
}

function analyzeMacho(buffer: Buffer): NativeHardening {
  if (buffer.readUInt32BE(0) !== 0xcafebabe) return analyzeMachoSlice(buffer, 0);
  const count = buffer.readUInt32BE(4);
  const slices: Array<{ arch: string; offset: number }> = [];
  for (let i = 0; i < count; i += 1) {
    const at = 8 + i * 20;
    if (at + 20 > buffer.length) break;
    slices.push({ arch: MACHO_CPUS[buffer.readUInt32BE(at)] ?? "unknown", offset: buffer.readUInt32BE(at + 8) });
  }
  const preferred = slices.find((slice) => slice.arch === "arm64") ?? slices[0];
  if (!preferred) throw new Error("Fat Mach-O file has no slices");
  return { ...analyzeMachoSlice(buffer, preferred.offset), slices: slices.map((slice) => slice.arch) };
}

// ---------------------------------------------------------------- shared

export function analyzeNative(buffer: Buffer): NativeHardening {
  const format = detectNativeFormat(buffer);
  if (format === "elf") return analyzeElf(buffer);
  if (format === "pe") return analyzePe(buffer);
  if (format === "macho") return analyzeMacho(buffer);
  throw new Error("Not an ELF, PE or Mach-O binary");
}

/** Mitigation gaps worth fixing. Kept conservative: only flags what the binary actually lacks. */
export function nativeIssues(info: NativeHardening): NativeIssue[] {
  const issues: NativeIssue[] = [];
  const add = (ruleId: string, severity: NativeIssue["severity"], message: string, remediation: string) =>
    issues.push({ ruleId, severity, message, remediation });
  const executable = info.type === "executable";

  if (!info.nx) {
    add(
      "ANVIL-NATIVE-EXEC-STACK",
      "high",
      info.format === "pe" ? "DEP (NX) is off." : "The stack is executable.",
      info.format === "pe"
        ? "Link with /NXCOMPAT."
        : "Link with -z noexecstack and remove assembly that needs an executable stack."
    );
  }
  if (executable && info.pie === false) {
    add(
      "ANVIL-NATIVE-NO-ASLR",
      "medium",
      info.format === "pe"
        ? "ASLR is off (no DYNAMIC_BASE)."
        : "Not a position-independent executable, so ASLR can't move it.",
      info.format === "pe" ? "Link with /DYNAMICBASE." : "Build with -fPIE -pie."
    );
  }
  if (info.format === "elf" && info.relro === "none") {
    add("ANVIL-NATIVE-NO-RELRO", "low", "No RELRO: the GOT stays writable.", "Link with -Wl,-z,relro,-z,now.");
  }
  if (info.canary === false) {
    add("ANVIL-NATIVE-NO-CANARY", "low", "No stack canary symbols.", "Build with -fstack-protector-strong.");
  }
  if (info.format === "pe" && !info.dotnet && info.cfg === false) {
    add("ANVIL-NATIVE-NO-CFG", "low", "Control Flow Guard is off.", "Build with /guard:cf.");
  }
  if ((info.format === "pe" || (info.format === "macho" && executable)) && info.signed === false) {
    add(
      "ANVIL-NATIVE-UNSIGNED",
      "low",
      "Not code-signed.",
      "Sign release binaries so users and the OS can verify the publisher."
    );
  }
  const risky = info.rpaths.filter(
    (rpath) => !rpath.startsWith("/usr") && !rpath.startsWith("$ORIGIN") && !rpath.startsWith("@")
  );
  if (risky.length) {
    add(
      "ANVIL-NATIVE-RPATH",
      "medium",
      `Library search path points outside system folders: ${risky.slice(0, 3).join(", ")}`,
      "Use $ORIGIN-relative (or @loader_path) paths so libraries can't be planted in a writable folder."
    );
  }
  return issues;
}

export function formatHardening(info: NativeHardening): string {
  const yes = (value: boolean | null | undefined) =>
    value === null || value === undefined ? "n/a" : value ? "yes" : "no";
  const parts = [
    `${info.format.toUpperCase()} ${info.type} ${info.arch}/${info.bits}`,
    `${info.format === "pe" ? "aslr" : "pie"} ${yes(info.pie)}`,
    `nx ${yes(info.nx)}`,
  ];
  if (info.relro) parts.push(`relro ${info.relro}`);
  if (info.canary !== undefined) parts.push(`canary ${yes(info.canary)}`);
  if (info.fortify !== undefined) parts.push(`fortify ${yes(info.fortify)}`);
  if (info.cfg !== undefined) parts.push(`cfg ${yes(info.cfg)}`);
  if (info.signed !== undefined) parts.push(`signed ${yes(info.signed)}`);
  if (info.stripped !== undefined) parts.push(`stripped ${yes(info.stripped)}`);
  return parts.join(" · ");
}
