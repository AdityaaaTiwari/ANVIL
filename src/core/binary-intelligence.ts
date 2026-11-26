import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import path from "node:path";

export type BinaryAssetCategory =
  "native-binary" | "source-map" | "web-bundle" | "wasm" | "mobile-package" | "network-capture" | "database";

export interface BinaryMetadata {
  container: "PE/COFF" | "ELF" | "Mach-O" | "WASM" | "ZIP/Archive" | "SQLite" | "Unknown";
  bits?: 32 | 64 | undefined;
  endianness?: "little" | "big" | undefined;
  arch?: string | undefined;
  objectKind?:
    "executable" | "shared-library" | "relocatable" | "bundle" | "wasm-module" | "archive" | "database" | undefined;
  wasiImports?: string[] | undefined;
  entropy?: number | undefined;
}

export interface BinaryAsset {
  path: string;
  category: BinaryAssetCategory;
  extension: string;
  sizeBytes: number;
  detectedFormat?: string | undefined;
  sha256?: string | undefined;
  binaryMetadata?: BinaryMetadata | undefined;
}

export interface BinaryFinding {
  ruleId: string;
  severity: "critical" | "high" | "medium" | "low";
  file: string;
  message: string;
  remediation: string;
}

export interface BinaryIntelligenceReport {
  workspace: string;
  totalAssets: number;
  categories: Record<BinaryAssetCategory, number>;
  assets: BinaryAsset[];
  cleanRoomReport: {
    compliant: boolean;
    findings: BinaryFinding[];
    summary: string;
  };
}

const MAX_SCAN_DEPTH = 6;
const MAX_SCAN_ENTRIES = 5_000;
const MAX_MAP_READ_BYTES = 64 * 1024;
const HEADER_INSPECT_BYTES = 4 * 1024;
const MAX_HASH_BYTES = 8 * 1024 * 1024;
const HIGH_ENTROPY_THRESHOLD = 7.45;

const CATEGORY_MAP: Record<string, BinaryAssetCategory> = {
  ".exe": "native-binary",
  ".dll": "native-binary",
  ".so": "native-binary",
  ".dylib": "native-binary",
  ".node": "native-binary",
  ".bin": "native-binary",
  ".o": "native-binary",
  ".a": "native-binary",
  ".map": "source-map",
  ".wasm": "wasm",
  ".wat": "wasm",
  ".apk": "mobile-package",
  ".aab": "mobile-package",
  ".ipa": "mobile-package",
  ".pcap": "network-capture",
  ".pcapng": "network-capture",
  ".har": "network-capture",
  ".sqlite": "database",
  ".sqlite3": "database",
  ".db": "database",
};

// Text/media/code extensions that must never harbor raw PE, ELF, Mach-O, or WASM executables.
const SPOOF_CHECK_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".json",
  ".md",
  ".txt",
  ".yml",
  ".yaml",
  ".css",
  ".html",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
]);

const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".anvil", ".next", ".turbo"]);

export function isPathInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative));
}

export function computeShannonEntropy(buffer: Buffer): number {
  if (buffer.length === 0) return 0;
  const counts = new Uint32Array(256);
  for (let i = 0; i < buffer.length; i++) {
    counts[buffer[i]!]!++;
  }
  let entropy = 0;
  const len = buffer.length;
  for (let i = 0; i < 256; i++) {
    const count = counts[i]!;
    if (count === 0) continue;
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return Math.round(entropy * 100) / 100;
}

function mapPeMachine(machine: number): string {
  switch (machine) {
    case 0x8664:
      return "x86_64";
    case 0x014c:
      return "x86";
    case 0xaa64:
      return "arm64";
    case 0x01c0:
    case 0x01c4:
      return "arm";
    default:
      return `0x${machine.toString(16)}`;
  }
}

function mapElfMachine(machine: number): string {
  switch (machine) {
    case 3:
      return "x86";
    case 40:
      return "arm";
    case 62:
      return "x86_64";
    case 183:
      return "arm64";
    case 243:
      return "riscv";
    default:
      return `machine-${machine}`;
  }
}

function mapMachCpu(cpuType: number): string {
  switch (cpuType >>> 0) {
    case 0x01000007:
      return "x86_64";
    case 0x0100000c:
      return "arm64";
    case 7:
      return "x86";
    case 12:
      return "arm";
    default:
      return `cpu-0x${(cpuType >>> 0).toString(16)}`;
  }
}

function extractWasmHostHints(buffer: Buffer): string[] {
  const hints: string[] = [];
  const text = buffer.toString("latin1");
  for (const token of [
    "wasi_snapshot_preview1",
    "wasi_unstable",
    "fd_write",
    "proc_exit",
    "path_open",
    "environ_get",
  ]) {
    if (text.includes(token)) {
      hints.push(token);
    }
  }
  return hints;
}

export function classifyMagicHeader(header: Buffer): string | undefined {
  if (header.length >= 2 && header[0] === 0x4d && header[1] === 0x5a) return "PE/COFF";
  if (header.length >= 4) {
    if (header[0] === 0x7f && header[1] === 0x45 && header[2] === 0x4c && header[3] === 0x46) return "ELF";
    if (header[0] === 0x00 && header[1] === 0x61 && header[2] === 0x73 && header[3] === 0x6d) return "WASM";
    if (header[0] === 0x50 && header[1] === 0x4b && header[2] === 0x03 && header[3] === 0x04) return "ZIP/Archive";
    const magic = header.readUInt32BE(0);
    if (magic === 0xfeedface || magic === 0xcefaedfe) return "Mach-O (32-bit)";
    if (magic === 0xfeedfacf || magic === 0xcffaedfe) return "Mach-O (64-bit)";
    if (magic === 0xcafebabe || magic === 0xbebafeca) return "Mach-O Universal";
  }
  if (header.length >= 16 && header.subarray(0, 16).toString("latin1") === "SQLite format 3\0") {
    return "SQLite 3";
  }
  return undefined;
}

/**
 * Parses binary headers (PE/COFF, ELF, Mach-O, WASM, ZIP, SQLite) purely from raw bytes.
 * Returns strict validation flag (`verifiedExecutable`) so spoof checks avoid plain-text "MZ" false positives.
 */
export function parseBinaryMetadata(
  header: Buffer,
  includeEntropy = true
): {
  detectedFormat?: string | undefined;
  verifiedExecutable: boolean;
  metadata?: BinaryMetadata | undefined;
} {
  const detectedFormat = classifyMagicHeader(header);
  const entropy = includeEntropy && header.length > 0 ? computeShannonEntropy(header) : undefined;

  if (!detectedFormat) {
    return { verifiedExecutable: false };
  }

  // PE/COFF inspection
  if (detectedFormat === "PE/COFF") {
    let bits: 32 | 64 | undefined;
    let arch: string | undefined;
    let objectKind: BinaryMetadata["objectKind"];
    let validPeSignature = false;

    if (header.length >= 0x40) {
      const peOffset = header.readUInt32LE(0x3c);
      if (peOffset >= 0x40 && peOffset + 24 <= header.length) {
        if (header.toString("latin1", peOffset, peOffset + 4) === "PE\0\0") {
          validPeSignature = true;
          const machine = header.readUInt16LE(peOffset + 4);
          const characteristics = header.readUInt16LE(peOffset + 22);
          arch = mapPeMachine(machine);
          objectKind = (characteristics & 0x2000) !== 0 ? "shared-library" : "executable";
          if (peOffset + 26 <= header.length) {
            const optMagic = header.readUInt16LE(peOffset + 24);
            if (optMagic === 0x10b) bits = 32;
            else if (optMagic === 0x20b) bits = 64;
          }
        }
      }
    }

    return {
      detectedFormat,
      verifiedExecutable: validPeSignature,
      metadata: {
        container: "PE/COFF",
        endianness: "little",
        ...(bits ? { bits } : {}),
        ...(arch ? { arch } : {}),
        ...(objectKind ? { objectKind } : {}),
        ...(entropy !== undefined ? { entropy } : {}),
      },
    };
  }

  // ELF inspection
  if (detectedFormat === "ELF") {
    let bits: 32 | 64 | undefined;
    let endianness: "little" | "big" | undefined;
    let arch: string | undefined;
    let objectKind: BinaryMetadata["objectKind"];

    if (header.length >= 20) {
      if (header[4] === 1) bits = 32;
      else if (header[4] === 2) bits = 64;
      if (header[5] === 1) endianness = "little";
      else if (header[5] === 2) endianness = "big";

      if (endianness) {
        const eType = endianness === "little" ? header.readUInt16LE(16) : header.readUInt16BE(16);
        const eMachine = endianness === "little" ? header.readUInt16LE(18) : header.readUInt16BE(18);
        arch = mapElfMachine(eMachine);
        if (eType === 1) objectKind = "relocatable";
        else if (eType === 2) objectKind = "executable";
        else if (eType === 3) objectKind = "shared-library";
      }
    }

    return {
      detectedFormat,
      verifiedExecutable: true,
      metadata: {
        container: "ELF",
        ...(bits ? { bits } : {}),
        ...(endianness ? { endianness } : {}),
        ...(arch ? { arch } : {}),
        ...(objectKind ? { objectKind } : {}),
        ...(entropy !== undefined ? { entropy } : {}),
      },
    };
  }

  // Mach-O inspection
  if (detectedFormat.startsWith("Mach-O")) {
    const beMagic = header.readUInt32BE(0);
    if (detectedFormat === "Mach-O Universal") {
      // Disambiguate Mach-O Fat Binary (small nfat_arch count) from Java bytecode (minor=0, major>=45).
      const nfat = header.length >= 8 ? header.readUInt32BE(4) : 0;
      const isFatMachO = nfat >= 1 && nfat <= 16;
      return {
        detectedFormat,
        verifiedExecutable: isFatMachO,
        metadata: {
          container: "Mach-O",
          endianness: "big",
          objectKind: "bundle",
          ...(entropy !== undefined ? { entropy } : {}),
        },
      };
    }

    const isBigEndian = beMagic === 0xfeedface || beMagic === 0xfeedfacf;
    const endianness: "little" | "big" = isBigEndian ? "big" : "little";
    const bits: 32 | 64 = detectedFormat.includes("64-bit") ? 64 : 32;
    let arch: string | undefined;
    let objectKind: BinaryMetadata["objectKind"];

    if (header.length >= 16) {
      const cpuType = isBigEndian ? header.readUInt32BE(4) : header.readUInt32LE(4);
      const fileType = isBigEndian ? header.readUInt32BE(12) : header.readUInt32LE(12);
      arch = mapMachCpu(cpuType);
      if (fileType === 2) objectKind = "executable";
      else if (fileType === 6) objectKind = "shared-library";
      else if (fileType === 8) objectKind = "bundle";
    }

    return {
      detectedFormat,
      verifiedExecutable: true,
      metadata: {
        container: "Mach-O",
        bits,
        endianness,
        ...(arch ? { arch } : {}),
        ...(objectKind ? { objectKind } : {}),
        ...(entropy !== undefined ? { entropy } : {}),
      },
    };
  }

  if (detectedFormat === "WASM") {
    const wasiImports = extractWasmHostHints(header);
    return {
      detectedFormat,
      verifiedExecutable: true,
      metadata: {
        container: "WASM",
        objectKind: "wasm-module",
        ...(wasiImports.length > 0 ? { wasiImports } : {}),
        ...(entropy !== undefined ? { entropy } : {}),
      },
    };
  }

  if (detectedFormat === "ZIP/Archive") {
    return {
      detectedFormat,
      verifiedExecutable: false,
      metadata: {
        container: "ZIP/Archive",
        objectKind: "archive",
        ...(entropy !== undefined ? { entropy } : {}),
      },
    };
  }

  if (detectedFormat === "SQLite 3") {
    return {
      detectedFormat,
      verifiedExecutable: false,
      metadata: {
        container: "SQLite",
        objectKind: "database",
        ...(entropy !== undefined ? { entropy } : {}),
      },
    };
  }

  return { verifiedExecutable: false };
}

/**
 * Inspects up to `HEADER_INSPECT_BYTES` of a file to parse magic headers and metadata,
 * optionally computing a SHA-256 digest (for files <= MAX_HASH_BYTES).
 */
export async function inspectBinaryFile(
  filePath: string,
  options: { computeHash?: boolean; fileSize?: number } = {}
): Promise<{
  detectedFormat?: string | undefined;
  verifiedExecutable: boolean;
  metadata?: BinaryMetadata | undefined;
  sha256?: string | undefined;
}> {
  try {
    const handle = await open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const headerBuf = Buffer.alloc(HEADER_INSPECT_BYTES);
      const { bytesRead } = await handle.read(headerBuf, 0, headerBuf.length, 0);
      const sliced = headerBuf.subarray(0, bytesRead);
      const parsed = parseBinaryMetadata(sliced, true);

      let sha256: string | undefined;
      if (options.computeHash && (options.fileSize === undefined || options.fileSize <= MAX_HASH_BYTES)) {
        const hasher = createHash("sha256");
        hasher.update(sliced);
        if (bytesRead === headerBuf.length) {
          const chunk = Buffer.alloc(64 * 1024);
          let pos = bytesRead;
          while (pos < MAX_HASH_BYTES) {
            const nextRead = await handle.read(chunk, 0, Math.min(chunk.length, MAX_HASH_BYTES - pos), pos);
            if (nextRead.bytesRead <= 0) break;
            hasher.update(chunk.subarray(0, nextRead.bytesRead));
            pos += nextRead.bytesRead;
          }
        }
        sha256 = hasher.digest("hex");
      }

      return { ...parsed, ...(sha256 ? { sha256 } : {}) };
    } finally {
      await handle.close();
    }
  } catch {
    return { verifiedExecutable: false };
  }
}

async function inspectSourceMap(filePath: string): Promise<boolean> {
  try {
    const handle = await open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const buffer = Buffer.alloc(MAX_MAP_READ_BYTES);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      const text = buffer.subarray(0, bytesRead).toString("utf8");
      return (
        text.includes('"sourcesContent"') &&
        (text.includes("Bearer ") || text.includes("password") || /\bsk-[A-Za-z0-9_-]{20,}/.test(text))
      );
    } finally {
      await handle.close();
    }
  } catch {
    return false;
  }
}

async function inspectCaptureFile(filePath: string): Promise<boolean> {
  try {
    const handle = await open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const buffer = Buffer.alloc(MAX_MAP_READ_BYTES);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      const text = buffer.subarray(0, bytesRead).toString("utf8");
      return (
        (/authorization/i.test(text) && /bearer/i.test(text)) ||
        /authorization:\s*bearer/i.test(text) ||
        /cookie:\s*session/i.test(text) ||
        /"authorization"/i.test(text)
      );
    } finally {
      await handle.close();
    }
  } catch {
    return false;
  }
}

/**
 * Scans the workspace for compiled binaries, bundles, WASM, databases, capture files,
 * and disguised binaries (magic-byte extension mismatch). Inspects PE/ELF/Mach-O/WASM
 * headers locally with zero external dependencies and computes provenance digests.
 */
export async function analyzeBinaryIntelligence(
  projectPath: string,
  options: { maxDepth?: number } = {}
): Promise<BinaryIntelligenceReport> {
  const root = await realpath(path.resolve(projectPath));
  const maxDepth = options.maxDepth ?? MAX_SCAN_DEPTH;
  const assets: BinaryAsset[] = [];
  const findings: BinaryFinding[] = [];
  const visited = { count: 0 };

  const categories: Record<BinaryAssetCategory, number> = {
    "native-binary": 0,
    "source-map": 0,
    "web-bundle": 0,
    wasm: 0,
    "mobile-package": 0,
    "network-capture": 0,
    database: 0,
  };

  async function traverse(currentDir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      visited.count++;
      if (visited.count > MAX_SCAN_ENTRIES) return;

      if (entry.name.startsWith(".") && entry.name !== ".github") continue;
      if (IGNORED_DIRS.has(entry.name)) continue;

      const fullPath = path.join(currentDir, entry.name);
      let info;
      try {
        info = await lstat(fullPath);
      } catch {
        continue;
      }

      if (info.isSymbolicLink()) continue;

      if (info.isDirectory()) {
        await traverse(fullPath, depth + 1);
        continue;
      }

      if (!info.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      let category = CATEGORY_MAP[ext];

      if (!category && (entry.name.endsWith(".min.js") || entry.name.endsWith(".bundle.js"))) {
        category = "web-bundle";
      }

      if (category) {
        let actual = fullPath;
        try {
          actual = await realpath(fullPath);
        } catch {
          continue;
        }
        if (!isPathInsideRoot(root, actual)) continue;

        const relPath = path.relative(root, actual).split(path.sep).join("/");
        categories[category]++;

        const shouldInspectHeader =
          category === "native-binary" ||
          category === "wasm" ||
          category === "mobile-package" ||
          category === "database";

        const inspected = shouldInspectHeader
          ? await inspectBinaryFile(actual, {
              computeHash: category === "native-binary" || category === "wasm",
              fileSize: info.size,
            })
          : { verifiedExecutable: false };

        const asset: BinaryAsset = {
          path: relPath,
          category,
          extension: ext || path.extname(relPath),
          sizeBytes: info.size,
          ...(inspected.detectedFormat ? { detectedFormat: inspected.detectedFormat } : {}),
          ...(inspected.sha256 ? { sha256: inspected.sha256 } : {}),
          ...(inspected.metadata ? { binaryMetadata: inspected.metadata } : {}),
        };
        assets.push(asset);

        if (category === "native-binary" && (relPath.startsWith("src/") || relPath.startsWith("lib/"))) {
          const archLabel = inspected.metadata?.arch ? ` ${inspected.metadata.arch}` : "";
          findings.push({
            ruleId: "ANVIL-BIN-001",
            severity: "high",
            file: relPath,
            message: `Native binary tracked directly in source tree (${entry.name}${inspected.detectedFormat ? `, ${inspected.detectedFormat}${archLabel}` : ""}).`,
            remediation: "Move compiled binaries to release artifacts or git lfs; do not commit into source directory.",
          });
        }

        if (
          category === "native-binary" &&
          inspected.metadata?.entropy !== undefined &&
          inspected.metadata.entropy >= HIGH_ENTROPY_THRESHOLD &&
          (relPath.startsWith("src/") || relPath.startsWith("lib/") || ext === ".node")
        ) {
          findings.push({
            ruleId: "ANVIL-BIN-005",
            severity: "medium",
            file: relPath,
            message: `High-entropy native binary detected (${inspected.metadata.entropy} bits/byte), consistent with packed or encrypted payload.`,
            remediation: "Verify build provenance and inspect symbol table / UPX packing before trusting this binary.",
          });
        }

        if (category === "source-map") {
          const exposesSecret = await inspectSourceMap(actual);
          if (exposesSecret) {
            findings.push({
              ruleId: "ANVIL-BIN-002",
              severity: "medium",
              file: relPath,
              message: "Source map contains embedded secrets or sensitive credentials in sourcesContent.",
              remediation: "Strip credentials before generating production source maps or omit sourcesContent.",
            });
          }
        }

        if (category === "network-capture") {
          const exposesAuth = await inspectCaptureFile(actual);
          if (exposesAuth) {
            findings.push({
              ruleId: "ANVIL-BIN-003",
              severity: "high",
              file: relPath,
              message: "Network capture contains live authentication tokens or session cookies.",
              remediation: "Sanitize HAR/pcap captures with an automated redaction pass before committing.",
            });
          }
        }
      } else if (SPOOF_CHECK_EXTENSIONS.has(ext) && info.size >= 4) {
        let actual = fullPath;
        try {
          actual = await realpath(fullPath);
        } catch {
          continue;
        }
        if (!isPathInsideRoot(root, actual)) continue;

        const spoofCheck = await inspectBinaryFile(actual, { computeHash: true, fileSize: info.size });
        if (spoofCheck.verifiedExecutable && spoofCheck.detectedFormat) {
          const relPath = path.relative(root, actual).split(path.sep).join("/");
          const archLabel = spoofCheck.metadata?.arch ? ` (${spoofCheck.metadata.arch})` : "";
          findings.push({
            ruleId: "ANVIL-BIN-004",
            severity: "critical",
            file: relPath,
            message: `Extension spoofing detected: ${entry.name} claims '${ext}' but contains a real ${spoofCheck.detectedFormat}${archLabel} executable header.`,
            remediation: "Remove this disguised binary immediately and investigate how it entered the repository.",
          });
        }
      }
    }
  }

  await traverse(root, 0);

  const compliant = findings.filter((f) => f.severity === "critical" || f.severity === "high").length === 0;
  const summary = compliant
    ? `Workspace binary provenance checks passed across ${assets.length} binary/bundle asset(s).`
    : `Detected ${findings.length} binary provenance finding(s) across ${assets.length} binary/bundle asset(s).`;

  return {
    workspace: root,
    totalAssets: assets.length,
    categories,
    assets: assets.slice(0, 100),
    cleanRoomReport: {
      compliant,
      findings,
      summary,
    },
  };
}
