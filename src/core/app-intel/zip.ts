import { inflateRawSync } from "node:zlib";

/**
 * Minimal, read-only ZIP reader for app packages (APK, IPA, JAR, VSIX...).
 * Parses the central directory only; entries are inflated on demand with a
 * hard size cap, so a zip bomb cannot exhaust memory.
 */

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  encrypted: boolean;
  localHeaderOffset: number;
}

export interface ZipArchive {
  entries: ZipEntry[];
  /** Byte offset where the central directory starts (APK signing block sits right before it). */
  centralDirectoryOffset: number;
  read(entry: ZipEntry, maxBytes?: number): Buffer;
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
export const DEFAULT_ENTRY_LIMIT = 16 * 1024 * 1024;
const MAX_ENTRIES = 100_000;

function findEndOfCentralDirectory(buffer: Buffer): number {
  const min = Math.max(0, buffer.length - (0xffff + 22));
  for (let offset = buffer.length - 22; offset >= min; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD) return offset;
  }
  throw new Error("Not a ZIP archive (end of central directory not found)");
}

export function isZip(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.readUInt32LE(0) === LOCAL;
}

export function readZip(buffer: Buffer): ZipArchive {
  if (buffer.length < 22) throw new Error("File is too small to be a ZIP archive");
  const eocd = findEndOfCentralDirectory(buffer);
  const total = buffer.readUInt16LE(eocd + 10);
  const cdSize = buffer.readUInt32LE(eocd + 12);
  const cdOffset = buffer.readUInt32LE(eocd + 16);
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new Error("ZIP64 archives are not supported yet");
  }
  if (cdOffset + cdSize > buffer.length) throw new Error("Corrupt ZIP: central directory is out of bounds");

  const entries: ZipEntry[] = [];
  let offset = cdOffset;
  for (let index = 0; index < total && index < MAX_ENTRIES; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CENTRAL) {
      throw new Error("Corrupt ZIP: bad central directory entry");
    }
    const flags = buffer.readUInt16LE(offset + 8);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    entries.push({
      name: buffer.toString("utf8", offset + 46, offset + 46 + nameLength),
      method: buffer.readUInt16LE(offset + 10),
      compressedSize: buffer.readUInt32LE(offset + 20),
      size: buffer.readUInt32LE(offset + 24),
      encrypted: (flags & 1) === 1,
      localHeaderOffset: buffer.readUInt32LE(offset + 42),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return {
    entries,
    centralDirectoryOffset: cdOffset,
    read(entry: ZipEntry, maxBytes = DEFAULT_ENTRY_LIMIT): Buffer {
      if (entry.encrypted) throw new Error(`${entry.name} is encrypted`);
      if (entry.size > maxBytes) throw new Error(`${entry.name} is larger than ${maxBytes} bytes`);
      const local = entry.localHeaderOffset;
      if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== LOCAL) {
        throw new Error(`Corrupt ZIP: bad local header for ${entry.name}`);
      }
      const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
      const end = start + entry.compressedSize;
      if (end > buffer.length) throw new Error(`Corrupt ZIP: ${entry.name} is out of bounds`);
      const data = buffer.subarray(start, end);
      if (entry.method === 0) return Buffer.from(data);
      if (entry.method === 8) return inflateRawSync(data, { maxOutputLength: maxBytes });
      throw new Error(`${entry.name} uses unsupported compression method ${entry.method}`);
    },
  };
}
