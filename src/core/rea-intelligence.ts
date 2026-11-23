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
}

export interface CleanRoomFinding {
  ruleId: string;
  severity: "high" | "medium" | "low";
  file: string;
  message: string;
  remediation: string;
}

export interface ReaIntelligenceReport {
  workspace: string;
  totalAssets: number;
  categories: Record<BinaryAssetCategory, number>;
  assets: BinaryAsset[];
  cleanRoomReport: {
    compliant: boolean;
    findings: CleanRoomFinding[];
    summary: string;
  };
}

const MAX_SCAN_DEPTH = 6;
const MAX_SCAN_ENTRIES = 5_000;
const MAX_MAP_READ_BYTES = 64 * 1024;

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

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".anvil",
  ".forge",
  ".next",
  ".turbo",
]);

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative));
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
 * Scans the workspace for compiled binaries, bundles, WASM, and capture files.
 * Performs a deterministic clean-room verification to prevent proprietary binary leakage.
 */
export async function analyzeReaIntelligence(
  projectPath: string,
  options: { maxDepth?: number } = {}
): Promise<ReaIntelligenceReport> {
  const root = await realpath(path.resolve(projectPath));
  const maxDepth = options.maxDepth ?? MAX_SCAN_DEPTH;
  const assets: BinaryAsset[] = [];
  const findings: CleanRoomFinding[] = [];
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

        const asset: BinaryAsset = {
          path: relPath,
          category,
          extension: ext || path.extname(relPath),
          sizeBytes: info.size,
        };
        assets.push(asset);

        // Check clean-room rules
        if (category === "native-binary" && (relPath.startsWith("src/") || relPath.startsWith("lib/"))) {
          findings.push({
            ruleId: "REA-CR-001",
            severity: "high",
            file: relPath,
            message: `Native binary tracked directly in source tree (${entry.name}).`,
            remediation: "Move compiled binaries to release artifacts or git lfs; do not commit into source directory.",
          });
        }

        if (category === "source-map") {
          const exposesSecret = await inspectSourceMap(actual);
          if (exposesSecret) {
            findings.push({
              ruleId: "REA-CR-002",
              severity: "medium",
              file: relPath,
              message: `Source map contains embedded secrets or sensitive credentials in sourcesContent.`,
              remediation: "Strip credentials before generating production source maps or omit sourcesContent.",
            });
          }
        }

        if (category === "network-capture") {
          const exposesAuth = await inspectCaptureFile(actual);
          if (exposesAuth) {
            findings.push({
              ruleId: "REA-CR-003",
              severity: "high",
              file: relPath,
              message: `Network capture contains live authentication tokens or session cookies.`,
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
    ? `Workspace is clean-room compliant across ${assets.length} binary/bundle asset(s).`
    : `Detected ${findings.length} clean-room compliance finding(s) across ${assets.length} binary asset(s).`;

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

/** Returns the complementary MCP configuration for morluto/rea */
export function getReaMcpServerConfig(): { command: string; args: string[] } {
  return {
    command: "npx",
    args: ["-y", "rea-agents", "serve"],
  };
}
