/** WebAssembly module reader: imports, exports, memories and custom sections. */

export interface WasmImport {
  module: string;
  name: string;
  kind: "function" | "table" | "memory" | "global" | "tag";
}

export interface WasmExport {
  name: string;
  kind: WasmImport["kind"];
}

export interface WasmModuleInfo {
  version: number;
  imports: WasmImport[];
  exports: WasmExport[];
  customSections: string[];
  functionCount: number;
  /** WASI when it imports wasi_snapshot_* or wasi_unstable; JS host otherwise. */
  host: "wasi" | "js" | "none";
}

const KINDS: WasmImport["kind"][] = ["function", "table", "memory", "global", "tag"];

class Reader {
  constructor(
    private readonly buffer: Buffer,
    public offset: number
  ) {}

  byte(): number {
    if (this.offset >= this.buffer.length) throw new Error("Unexpected end of WebAssembly module");
    return this.buffer[this.offset++] ?? 0;
  }

  leb(): number {
    let result = 0;
    let shift = 0;
    for (let i = 0; i < 10; i += 1) {
      const byte = this.byte();
      if (shift < 49) result += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) return result;
      shift += 7;
    }
    throw new Error("Malformed LEB128 value");
  }

  name(): string {
    const length = this.leb();
    if (this.offset + length > this.buffer.length) throw new Error("WebAssembly name is out of bounds");
    const value = this.buffer.toString("utf8", this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  limits(): void {
    const flags = this.byte();
    this.leb();
    if (flags & 1) this.leb();
  }
}

export function isWasm(buffer: Buffer): boolean {
  return buffer.length >= 8 && buffer.readUInt32BE(0) === 0x0061736d;
}

export function readWasm(buffer: Buffer): WasmModuleInfo {
  if (!isWasm(buffer)) throw new Error("Not a WebAssembly module");
  const info: WasmModuleInfo = {
    version: buffer.readUInt32LE(4),
    imports: [],
    exports: [],
    customSections: [],
    functionCount: 0,
    host: "none",
  };
  const reader = new Reader(buffer, 8);
  while (reader.offset < buffer.length) {
    const id = reader.byte();
    const size = reader.leb();
    const end = reader.offset + size;
    if (end > buffer.length) throw new Error("WebAssembly section is out of bounds");
    if (id === 0) info.customSections.push(reader.name());
    else if (id === 2) {
      const count = reader.leb();
      for (let i = 0; i < count && i < 100_000; i += 1) {
        const module = reader.name();
        const name = reader.name();
        const kindCode = reader.byte();
        if (kindCode === 0) reader.leb();
        else if (kindCode === 1) {
          reader.byte();
          reader.limits();
        } else if (kindCode === 2) reader.limits();
        else if (kindCode === 3) {
          reader.byte();
          reader.byte();
        } else if (kindCode === 4) {
          reader.byte();
          reader.leb();
        } else throw new Error(`Unknown import kind ${kindCode}`);
        info.imports.push({ module, name, kind: KINDS[kindCode] ?? "function" });
      }
    } else if (id === 3) info.functionCount = reader.leb();
    else if (id === 7) {
      const count = reader.leb();
      for (let i = 0; i < count && i < 100_000; i += 1) {
        const name = reader.name();
        const kindCode = reader.byte();
        reader.leb();
        info.exports.push({ name, kind: KINDS[kindCode] ?? "function" });
      }
    }
    reader.offset = end;
  }
  const modules = new Set(info.imports.map((item) => item.module));
  info.host = [...modules].some((module) => /^wasi(_snapshot|_unstable|:)/.test(module))
    ? "wasi"
    : modules.size
      ? "js"
      : "none";
  return info;
}
