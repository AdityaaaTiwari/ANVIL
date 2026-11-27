/**
 * Reader for Electron `app.asar` archives: a small JSON header (wrapped in
 * Chromium pickles) followed by concatenated file contents.
 */

export interface AsarFile {
  path: string;
  size: number;
  offset: number;
  unpacked: boolean;
}

export interface AsarArchive {
  files: AsarFile[];
  read(file: AsarFile, maxBytes?: number): Buffer;
}

interface AsarNode {
  files?: Record<string, AsarNode>;
  offset?: string;
  size?: number;
  unpacked?: boolean;
  link?: string;
}

const MAX_HEADER_BYTES = 64 * 1024 * 1024;
const MAX_FILES = 200_000;

export function isAsar(buffer: Buffer): boolean {
  if (buffer.length < 16 || buffer.readUInt32LE(0) !== 4) return false;
  const headerSize = buffer.readUInt32LE(4);
  return headerSize > 8 && headerSize <= buffer.length && buffer.toString("latin1", 16, 17) === "{";
}

export function readAsar(buffer: Buffer): AsarArchive {
  if (!isAsar(buffer)) throw new Error("Not an Electron asar archive");
  const headerPickleSize = buffer.readUInt32LE(4);
  const jsonLength = buffer.readUInt32LE(12);
  if (jsonLength > MAX_HEADER_BYTES || 16 + jsonLength > buffer.length) throw new Error("Corrupt asar header");
  const header = JSON.parse(buffer.toString("utf8", 16, 16 + jsonLength)) as AsarNode;
  const dataStart = 8 + headerPickleSize;

  const files: AsarFile[] = [];
  const walk = (node: AsarNode, prefix: string, depth: number) => {
    if (depth > 64 || files.length >= MAX_FILES) return;
    for (const [name, child] of Object.entries(node.files ?? {})) {
      if (name.includes("/") || name === ".." || name === ".") continue;
      const childPath = prefix ? `${prefix}/${name}` : name;
      if (child.files) walk(child, childPath, depth + 1);
      else if (!child.link) {
        files.push({
          path: childPath,
          size: Number(child.size ?? 0),
          offset: Number(child.offset ?? 0),
          unpacked: child.unpacked === true,
        });
      }
    }
  };
  walk(header, "", 0);

  return {
    files,
    read(file: AsarFile, maxBytes = 16 * 1024 * 1024): Buffer {
      if (file.unpacked) throw new Error(`${file.path} is stored outside the archive (app.asar.unpacked)`);
      if (file.size > maxBytes) throw new Error(`${file.path} is larger than ${maxBytes} bytes`);
      const start = dataStart + file.offset;
      if (!Number.isSafeInteger(start) || start + file.size > buffer.length) {
        throw new Error(`Corrupt asar: ${file.path} is out of bounds`);
      }
      return Buffer.from(buffer.subarray(start, start + file.size));
    },
  };
}
