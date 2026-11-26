import { constants } from "node:fs";
import { lstat, open, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { inspectBinaryFile, isPathInsideRoot, type BinaryMetadata } from "./binary-intelligence.js";

export type SupplyChainSeverity = "critical" | "high" | "medium" | "low" | "info";
export type SupplyChainCategory =
  | "lifecycle-hook"
  | "native-addon"
  | "spoofed-binary"
  | "obfuscated-payload"
  | "exfiltration"
  | "lockfile-integrity"
  | "unpinned-source"
  | "typosquatting"
  | "symlink-escape";

export interface SupplyChainFinding {
  ruleId: string;
  severity: SupplyChainSeverity;
  category: SupplyChainCategory;
  packageName: string;
  version?: string | undefined;
  file: string;
  title: string;
  detail: string;
  remediation: string;
}

export interface LifecycleHookEntry {
  packageName: string;
  version: string;
  hook: string;
  command: string;
  risk: "high" | "medium" | "low";
  file: string;
}

export interface SupplyChainNativeBinary {
  packageName: string;
  version: string;
  file: string;
  sizeBytes: number;
  detectedFormat: string;
  sha256?: string | undefined;
  metadata?: BinaryMetadata | undefined;
  spoofedExtension: boolean;
}

export interface SupplyChainReport {
  schemaVersion: 1;
  workspace: string;
  generatedAt: string;
  durationMs: number;
  passed: boolean;
  riskScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
  summary: {
    packagesScanned: number;
    lifecycleHooksCount: number;
    nativeBinariesCount: number;
    spoofedBinariesCount: number;
    lockfilePackagesChecked: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  lifecycleHooks: LifecycleHookEntry[];
  nativeBinaries: SupplyChainNativeBinary[];
  findings: SupplyChainFinding[];
  limitations: string[];
}

export interface SupplyChainScanOptions {
  maxPackages?: number | undefined;
  maxPackageDepth?: number | undefined;
  scanEntrypoints?: boolean | undefined;
}

const DEFAULT_MAX_PACKAGES = 1_500;
const DEFAULT_MAX_PACKAGE_DEPTH = 4;
const MAX_SCRIPT_BYTES = 128 * 1024;
const MAX_LOCKFILE_BYTES = 12 * 1024 * 1024;
const HIGH_ENTROPY_THRESHOLD = 7.6;

const INSTALL_HOOK_KEYS = ["preinstall", "install", "postinstall", "preuninstall", "postuninstall", "prepare"] as const;

const BINARY_EXTENSIONS = new Set([".node", ".exe", ".dll", ".so", ".dylib", ".bin", ".wasm"]);
const SPOOF_CANDIDATE_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".txt",
  ".md",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
]);

const TRUSTED_REGISTRY_HOSTS = new Set([
  "registry.npmjs.org",
  "registry.yarnpkg.com",
  "npm.pkg.github.com",
  "registry.npmmirror.com",
]);

// High-value npm package names frequently targeted by typosquatting and hyphen-omission attacks.
const POPULAR_NPM_PACKAGES = [
  "axios",
  "chalk",
  "commander",
  "cross-env",
  "debug",
  "dotenv",
  "esbuild",
  "eslint",
  "express",
  "fast-glob",
  "fs-extra",
  "glob",
  "immer",
  "inquirer",
  "is-odd",
  "jest",
  "jsonwebtoken",
  "lodash",
  "lru-cache",
  "minimatch",
  "minimist",
  "mkdirp",
  "moment",
  "mongoose",
  "ms",
  "nanoid",
  "next",
  "node-fetch",
  "nodemon",
  "ora",
  "picomatch",
  "prettier",
  "react",
  "react-dom",
  "request",
  "rimraf",
  "semver",
  "shelljs",
  "socket.io",
  "ts-node",
  "tsx",
  "typescript",
  "undici",
  "uuid",
  "vite",
  "vitest",
  "webpack",
  "winston",
  "ws",
  "yargs",
  "zod",
];

const POPULAR_SET = new Set(POPULAR_NPM_PACKAGES);

function normalizeRel(root: string, absPath: string): string {
  return path.relative(root, absPath).split(path.sep).join("/");
}

async function readBoundedText(filePath: string, maxBytes = MAX_SCRIPT_BYTES): Promise<string | null> {
  try {
    const handle = await open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const buf = Buffer.alloc(maxBytes);
      const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
      return buf.subarray(0, bytesRead).toString("utf8");
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

async function safeReadJson(filePath: string, maxBytes = MAX_LOCKFILE_BYTES): Promise<Record<string, unknown> | null> {
  try {
    const info = await lstat(filePath);
    if (info.isSymbolicLink() || !info.isFile() || info.size > maxBytes) return null;
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Pure Damerau-Levenshtein edit distance for offline typosquatting detection.
 */
export function damerauLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return Math.abs(m - n);
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        val = Math.min(val, dp[i - 2]![j - 2]! + cost);
      }
      dp[i]![j] = val;
    }
  }
  return dp[m]![n]!;
}

function findTyposquatMatch(pkgName: string): string | null {
  if (!pkgName || pkgName.startsWith("@") || pkgName.length < 4 || POPULAR_SET.has(pkgName)) {
    return null;
  }
  const stripped = pkgName.replace(/[-_.]/g, "");
  for (const popular of POPULAR_NPM_PACKAGES) {
    if (popular === pkgName) continue;
    const popularStripped = popular.replace(/[-_.]/g, "");
    if (stripped === popularStripped && pkgName !== popular) {
      return popular;
    }
    if (damerauLevenshtein(pkgName, popular) === 1) {
      return popular;
    }
  }
  return null;
}

const SUSPICIOUS_HOOK_PIPE =
  /\b(?:curl|wget|fetch|iwr|Invoke-WebRequest)\b[^\n|]*\|[^\n]*(?:\bsh\b|\bbash\b|\bzsh\b|\bpwsh\b|\bpowershell\b|\bnode\b|\bpython\d*\b)/i;
const SUSPICIOUS_INLINE_EXEC =
  /\b(?:node|python\d*|ruby|perl|pwsh|powershell)\b[^\n]*(?:\s-[ec]\s|--eval\s|\s-enc(?:odedcommand)?\s)/i;
const SENSITIVE_PATH_PATTERN =
  /(?:~\/\.ssh\/|~\/\.aws\/|~\/\.npmrc|~\/\.kube\/config|\/etc\/shadow|id_rsa|id_ed25519)/i;
const DESTRUCTIVE_SHELL_PATTERN = /\brm\s+-rf\s+(?:\/|~|\$HOME|\*)|:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/i;

const EXFIL_SENSITIVE_SOURCE =
  /(?:JSON\.stringify\s*\(\s*process\.env\s*\)|Object\.(?:entries|keys|values)\s*\(\s*process\.env\s*\)|process\.env\.(?:NPM_TOKEN|GITHUB_TOKEN|AWS_SECRET_ACCESS_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY)\b|\.ssh[/\\]id_rsa|\.ssh[/\\]id_ed25519|\.aws[/\\]credentials|\.npmrc|\.kube[/\\]config)/;
const EXFIL_OUTBOUND_SINK =
  /(?:\bfetch\s*\(|https?\s*\.\s*(?:request|get|post)\s*\(|net\s*\.\s*(?:connect|createConnection)|dgram\s*\.\s*createSocket|new\s+WebSocket\s*\(|dns\s*\.\s*(?:lookup|resolve)\s*\(|[e]xec(?:Sync)?\s*\([^)]*\b(?:curl|wget)\b)/;
const OBFUSCATED_EVAL =
  /(?:\beval\s*\(|new\s+Function\s*\(|vm\s*\.\s*runIn(?:This|New)Context\s*\()[\s\S]{0,160}(?:Buffer\s*\.\s*from\s*\([^)]*['"]base64['"]|\batob\s*\(|String\s*\.\s*fromCharCode|\\x[0-9a-fA-F]{2})/;
const LARGE_BASE64_OR_HEX_EXEC =
  /(?:Buffer\s*\.\s*from\s*\(\s*['"][A-Za-z0-9+/=]{120,}['"]\s*,\s*['"]base64['"]|(?:\\x[0-9a-fA-F]{2}){20,})/;

function evaluateHookCommandRisk(command: string): {
  risk: "high" | "medium" | "low";
  reason?: string;
} {
  if (SUSPICIOUS_HOOK_PIPE.test(command) || DESTRUCTIVE_SHELL_PATTERN.test(command)) {
    return {
      risk: "high",
      reason: "Lifecycle hook pipes remote payload to a shell interpreter or runs destructive commands.",
    };
  }
  if (SENSITIVE_PATH_PATTERN.test(command)) {
    return { risk: "high", reason: "Lifecycle hook accesses SSH/cloud/npm credential paths." };
  }
  if (
    SUSPICIOUS_INLINE_EXEC.test(command) &&
    /(?:http:\/\/|https:\/\/|base64|atob|Buffer\.from|eval|child_process)/i.test(command)
  ) {
    return { risk: "high", reason: "Lifecycle hook executes inline network or encoded script evaluation." };
  }
  if (/https?:\/\//i.test(command)) {
    return { risk: "medium", reason: "Lifecycle hook references an explicit remote URL." };
  }
  return { risk: "low" };
}

function extractReferencedLocalScripts(command: string): string[] {
  const results: string[] = [];
  const matches = command.matchAll(/(?:^|\s|["'])(\.?\.?\/?[A-Za-z0-9_./-]+\.(?:js|mjs|cjs|sh|ps1|py))\b/gi);
  for (const m of matches) {
    if (m[1]) results.push(m[1]);
  }
  return [...new Set(results)].slice(0, 4);
}

function inspectScriptContent(
  content: string,
  pkgName: string,
  version: string,
  relFile: string,
  findings: SupplyChainFinding[]
): void {
  if (EXFIL_SENSITIVE_SOURCE.test(content) && EXFIL_OUTBOUND_SINK.test(content)) {
    findings.push({
      ruleId: "ANVIL-SUP-004",
      severity: "critical",
      category: "exfiltration",
      packageName: pkgName,
      version,
      file: relFile,
      title: "Potential credential/environment exfiltration inside package script",
      detail: `Script reads bulk process.env or sensitive credential files alongside an outbound network sink.`,
      remediation:
        "Remove or quarantine this package immediately and rotate any secrets that were present in the shell.",
    });
  } else if (SENSITIVE_PATH_PATTERN.test(content) && EXFIL_OUTBOUND_SINK.test(content)) {
    findings.push({
      ruleId: "ANVIL-SUP-004",
      severity: "critical",
      category: "exfiltration",
      packageName: pkgName,
      version,
      file: relFile,
      title: "Credential file access combined with network transmission",
      detail: `Script references host credential paths together with network/socket routines.`,
      remediation: "Inspect the package diff from npm tarball provenance and audit local keys.",
    });
  }

  if (OBFUSCATED_EVAL.test(content) || LARGE_BASE64_OR_HEX_EXEC.test(content) || SUSPICIOUS_HOOK_PIPE.test(content)) {
    findings.push({
      ruleId: "ANVIL-SUP-005",
      severity: "high",
      category: "obfuscated-payload",
      packageName: pkgName,
      version,
      file: relFile,
      title: "Obfuscated dynamic code execution or shell dropper in package script",
      detail: `Detected encoded payload execution (eval/Function + base64/hex) or remote shell pipe in ${relFile}.`,
      remediation:
        "Reject packages using encoded dynamic evaluation inside lifecycle hooks; replace with audited dependencies.",
    });
  }
}

function inspectPackageLockEntries(
  root: string,
  lockFileName: string,
  lockJson: Record<string, unknown>,
  findings: SupplyChainFinding[]
): number {
  let checked = 0;
  const packagesObj = lockJson.packages;

  if (packagesObj && typeof packagesObj === "object" && !Array.isArray(packagesObj)) {
    for (const [lockKey, rawMeta] of Object.entries(packagesObj)) {
      if (!lockKey || !rawMeta || typeof rawMeta !== "object") continue;
      checked++;
      const meta = rawMeta as Record<string, unknown>;
      const resolved = typeof meta.resolved === "string" ? meta.resolved : "";
      const integrity = typeof meta.integrity === "string" ? meta.integrity : "";
      const nameMatch = lockKey.match(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)$/);
      const pkgName = nameMatch?.[1] ?? lockKey;
      const version = typeof meta.version === "string" ? meta.version : undefined;

      if (resolved) {
        if (resolved.startsWith("http://") && !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\//i.test(resolved)) {
          findings.push({
            ruleId: "ANVIL-SUP-006",
            severity: "critical",
            category: "lockfile-integrity",
            packageName: pkgName,
            version,
            file: lockFileName,
            title: "Plaintext HTTP tarball URL in lockfile",
            detail: `${pkgName} resolves over insecure HTTP (${resolved}), enabling MitM tampering.`,
            remediation: "Re-generate the lockfile from an HTTPS registry and verify integrity digests.",
          });
        } else if (/^(?:git\+https?:|git:\/\/|github:)/i.test(resolved) && !/#[0-9a-f]{40}\b/i.test(resolved)) {
          findings.push({
            ruleId: "ANVIL-SUP-006",
            severity: "high",
            category: "unpinned-source",
            packageName: pkgName,
            version,
            file: lockFileName,
            title: "Unpinned git dependency in lockfile",
            detail: `${pkgName} resolves from unpinned git source (${resolved}) without a full 40-char commit SHA.`,
            remediation: "Pin git dependencies to an immutable full commit SHA or publish a versioned tarball.",
          });
        } else if (resolved.startsWith("https://")) {
          try {
            const host = new URL(resolved).hostname.toLowerCase();
            if (!TRUSTED_REGISTRY_HOSTS.has(host) && host !== "github.com" && host !== "codeload.github.com") {
              findings.push({
                ruleId: "ANVIL-SUP-006",
                severity: "medium",
                category: "lockfile-integrity",
                packageName: pkgName,
                version,
                file: lockFileName,
                title: "Non-standard registry host in lockfile",
                detail: `${pkgName} resolves from custom registry host '${host}'.`,
                remediation: "Confirm this custom registry host is authorized by your organization's .npmrc policy.",
              });
            }
          } catch {}
        }

        if (!integrity && !resolved.startsWith("file:")) {
          findings.push({
            ruleId: "ANVIL-SUP-006",
            severity: "medium",
            category: "lockfile-integrity",
            packageName: pkgName,
            version,
            file: lockFileName,
            title: "Lockfile entry missing cryptographic integrity hash",
            detail: `${pkgName} (${resolved}) has no SHA-512/SHA-1 integrity digest.`,
            remediation: "Regenerate lockfile with npm/pnpm/yarn so tarball integrity hashes are enforced.",
          });
        }
      }
    }
  }

  // Also check lockfile v1 dependencies map if v2/v3 packages was absent.
  if (checked === 0 && lockJson.dependencies && typeof lockJson.dependencies === "object") {
    const walkV1 = (deps: Record<string, unknown>) => {
      for (const [pkgName, rawMeta] of Object.entries(deps)) {
        if (!rawMeta || typeof rawMeta !== "object") continue;
        checked++;
        const meta = rawMeta as Record<string, unknown>;
        const resolved = typeof meta.resolved === "string" ? meta.resolved : "";
        const integrity = typeof meta.integrity === "string" ? meta.integrity : "";
        const version = typeof meta.version === "string" ? meta.version : undefined;
        if (resolved.startsWith("http://") && !/^http:\/\/(?:localhost|127\.0\.0\.1)/i.test(resolved)) {
          findings.push({
            ruleId: "ANVIL-SUP-006",
            severity: "critical",
            category: "lockfile-integrity",
            packageName: pkgName,
            version,
            file: lockFileName,
            title: "Plaintext HTTP tarball URL in lockfile",
            detail: `${pkgName} resolves over insecure HTTP (${resolved}).`,
            remediation: "Switch registry to HTTPS and regenerate lockfile.",
          });
        } else if (resolved && !integrity && !resolved.startsWith("file:")) {
          findings.push({
            ruleId: "ANVIL-SUP-006",
            severity: "medium",
            category: "lockfile-integrity",
            packageName: pkgName,
            version,
            file: lockFileName,
            title: "Lockfile entry missing integrity digest",
            detail: `${pkgName} resolves to ${resolved} without an integrity checksum.`,
            remediation: "Regenerate lockfile with cryptographic integrity enabled.",
          });
        }
        if (meta.dependencies && typeof meta.dependencies === "object" && !Array.isArray(meta.dependencies)) {
          walkV1(meta.dependencies as Record<string, unknown>);
        }
      }
    };
    walkV1(lockJson.dependencies as Record<string, unknown>);
  }

  // Flag unpinned remote specs inside root package.json checked separately in main runner.
  void root;
  return checked;
}

async function scanTextLockfileLines(
  filePath: string,
  lockFileName: string,
  findings: SupplyChainFinding[]
): Promise<number> {
  const text = await readBoundedText(filePath, MAX_LOCKFILE_BYTES);
  if (!text) return 0;
  let resolvedCount = 0;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    const urlMatch = trimmed.match(/["']?(https?:\/\/[^\s"']+)["']?/);
    if (!urlMatch) continue;
    const url = urlMatch[1]!;
    if (trimmed.includes("tarball:") || trimmed.includes("resolved")) {
      resolvedCount++;
      if (url.startsWith("http://") && !/^http:\/\/(?:localhost|127\.0\.0\.1)/i.test(url)) {
        findings.push({
          ruleId: "ANVIL-SUP-006",
          severity: "critical",
          category: "lockfile-integrity",
          packageName: lockFileName,
          file: lockFileName,
          title: "Plaintext HTTP tarball URL in lockfile",
          detail: `Lockfile contains insecure HTTP resolution: ${url}`,
          remediation: "Switch lockfile tarballs to HTTPS and regenerate lockfile.",
        });
      }
    }
  }
  return resolvedCount;
}

/**
 * Zero-dependency scanner for `node_modules/` packages, lifecycle install hooks,
 * native binary addons (`.node`/PE/ELF/Mach-O/WASM), spoofed binary extensions,
 * lockfile integrity/provenance, and offline typosquatting detection.
 */
export async function scanSupplyChain(
  projectPath: string,
  options: SupplyChainScanOptions = {}
): Promise<SupplyChainReport> {
  const startedAt = Date.now();
  const root = await realpath(path.resolve(projectPath));
  const maxPackages = options.maxPackages ?? DEFAULT_MAX_PACKAGES;
  const maxPackageDepth = options.maxPackageDepth ?? DEFAULT_MAX_PACKAGE_DEPTH;

  const findings: SupplyChainFinding[] = [];
  const lifecycleHooks: LifecycleHookEntry[] = [];
  const nativeBinaries: SupplyChainNativeBinary[] = [];
  const visitedPackageRealDirs = new Set<string>();
  const visitedNodeModulesRealDirs = new Set<string>();

  let packagesScanned = 0;
  let lockfilePackagesChecked = 0;

  // 1. Inspect root package.json for typosquatting & unpinned git/http dependency specifiers
  const rootPkg = await safeReadJson(path.join(root, "package.json"));
  if (rootPkg) {
    for (const section of ["dependencies", "devDependencies", "optionalDependencies"] as const) {
      const depsObj = rootPkg[section];
      if (!depsObj || typeof depsObj !== "object" || Array.isArray(depsObj)) continue;
      for (const [depName, rawSpec] of Object.entries(depsObj)) {
        const spec = typeof rawSpec === "string" ? rawSpec : "";
        const typo = findTyposquatMatch(depName);
        if (typo) {
          findings.push({
            ruleId: "ANVIL-SUP-007",
            severity: "high",
            category: "typosquatting",
            packageName: depName,
            version: spec,
            file: "package.json",
            title: "Potential typosquatting dependency detected",
            detail: `Dependency '${depName}' (${section}) is 1 edit away from popular package '${typo}'.`,
            remediation: `Verify spelling in package.json; replace '${depName}' with '${typo}' if unintended.`,
          });
        }
        if (/^http:\/\//i.test(spec) || /^git\+http:\/\//i.test(spec)) {
          findings.push({
            ruleId: "ANVIL-SUP-006",
            severity: "critical",
            category: "unpinned-source",
            packageName: depName,
            version: spec,
            file: "package.json",
            title: "Plaintext HTTP dependency specifier in package.json",
            detail: `Dependency '${depName}' uses insecure HTTP URL '${spec}'.`,
            remediation: "Use a versioned npm range or HTTPS URL with lockfile integrity.",
          });
        } else if (
          /^(?:git\+https:|git:\/\/|github:|gitlab:|bitbucket:)/i.test(spec) &&
          !/#[0-9a-f]{40}\b/i.test(spec)
        ) {
          findings.push({
            ruleId: "ANVIL-SUP-006",
            severity: "medium",
            category: "unpinned-source",
            packageName: depName,
            version: spec,
            file: "package.json",
            title: "Unpinned git dependency specifier",
            detail: `Dependency '${depName}' (${spec}) is not pinned to a 40-char commit SHA.`,
            remediation: "Pin git dependencies to an immutable commit hash or versioned package.",
          });
        }
      }
    }
  }

  // 2. Inspect lockfiles (package-lock.json, npm-shrinkwrap.json, pnpm-lock.yaml, yarn.lock)
  for (const jsonLock of ["package-lock.json", "npm-shrinkwrap.json"]) {
    const lockJson = await safeReadJson(path.join(root, jsonLock));
    if (lockJson) {
      lockfilePackagesChecked += inspectPackageLockEntries(root, jsonLock, lockJson, findings);
    }
  }
  for (const textLock of ["pnpm-lock.yaml", "yarn.lock"]) {
    const full = path.join(root, textLock);
    const info = await lstat(full).catch(() => null);
    if (info && !info.isSymbolicLink() && info.isFile()) {
      lockfilePackagesChecked += await scanTextLockfileLines(full, textLock, findings);
    }
  }

  // 3. Recursively scan installed packages inside node_modules/
  async function scanPackageFiles(
    pkgDir: string,
    pkgName: string,
    version: string,
    depth: number,
    entryCounter: { count: number }
  ): Promise<void> {
    if (depth > maxPackageDepth || entryCounter.count > 400) return;
    let entries;
    try {
      entries = await readdir(pkgDir, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      entryCounter.count++;
      if (entryCounter.count > 400) return;
      if (entry.name === "node_modules") continue; // Handled by package traversal.

      const full = path.join(pkgDir, entry.name);
      const info = await lstat(full).catch(() => null);
      if (!info) continue;

      if (info.isSymbolicLink()) {
        const target = await realpath(full).catch(() => null);
        if (!target || !isPathInsideRoot(root, target)) {
          findings.push({
            ruleId: "ANVIL-SUP-009",
            severity: "critical",
            category: "symlink-escape",
            packageName: pkgName,
            version,
            file: normalizeRel(root, full),
            title: "Symlink inside node_modules escapes repository root",
            detail: `Symbolic link '${normalizeRel(root, full)}' points outside workspace root.`,
            remediation: "Remove the offending package and reinstall cleanly with --ignore-scripts.",
          });
        }
        continue;
      }

      if (info.isDirectory()) {
        await scanPackageFiles(full, pkgName, version, depth + 1, entryCounter);
        continue;
      }
      if (!info.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      const rel = normalizeRel(root, full);

      if (BINARY_EXTENSIONS.has(ext)) {
        const inspected = await inspectBinaryFile(full, { computeHash: true, fileSize: info.size });
        const fmt = inspected.detectedFormat ?? (ext === ".node" ? "Native Addon" : "Binary");
        nativeBinaries.push({
          packageName: pkgName,
          version,
          file: rel,
          sizeBytes: info.size,
          detectedFormat: fmt,
          ...(inspected.sha256 ? { sha256: inspected.sha256 } : {}),
          ...(inspected.metadata ? { metadata: inspected.metadata } : {}),
          spoofedExtension: false,
        });

        const entropy = inspected.metadata?.entropy;
        if (entropy !== undefined && entropy >= HIGH_ENTROPY_THRESHOLD) {
          findings.push({
            ruleId: "ANVIL-SUP-003",
            severity: "medium",
            category: "native-addon",
            packageName: pkgName,
            version,
            file: rel,
            title: "High-entropy native binary in installed package",
            detail: `${rel} (${fmt}, ${entropy} bits/byte) exhibits high entropy characteristic of packed/obfuscated binaries.`,
            remediation: "Verify this native artifact matches upstream build provenance and SHA-256 checksums.",
          });
        } else {
          findings.push({
            ruleId: "ANVIL-SUP-003",
            severity: "info",
            category: "native-addon",
            packageName: pkgName,
            version,
            file: rel,
            title: "Native binary artifact in installed dependency",
            detail: `Detected ${fmt}${inspected.metadata?.arch ? ` (${inspected.metadata.arch})` : ""} (${(info.size / 1024).toFixed(1)} KB).`,
            remediation: "Confirm prebuilt native binary aligns with expected platform dependencies.",
          });
        }
      } else if (SPOOF_CANDIDATE_EXTENSIONS.has(ext) && info.size >= 4) {
        const inspected = await inspectBinaryFile(full, { computeHash: true, fileSize: info.size });
        if (inspected.verifiedExecutable && inspected.detectedFormat) {
          nativeBinaries.push({
            packageName: pkgName,
            version,
            file: rel,
            sizeBytes: info.size,
            detectedFormat: inspected.detectedFormat,
            ...(inspected.sha256 ? { sha256: inspected.sha256 } : {}),
            ...(inspected.metadata ? { metadata: inspected.metadata } : {}),
            spoofedExtension: true,
          });
          findings.push({
            ruleId: "ANVIL-SUP-008",
            severity: "critical",
            category: "spoofed-binary",
            packageName: pkgName,
            version,
            file: rel,
            title: "Hidden native executable disguised inside non-binary dependency file",
            detail: `${rel} uses '${ext}' extension but begins with a verified ${inspected.detectedFormat}${inspected.metadata?.arch ? ` (${inspected.metadata.arch})` : ""} executable header.`,
            remediation:
              "Quarantine and remove this package immediately; extension spoofing indicates trojanized supply-chain code.",
          });
        }
      }
    }
  }

  async function inspectInstalledPackage(pkgDir: string, fallbackName: string): Promise<void> {
    if (packagesScanned >= maxPackages) return;

    const realPkgDir = await realpath(pkgDir).catch(() => null);
    if (!realPkgDir || !isPathInsideRoot(root, realPkgDir)) {
      findings.push({
        ruleId: "ANVIL-SUP-009",
        severity: "critical",
        category: "symlink-escape",
        packageName: fallbackName,
        file: normalizeRel(root, pkgDir),
        title: "Dependency directory resolves outside repository root",
        detail: `Installed package '${fallbackName}' resolves to '${realPkgDir ?? "unresolvable"}' outside workspace.`,
        remediation: "Remove external symlink dependencies inside node_modules.",
      });
      return;
    }

    if (visitedPackageRealDirs.has(realPkgDir)) return;
    visitedPackageRealDirs.add(realPkgDir);
    packagesScanned++;

    const pkgJsonPath = path.join(realPkgDir, "package.json");
    const pkgJson = await safeReadJson(pkgJsonPath, MAX_SCRIPT_BYTES);
    const pkgName = typeof pkgJson?.name === "string" && pkgJson.name ? pkgJson.name : fallbackName;
    const version = typeof pkgJson?.version === "string" && pkgJson.version ? pkgJson.version : "0.0.0";
    const relPkgJson = normalizeRel(root, pkgJsonPath);

    // Check install lifecycle hooks
    const scripts =
      pkgJson?.scripts && typeof pkgJson.scripts === "object" && !Array.isArray(pkgJson.scripts)
        ? (pkgJson.scripts as Record<string, unknown>)
        : {};

    const inspectedScripts = new Set<string>();
    for (const hook of INSTALL_HOOK_KEYS) {
      const cmd = scripts[hook];
      if (typeof cmd !== "string" || !cmd.trim()) continue;
      const evaluation = evaluateHookCommandRisk(cmd);
      lifecycleHooks.push({
        packageName: pkgName,
        version,
        hook,
        command: cmd,
        risk: evaluation.risk,
        file: relPkgJson,
      });

      if (evaluation.risk === "high") {
        findings.push({
          ruleId: "ANVIL-SUP-002",
          severity: "critical",
          category: "lifecycle-hook",
          packageName: pkgName,
          version,
          file: relPkgJson,
          title: `Malicious or remote-exec '${hook}' lifecycle hook`,
          detail: `${pkgName}@${version} runs '${hook}: ${cmd}'. ${evaluation.reason ?? ""}`.trim(),
          remediation: "Uninstall this package or audit install scripts with `npm ci --ignore-scripts`.",
        });
      } else {
        findings.push({
          ruleId: "ANVIL-SUP-001",
          severity: evaluation.risk === "medium" ? "medium" : "info",
          category: "lifecycle-hook",
          packageName: pkgName,
          version,
          file: relPkgJson,
          title: `Package declares '${hook}' lifecycle script`,
          detail: `${pkgName}@${version} invokes '${cmd}' during package installation.`,
          remediation:
            "Review install-time hooks periodically and consider npm '--ignore-scripts' where native builds are not needed.",
        });
      }

      // Inspect referenced local scripts invoked by the lifecycle hook.
      for (const localRel of extractReferencedLocalScripts(cmd)) {
        const scriptAbs = path.resolve(realPkgDir, localRel);
        if (!isPathInsideRoot(realPkgDir, scriptAbs) || inspectedScripts.has(scriptAbs)) continue;
        inspectedScripts.add(scriptAbs);
        const content = await readBoundedText(scriptAbs, MAX_SCRIPT_BYTES);
        if (content) {
          inspectScriptContent(content, pkgName, version, normalizeRel(root, scriptAbs), findings);
        }
      }
    }

    // Optional light scan of main/bin entrypoints when requested.
    if (options.scanEntrypoints !== false) {
      const entryCandidates: string[] = [];
      if (typeof pkgJson?.main === "string") entryCandidates.push(pkgJson.main);
      if (typeof pkgJson?.bin === "string") entryCandidates.push(pkgJson.bin);
      else if (pkgJson?.bin && typeof pkgJson.bin === "object" && !Array.isArray(pkgJson.bin)) {
        for (const v of Object.values(pkgJson.bin)) {
          if (typeof v === "string") entryCandidates.push(v);
        }
      }
      for (const relTarget of entryCandidates.slice(0, 4)) {
        const candidateAbs = path.resolve(realPkgDir, relTarget);
        if (!isPathInsideRoot(realPkgDir, candidateAbs) || inspectedScripts.has(candidateAbs)) continue;
        inspectedScripts.add(candidateAbs);
        const content = await readBoundedText(candidateAbs, 64 * 1024);
        if (content) {
          inspectScriptContent(content, pkgName, version, normalizeRel(root, candidateAbs), findings);
        }
      }
    }

    // Scan package contents for .node/native binaries & spoofed binary extensions
    await scanPackageFiles(realPkgDir, pkgName, version, 0, { count: 0 });

    // Recurse into nested node_modules if present
    const nestedModules = path.join(realPkgDir, "node_modules");
    await walkNodeModulesDir(nestedModules);
  }

  async function walkNodeModulesDir(nodeModulesPath: string): Promise<void> {
    if (packagesScanned >= maxPackages) return;
    const realNm = await realpath(nodeModulesPath).catch(() => null);
    if (!realNm || !isPathInsideRoot(root, realNm) || visitedNodeModulesRealDirs.has(realNm)) {
      return;
    }
    visitedNodeModulesRealDirs.add(realNm);

    let entries;
    try {
      entries = await readdir(realNm, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (packagesScanned >= maxPackages) break;
      if (entry.name.startsWith(".")) {
        // Support pnpm virtual store (`node_modules/.pnpm/<pkg>/node_modules/<name>`) transparently.
        if (entry.name === ".pnpm") {
          const pnpmRoot = path.join(realNm, ".pnpm");
          const storeEntries = await readdir(pnpmRoot, { withFileTypes: true }).catch(() => []);
          for (const storeEntry of storeEntries.sort((a, b) => a.name.localeCompare(b.name))) {
            if (packagesScanned >= maxPackages) break;
            if (storeEntry.isDirectory() && storeEntry.name !== "node_modules") {
              await walkNodeModulesDir(path.join(pnpmRoot, storeEntry.name, "node_modules"));
            }
          }
        }
        continue;
      }

      const full = path.join(realNm, entry.name);
      const info = await lstat(full).catch(() => null);
      if (!info || (!info.isDirectory() && !info.isSymbolicLink())) continue;

      if (entry.name.startsWith("@")) {
        const scopedDir = await realpath(full).catch(() => null);
        if (!scopedDir || !isPathInsideRoot(root, scopedDir)) continue;
        const subEntries = await readdir(scopedDir, { withFileTypes: true }).catch(() => []);
        for (const sub of subEntries.sort((a, b) => a.name.localeCompare(b.name))) {
          if (packagesScanned >= maxPackages) break;
          await inspectInstalledPackage(path.join(scopedDir, sub.name), `${entry.name}/${sub.name}`);
        }
      } else {
        await inspectInstalledPackage(full, entry.name);
      }
    }
  }

  await walkNodeModulesDir(path.join(root, "node_modules"));

  const severityCounts = {
    critical: findings.filter((f) => f.severity === "critical").length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
    info: findings.filter((f) => f.severity === "info").length,
  };

  const severityRank: Record<SupplyChainSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  };
  findings.sort(
    (a, b) =>
      severityRank[a.severity] - severityRank[b.severity] ||
      a.ruleId.localeCompare(b.ruleId) ||
      a.file.localeCompare(b.file)
  );

  const rawRisk =
    severityCounts.critical * 30 + severityCounts.high * 15 + severityCounts.medium * 5 + severityCounts.low * 1;
  const riskScore = Math.min(100, rawRisk);
  const grade: SupplyChainReport["grade"] =
    severityCounts.critical === 0 && severityCounts.high === 0 && severityCounts.medium === 0
      ? "A"
      : riskScore <= 10
        ? "B"
        : riskScore <= 30
          ? "C"
          : riskScore <= 60
            ? "D"
            : "F";

  const spoofedBinariesCount = nativeBinaries.filter((b) => b.spoofedExtension).length;

  return {
    schemaVersion: 1,
    workspace: root,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    passed: severityCounts.critical === 0 && severityCounts.high === 0,
    riskScore,
    grade,
    summary: {
      packagesScanned,
      lifecycleHooksCount: lifecycleHooks.length,
      nativeBinariesCount: nativeBinaries.length,
      spoofedBinariesCount,
      lockfilePackagesChecked,
      ...severityCounts,
    },
    lifecycleHooks,
    nativeBinaries: nativeBinaries.slice(0, 150),
    findings,
    limitations: [
      "Static zero-dependency inspection only; installed scripts and binaries are never executed.",
      `Traversal bounded to ${maxPackages} installed packages and depth ${maxPackageDepth} per package directory.`,
      "Typosquatting checks match direct npm dependencies against a bundled offline set of high-target packages.",
      "No network calls are performed; CVE vulnerability matching requires offline npm-audit.json via `anvil deps`.",
    ],
  };
}

export function formatSupplyChainReport(report: SupplyChainReport, options: { findingsOnly?: boolean } = {}): string {
  const lines = [
    ``,
    `# ANVIL Supply-Chain & Binary Dependency Scanner`,
    `Target: ${report.workspace}`,
    `Grade: ${report.grade} | Risk Score: ${report.riskScore}/100 | Status: ${report.passed ? "PASSED" : "RISKS DETECTED"}`,
    ``,
    `Summary:`,
    `  Packages Scanned      : ${report.summary.packagesScanned}`,
    `  Lockfile Entries      : ${report.summary.lockfilePackagesChecked}`,
    `  Lifecycle Hooks       : ${report.summary.lifecycleHooksCount}`,
    `  Native Binaries (.node/PE/ELF/Mach-O/WASM): ${report.summary.nativeBinariesCount}`,
    `  Spoofed Extensions    : ${report.summary.spoofedBinariesCount}`,
    `  Findings              : Critical=${report.summary.critical}, High=${report.summary.high}, Medium=${report.summary.medium}, Info=${report.summary.info}`,
  ];

  const actionable = report.findings.filter((f) => (options.findingsOnly ? f.severity !== "info" : true));
  if (actionable.length > 0) {
    lines.push(``, `Findings (${actionable.length}):`);
    for (const f of actionable.slice(0, 40)) {
      lines.push(`  [${f.severity.toUpperCase()}] ${f.ruleId} (${f.packageName}) - ${f.title}`);
      lines.push(`    File: ${f.file}`);
      lines.push(`    ${f.detail}`);
      lines.push(`    Remediation: ${f.remediation}`);
    }
  } else {
    lines.push(``, `No actionable supply-chain security findings detected.`);
  }

  if (!options.findingsOnly && report.nativeBinaries.length > 0) {
    lines.push(``, `Native Dependency Binaries (${report.nativeBinaries.length}):`);
    for (const bin of report.nativeBinaries.slice(0, 20)) {
      const kb = (bin.sizeBytes / 1024).toFixed(1);
      const arch = bin.metadata?.arch ? ` ${bin.metadata.arch}` : "";
      const hashShort = bin.sha256 ? ` sha256:${bin.sha256.slice(0, 12)}` : "";
      lines.push(`  ${bin.file} (${bin.detectedFormat}${arch}, ${kb} KB${hashShort})`);
    }
  }

  return lines.join("\n");
}
