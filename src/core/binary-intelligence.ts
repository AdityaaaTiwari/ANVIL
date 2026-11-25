import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import path from "node:path";

export type BinaryAssetCategory =
  "native-binary" | "source-map" | "web-bundle" | "wasm" | "mobile-package" | "network-capture" | "database";

export interface BinaryAsset {
  path: string;
  category: BinaryAssetCategory;
  extension: string;
  sizeBytes: number;
  detectedFormat?: string;
}

export interface BinaryFinding {
  ruleId: string;
  severity: "high" | "medium" | "low";
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
const MAGIC_HEADER_BYTES = 16;

const CATEGORY_MAP: Record<string, BinaryAssetCategory> = {
  ".exe": "native-binary",
  ".dll": "native-binary",
  ".so": "native-binary",
  ".dylib": "native-binary",
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

const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".anvil", ".next", ".turbo"]);

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative));
}

function classifyMagicHeader(header: Buffer): string | undefined {
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

async function detectBinaryFormat(filePath: string): Promise<string | undefined> {
  try {
    const handle = await open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const buffer = Buffer.alloc(MAGIC_HEADER_BYTES);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      return classifyMagicHeader(buffer.subarray(0, bytesRead));
    } finally {
      await handle.close();
    }
  } catch {
    return undefined;
  }
}

async function inspectSourceMap(filePath: string): Promise<boolean> {
  try {
    const handle = await open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const buffer = Buffer.alloc(MAX_MAP_READ_BYTES);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      const text = buffer.subarray(0, bytesRead).toString("utf8");
      return text.includes('"sourcesContent"') && (text.includes("Bearer ") || text.includes("password"));
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
 * Scans the workspace for compiled binaries, bundles, WASM, databases, and capture files.
 * Inspects file magic headers locally and verifies provenance/secret boundaries.
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
        if (!isInside(root, actual)) continue;

        const relPath = path.relative(root, actual).split(path.sep).join("/");
        categories[category]++;

        const detectedFormat =
          category === "native-binary" ||
          category === "wasm" ||
          category === "mobile-package" ||
          category === "database"
            ? await detectBinaryFormat(actual)
            : undefined;

        const asset: BinaryAsset = {
          path: relPath,
          category,
          extension: ext || path.extname(relPath),
          sizeBytes: info.size,
          ...(detectedFormat ? { detectedFormat } : {}),
        };
        assets.push(asset);

        if (category === "native-binary" && (relPath.startsWith("src/") || relPath.startsWith("lib/"))) {
          findings.push({
            ruleId: "ANVIL-BIN-001",
            severity: "high",
            file: relPath,
            message: `Native binary tracked directly in source tree (${entry.name}${detectedFormat ? `, ${detectedFormat}` : ""}).`,
            remediation: "Move compiled binaries to release artifacts or git lfs; do not commit into source directory.",
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
      }
    }
  }

  await traverse(root, 0);

  const compliant = findings.filter((f) => f.severity === "high").length === 0;
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
