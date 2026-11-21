import { readdir, readFile, stat, unlink, rm, writeFile, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isExcludedScanDirectory } from "./workspace-scan-policy.js";
import { mapArchitecture } from "./architecture-map.js";

const execFileAsync = promisify(execFile);

export type JunkCategory = "os" | "editor" | "temporary" | "download" | "log" | "cache" | "empty-dir";

export interface JunkItem {
  path: string;
  absolutePath: string;
  category: JunkCategory;
  reason: string;
  sizeBytes: number;
  isDirectory?: boolean;
}

export interface CodeFixItem {
  file: string;
  type: "unused-import" | "whitespace" | "blank-lines";
  detail: string;
  applied: boolean;
}

export interface OrphanFileItem {
  file: string;
  lines: number;
  reason: string;
}

export interface UndoResult {
  root: string;
  backupId: string;
  restoredAt: string;
  restoredFiles: string[];
  restoredDirs: string[];
  revertedCodeFixes: string[];
  errors: string[];
}

export interface CleanVerificationResult {
  enabled: boolean;
  passed: boolean;
  rolledBack: boolean;
  command: string;
  output?: string;
  error?: string;
}

export interface CleanOptions {
  apply?: boolean;
  fix?: boolean;
  checkOrphans?: boolean;
  verify?: boolean;
  testCommand?: string;
  useToolchains?: boolean;
}

export interface CleanResult {
  root: string;
  generatedAt: string;
  applied: boolean;
  dryRun: boolean;
  backupId?: string | undefined;
  verification?: CleanVerificationResult | undefined;
  junkItems: JunkItem[];
  orphanFiles: OrphanFileItem[];
  codeFixes: CodeFixItem[];
  stats: {
    junkFound: number;
    junkDeleted: number;
    bytesReclaimed: number;
    codeFixesFound: number;
    codeFixesApplied: number;
    orphanFilesFound: number;
  };
  warnings: string[];
}

const OS_JUNK = new Set([
  ".ds_store",
  "thumbs.db",
  "desktop.ini",
  "ehthumbs.db",
  "ehthumbs_vista.db"
]);

function classifyJunkFile(basename: string, relPath: string): { category: JunkCategory; reason: string } | null {
  const lower = basename.toLowerCase();

  // OS Clutter
  if (OS_JUNK.has(lower) || lower.startsWith("._")) {
    return { category: "os", reason: "Operating system metadata clutter" };
  }

  // Logs
  if (
    /^(npm-debug|yarn-debug|yarn-error|pnpm-debug|lerna-debug)\.log/i.test(basename) ||
    (lower.endsWith(".log") && !relPath.startsWith(".anvil/") && !relPath.startsWith(".forge/"))
  ) {
    return { category: "log", reason: "Debug or error log leftover" };
  }

  // Temporary & incomplete downloads
  if (
    lower.endsWith(".tmp") ||
    lower.endsWith(".temp") ||
    lower.endsWith(".crdownload") ||
    lower.endsWith(".part") ||
    lower.endsWith(".aria2") ||
    lower.endsWith(".download")
  ) {
    return { category: lower.endsWith(".crdownload") || lower.endsWith(".part") || lower.endsWith(".aria2") || lower.endsWith(".download") ? "download" : "temporary", reason: "Incomplete download or temporary artifact" };
  }

  // Editor clutter
  if (lower.endsWith("~") || lower.endsWith(".swp") || lower.endsWith(".swo") || lower.endsWith(".bak") || lower.endsWith(".orig") || lower.endsWith(".rej")) {
    return { category: "editor", reason: "Editor backup, swap, or merge residue" };
  }

  // Python bytecode & caches
  if (lower.endsWith(".pyc") || lower.endsWith(".pyo") || lower.endsWith(".pyd")) {
    return { category: "cache", reason: "Compiled Python bytecode artifact" };
  }

  // Java / JVM compiled class files
  if (lower.endsWith(".class")) {
    return { category: "cache", reason: "Compiled Java bytecode class file" };
  }

  // C / C++ / Rust / Windows object and debug files
  if (lower.endsWith(".o") || lower.endsWith(".obj") || lower.endsWith(".pdb") || lower.endsWith(".ilk") || lower.endsWith(".idb")) {
    return { category: "cache", reason: "Native object or debug symbol artifact" };
  }

  // Go test runner binaries
  if (lower.endsWith(".test") && !relPath.includes("/")) {
    return { category: "cache", reason: "Compiled Go test runner binary" };
  }

  // Transient build caches
  if (basename === ".eslintcache" || basename === ".stylelintcache" || basename === ".tsbuildinfo.cache") {
    return { category: "cache", reason: "Regenerable linter/compiler cache file" };
  }

  return null;
}

async function scanJunk(
  root: string,
  rel = "",
  items: JunkItem[] = [],
  emptyDirs: string[] = []
): Promise<{ items: JunkItem[]; emptyDirs: string[] }> {
  const fullDir = path.join(root, rel);
  let entries;
  try {
    entries = await readdir(fullDir, { withFileTypes: true });
  } catch {
    return { items, emptyDirs };
  }

  // If directory is completely empty and not root
  if (entries.length === 0 && rel && !isExcludedScanDirectory(path.basename(rel))) {
    emptyDirs.push(rel.split(path.sep).join("/"));
    return { items, emptyDirs };
  }

  for (const entry of entries) {
    const relChild = rel ? path.join(rel, entry.name) : entry.name;
    const normalizedRel = relChild.split(path.sep).join("/");
    const fullPath = path.join(root, relChild);

    if (entry.isDirectory()) {
      const dirLower = entry.name.toLowerCase();
      if (
        dirLower === "__pycache__" ||
        dirLower === ".pytest_cache" ||
        dirLower === ".mypy_cache" ||
        dirLower === ".ruff_cache" ||
        dirLower === ".ipynb_checkpoints"
      ) {
        try {
          const dirStat = await stat(fullPath);
          items.push({
            path: normalizedRel,
            absolutePath: fullPath,
            category: "cache",
            reason: "Python runtime or test cache directory (regenerable)",
            sizeBytes: dirStat.size || 4096,
            isDirectory: true
          });
        } catch {
          // Ignore stat error
        }
        continue;
      }
      if (isExcludedScanDirectory(entry.name)) {
        // Special case: coverage directories can be considered cache junk if present at root
        if (entry.name === "coverage" || entry.name === ".nyc_output") {
          try {
            const dirStat = await stat(fullPath);
            items.push({
              path: normalizedRel,
              absolutePath: fullPath,
              category: "cache",
              reason: "Test coverage report output (regenerable)",
              sizeBytes: dirStat.size || 4096,
              isDirectory: true
            });
          } catch {
            // Ignore stat error
          }
        }
        continue;
      }
      await scanJunk(root, relChild, items, emptyDirs);
    } else if (entry.isFile()) {
      const classification = classifyJunkFile(entry.name, normalizedRel);
      if (classification) {
        try {
          const fileStat = await stat(fullPath);
          items.push({
            path: normalizedRel,
            absolutePath: fullPath,
            category: classification.category,
            reason: classification.reason,
            sizeBytes: fileStat.size,
            isDirectory: false
          });
        } catch {
          // Ignore stat failure
        }
      }
    }
  }

  return { items, emptyDirs };
}

interface ImportSpecifierInfo {
  importedName: string;
  localName: string;
  isType: boolean;
}

function parseNamedImports(namedBlock: string): ImportSpecifierInfo[] {
  return namedBlock
    .split(",")
    .map(spec => spec.trim())
    .filter(Boolean)
    .map(spec => {
      const isType = /^type\s+/.test(spec);
      const cleanSpec = spec.replace(/^type\s+/, "").trim();
      const parts = cleanSpec.split(/\s+as\s+/).map(p => p.trim());
      if (parts.length === 2 && parts[0] && parts[1]) {
        return { importedName: parts[0], localName: parts[1], isType };
      }
      const single = parts[0] ?? cleanSpec;
      return { importedName: single, localName: single, isType };
    });
}

export function autoFixCodeContent(content: string, filePath: string): { newContent: string; fixes: CodeFixItem[] } {
  const fixes: CodeFixItem[] = [];
  const ext = path.extname(filePath).toLowerCase();
  const baseName = path.basename(filePath).toLowerCase();

  // Safety: never touch Markdown or JSON files (Markdown trailing whitespace is semantic hard break; JSON strings can contain whitespace)
  if ([".md", ".markdown", ".json", ".jsonc"].includes(ext)) {
    return { newContent: content, fixes: [] };
  }

  let updated = content;

  // 1. Whitespace normalization: remove trailing spaces
  const lines = updated.split("\n");
  let trailingWhitespaceRemoved = false;
  const cleanedLines = lines.map(line => {
    const stripped = line.replace(/[ \t\r]+$/, "");
    if (stripped !== line.replace(/\r$/, "")) {
      trailingWhitespaceRemoved = true;
    }
    return stripped;
  });

  if (trailingWhitespaceRemoved) {
    updated = cleanedLines.join("\n");
    fixes.push({
      file: filePath,
      type: "whitespace",
      detail: "Trimmed trailing whitespace from lines",
      applied: true
    });
  }

  // 2. Blank line normalization (collapse 3+ consecutive newlines to 2)
  if (/\n{3,}/.test(updated)) {
    updated = updated.replace(/\n{3,}/g, "\n\n");
    fixes.push({
      file: filePath,
      type: "blank-lines",
      detail: "Collapsed excessive consecutive blank lines",
      applied: true
    });
  }

  // 3. Ensure single trailing newline
  if (updated.length > 0 && !updated.endsWith("\n")) {
    updated += "\n";
  }

  // 4. Safe unused named imports removal for JS/TS source files
  if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
    const importRegex = /^import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["']([^"']+)["'];?\r?$/gm;
    let match: RegExpExecArray | null;

    // Detect JSX syntax or pragma in file
    const hasJsxPragma = /@jsx\b|@jsxFrag\b|@jsxImportSource\b/.test(updated);
    const hasJsxSyntax = /<[A-Za-z0-9_$.]+(\s|>|\/>)/.test(updated) || /<\s*>/.test(updated);

    // We do replacement passes
    let codePass = updated;
    let importFixCount = 0;

    while ((match = importRegex.exec(updated)) !== null) {
      const fullStatement = match[0];
      const rawSpecifiers = match[1];
      const fromPath = match[2];
      if (!rawSpecifiers || !fromPath) continue;

      const specifiers = parseNamedImports(rawSpecifiers);
      if (specifiers.length === 0) continue;

      // Check occurrences of each localName in the rest of the file (excluding this import statement)
      const contentWithoutImport = updated.slice(0, match.index) + updated.slice(match.index + fullStatement.length);

      const survivingSpecifiers: string[] = [];
      const removedSpecifiers: string[] = [];

      for (const spec of specifiers) {
        // Protect JSX runtime identifiers (h from preact, React from react, Fragment) when JSX is used
        const isJsxProtected = (hasJsxPragma || hasJsxSyntax) && ["h", "React", "Fragment"].includes(spec.localName);

        // Whole identifier boundary check for localName
        const escaped = spec.localName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const wordRegex = new RegExp(`\\b${escaped}\\b`);
        if (isJsxProtected || wordRegex.test(contentWithoutImport)) {
          const formatted = spec.importedName === spec.localName
            ? (spec.isType ? `type ${spec.localName}` : spec.localName)
            : (spec.isType ? `type ${spec.importedName} as ${spec.localName}` : `${spec.importedName} as ${spec.localName}`);
          survivingSpecifiers.push(formatted);
        } else {
          removedSpecifiers.push(spec.localName);
        }
      }

      if (removedSpecifiers.length > 0) {
        importFixCount += removedSpecifiers.length;
        if (survivingSpecifiers.length === 0) {
          // Entire import is unused -> remove the line
          codePass = codePass.replace(fullStatement + "\n", "").replace(fullStatement, "");
        } else {
          // Partially unused -> retain surviving
          const isType = fullStatement.startsWith("import type");
          const newStatement = `import ${isType ? "type " : ""}{ ${survivingSpecifiers.join(", ")} } from "${fromPath}";`;
          codePass = codePass.replace(fullStatement, newStatement);
        }
        fixes.push({
          file: filePath,
          type: "unused-import",
          detail: `Removed unused named import(s): ${removedSpecifiers.join(", ")} from "${fromPath}"`,
          applied: true
        });
      }
    }

    if (importFixCount > 0) {
      updated = codePass;
    }
  }

  // 5. Safe unused import removal for Python source files
  if ([".py", ".pyw"].includes(ext)) {
    // Skip __init__.py entirely: re-exports are intentionally not referenced in the file itself
    if (baseName === "__init__.py") {
      return { newContent: updated, fixes };
    }

    // Parse __all__ list if defined in the file
    const allMatch = updated.match(/__all__\s*=\s*(\[[^\]]*\]|\([^)]*\))/s);
    const allExports = new Set<string>();
    if (allMatch && allMatch[1]) {
      const exportTokens = allMatch[1].match(/["']([^"']+)["']/g);
      if (exportTokens) {
        for (const token of exportTokens) {
          allExports.add(token.replace(/["']/g, ""));
        }
      }
    }

    const pyImportRegex = /^from\s+([.\w]+)\s+import\s+([^#\r\n]+)/gm;
    let match: RegExpExecArray | null;
    let codePass = updated;
    let importFixCount = 0;

    while ((match = pyImportRegex.exec(updated)) !== null) {
      const fullStatement = match[0];
      const fromModule = match[1];
      const rawSpecifiers = match[2];
      if (!fromModule || !rawSpecifiers) continue;
      if (rawSpecifiers.trim() === "*") continue;

      const specs = rawSpecifiers.split(",").map(s => s.trim()).filter(Boolean);
      const parsed = specs.map(s => {
        const parts = s.split(/\s+as\s+/).map(p => p.trim());
        return {
          importedName: parts[0] || s,
          localName: parts[1] || parts[0] || s,
          raw: s
        };
      });

      const contentWithoutImport = updated.slice(0, match.index) + updated.slice(match.index + fullStatement.length);
      const surviving: string[] = [];
      const removed: string[] = [];

      for (const spec of parsed) {
        const inAll = allExports.has(spec.localName) || allExports.has(spec.importedName);
        const escaped = spec.localName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const wordRegex = new RegExp(`\\b${escaped}\\b`);
        if (inAll || wordRegex.test(contentWithoutImport)) {
          surviving.push(spec.raw);
        } else {
          removed.push(spec.localName);
        }
      }

      if (removed.length > 0) {
        importFixCount += removed.length;
        if (surviving.length === 0) {
          codePass = codePass.replace(fullStatement + "\n", "").replace(fullStatement, "");
        } else {
          const newStatement = `from ${fromModule} import ${surviving.join(", ")}`;
          codePass = codePass.replace(fullStatement, newStatement);
        }
        fixes.push({
          file: filePath,
          type: "unused-import",
          detail: `Removed unused Python import(s): ${removed.join(", ")} from "${fromModule}"`,
          applied: true
        });
      }
    }

    if (importFixCount > 0) {
      updated = codePass;
    }
  }

  return { newContent: updated, fixes };
}


interface BackupManifest {
  backupId: string;
  timestamp: string;
  root: string;
  deletedFiles: Array<{ relPath: string; backupRelative: string; sizeBytes: number }>;
  deletedDirs: string[];
  modifiedFiles: Array<{ relPath: string; backupRelative: string }>;
}

async function createBackupSnapshot(
  root: string,
  junkToDelete: JunkItem[],
  emptyDirsToDelete: string[],
  filesToModify: Array<{ file: string; originalContent: string }>
): Promise<string | null> {
  if (junkToDelete.length === 0 && emptyDirsToDelete.length === 0 && filesToModify.length === 0) {
    return null;
  }

  const backupId = `backup-${Date.now()}`;
  const backupRoot = path.join(root, ".anvil", "backups", backupId);
  const filesBackupDir = path.join(backupRoot, "files");
  const modifiedBackupDir = path.join(backupRoot, "modified");

  await mkdir(filesBackupDir, { recursive: true });
  await mkdir(modifiedBackupDir, { recursive: true });

  const manifest: BackupManifest = {
    backupId,
    timestamp: new Date().toISOString(),
    root,
    deletedFiles: [],
    deletedDirs: [...emptyDirsToDelete],
    modifiedFiles: []
  };

  // 1. Back up junk files before deletion
  for (let i = 0; i < junkToDelete.length; i++) {
    const item = junkToDelete[i]!;
    if (item.isDirectory) continue;
    try {
      const backupRel = `junk_${i}_${path.basename(item.path)}`;
      const backupDest = path.join(filesBackupDir, backupRel);
      await copyFile(item.absolutePath, backupDest);
      manifest.deletedFiles.push({
        relPath: item.path,
        backupRelative: backupRel,
        sizeBytes: item.sizeBytes
      });
    } catch {
      // Ignore copy error
    }
  }

  // 2. Back up files before code fixes
  for (let i = 0; i < filesToModify.length; i++) {
    const item = filesToModify[i]!;
    try {
      const backupRel = `mod_${i}_${path.basename(item.file)}`;
      const backupDest = path.join(modifiedBackupDir, backupRel);
      await writeFile(backupDest, item.originalContent, "utf8");
      manifest.modifiedFiles.push({
        relPath: item.file,
        backupRelative: backupRel
      });
    } catch {
      // Ignore
    }
  }

  const manifestPath = path.join(backupRoot, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  const latestPath = path.join(root, ".anvil", "backups", "latest.json");
  await writeFile(latestPath, JSON.stringify({ backupId, timestamp: manifest.timestamp, backupRoot }, null, 2), "utf8");

  return backupId;
}

export async function undoLastClean(inputPath: string): Promise<UndoResult> {
  const root = path.resolve(inputPath);
  const latestPath = path.join(root, ".anvil", "backups", "latest.json");
  let pointer: { backupId: string; backupRoot: string } | null = null;
  try {
    const raw = await readFile(latestPath, "utf8");
    pointer = JSON.parse(raw);
  } catch {
    return {
      root,
      backupId: "",
      restoredAt: new Date().toISOString(),
      restoredFiles: [],
      restoredDirs: [],
      revertedCodeFixes: [],
      errors: ["No previous ANVIL clean/fix backup found in this workspace."]
    };
  }

  const backupRoot = pointer!.backupRoot || path.join(root, ".anvil", "backups", pointer!.backupId);
  const manifestPath = path.join(backupRoot, "manifest.json");
  let manifest: BackupManifest;
  try {
    const raw = await readFile(manifestPath, "utf8");
    manifest = JSON.parse(raw);
  } catch {
    return {
      root,
      backupId: pointer!.backupId,
      restoredAt: new Date().toISOString(),
      restoredFiles: [],
      restoredDirs: [],
      revertedCodeFixes: [],
      errors: [`Backup manifest not found or corrupted at ${manifestPath}`]
    };
  }

  const restoredFiles: string[] = [];
  const restoredDirs: string[] = [];
  const revertedCodeFixes: string[] = [];
  const errors: string[] = [];

  // Restore modified code files
  const modifiedBackupDir = path.join(backupRoot, "modified");
  for (const item of manifest.modifiedFiles) {
    try {
      const src = path.join(modifiedBackupDir, item.backupRelative);
      const dest = path.join(root, item.relPath);
      const fileContent = await readFile(src, "utf8");
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, fileContent, "utf8");
      revertedCodeFixes.push(item.relPath);
    } catch (err: any) {
      errors.push(`Could not restore modified file ${item.relPath}: ${err?.message || String(err)}`);
    }
  }

  // Restore deleted files
  const filesBackupDir = path.join(backupRoot, "files");
  for (const item of manifest.deletedFiles) {
    try {
      const src = path.join(filesBackupDir, item.backupRelative);
      const dest = path.join(root, item.relPath);
      await mkdir(path.dirname(dest), { recursive: true });
      await copyFile(src, dest);
      restoredFiles.push(item.relPath);
    } catch (err: any) {
      errors.push(`Could not restore deleted file ${item.relPath}: ${err?.message || String(err)}`);
    }
  }

  // Restore empty directories
  for (const relDir of manifest.deletedDirs) {
    try {
      const dest = path.join(root, relDir);
      await mkdir(dest, { recursive: true });
      restoredDirs.push(relDir);
    } catch (err: any) {
      errors.push(`Could not re-create directory ${relDir}: ${err?.message || String(err)}`);
    }
  }

  // Invalidate latest pointer so undo is not run twice on the same snapshot
  try {
    await rm(latestPath, { force: true });
  } catch {}

  return {
    root,
    backupId: manifest.backupId,
    restoredAt: new Date().toISOString(),
    restoredFiles,
    restoredDirs,
    revertedCodeFixes,
    errors
  };
}

async function detectTestCommand(root: string): Promise<string | null> {
  try {
    const pkgRaw = await readFile(path.join(root, "package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw);
    if (pkg.scripts && pkg.scripts.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
      return process.platform === "win32" ? "npm.cmd" : "npm";
    }
  } catch {}

  try {
    await stat(path.join(root, "Cargo.toml"));
    return "cargo";
  } catch {}

  try {
    await stat(path.join(root, "pytest.ini"));
    return "pytest";
  } catch {}

  try {
    await stat(path.join(root, "go.mod"));
    return "go";
  } catch {}

  return null;
}

export async function installPrecommitHook(inputPath: string): Promise<{ success: boolean; hookPath: string; detail: string }> {
  const root = path.resolve(inputPath);
  const gitHooksDir = path.join(root, ".git", "hooks");
  try {
    await mkdir(gitHooksDir, { recursive: true });
    const hookPath = path.join(gitHooksDir, "pre-commit");
    const script = `#!/usr/bin/env sh
# ANVIL automated pre-commit quality gate
echo "[ANVIL] Running pre-commit clean & quality check..."
anvil clean --apply --json > /dev/null 2>&1 || true
`;
    await writeFile(hookPath, script, { encoding: "utf8", mode: 0o755 });
    return {
      success: true,
      hookPath,
      detail: "Installed ANVIL pre-commit hook into .git/hooks/pre-commit"
    };
  } catch (err: any) {
    return {
      success: false,
      hookPath: path.join(gitHooksDir, "pre-commit"),
      detail: `Failed to install pre-commit hook: ${err?.message || String(err)}`
    };
  }
}

export function formatUndoReport(result: UndoResult): string {
  const lines = [
    "# ANVIL Workspace Rollback (Undo)",
    "",
    `- **Target:** \`${result.root}\``,
    `- **Backup ID:** \`${result.backupId || "None"}\``,
    `- **Restored at:** \`${result.restoredAt}\``,
    `- **Reverted code fixes:** \`${result.revertedCodeFixes.length}\` files restored to original content`,
    `- **Restored deleted files:** \`${result.restoredFiles.length}\` files recovered`,
    `- **Restored directories:** \`${result.restoredDirs.length}\` directories re-created`,
    ""
  ];

  if (result.revertedCodeFixes.length > 0) {
    lines.push("## Reverted Code Fixes");
    for (const f of result.revertedCodeFixes) {
      lines.push(`- \`${f}\` (reverted)`);
    }
    lines.push("");
  }

  if (result.restoredFiles.length > 0) {
    lines.push("## Restored Files");
    for (const f of result.restoredFiles) {
      lines.push(`- \`${f}\` (recovered from backup)`);
    }
    lines.push("");
  }

  if (result.errors.length > 0) {
    lines.push("## Errors");
    for (const e of result.errors) {
      lines.push(`- ${e}`);
    }
    lines.push("");
  }

  if (result.errors.length === 0) {
    lines.push("> [!NOTE] Workspace was successfully restored to its state prior to the last clean/fix operation.");
    lines.push("");
  }

  return lines.join("\n");
}

export async function cleanProject(inputPath: string, options: CleanOptions = {}): Promise<CleanResult> {
  const root = path.resolve(inputPath);
  const apply = Boolean(options.apply);
  const fixCode = Boolean(options.fix);
  const checkOrphans = options.checkOrphans !== false;
  const verify = Boolean(options.verify);

  const { items: junkItems, emptyDirs } = await scanJunk(root);
  const orphanFiles: OrphanFileItem[] = [];
  const codeFixes: CodeFixItem[] = [];
  const warnings: string[] = [];

  let bytesReclaimed = 0;
  let junkDeleted = 0;

  for (const item of junkItems) {
    bytesReclaimed += item.sizeBytes;
  }

  for (const emptyDir of emptyDirs) {
    junkItems.push({
      path: emptyDir,
      absolutePath: path.join(root, emptyDir),
      category: "empty-dir",
      reason: "Empty directory leftover",
      sizeBytes: 0,
      isDirectory: true
    });
  }

  // 1. Scan for orphan source files using architecture mapping
  if (checkOrphans) {
    try {
      const arch = await mapArchitecture(root);
      const incomingCounts = new Map<string, number>();
      for (const node of arch.nodes) {
        incomingCounts.set(node.file, 0);
      }
      for (const edge of arch.edges) {
        if (edge.kind === "internal") {
          incomingCounts.set(edge.to, (incomingCounts.get(edge.to) || 0) + 1);
        }
      }

      for (const node of arch.nodes) {
        const incoming = incomingCounts.get(node.file) || 0;
        if (node.role === "module" && incoming === 0) {
          orphanFiles.push({
            file: node.file,
            lines: node.lines,
            reason: "Source module with 0 incoming imports (unreferenced by mapped files)"
          });
        }
      }
    } catch {
      // Optional/heuristic
    }
  }

  // 2. Prepare Code Auto-Repair
  const filesToModify: Array<{ file: string; fullFilePath: string; originalContent: string; newContent: string; fixes: CodeFixItem[] }> = [];

  if (fixCode) {
    try {
      const collectSource = async (dir: string, rel = ""): Promise<string[]> => {
        const full = path.join(dir, rel);
        let entries;
        try { entries = await readdir(full, { withFileTypes: true }); }
        catch { return []; }
        const res: string[] = [];
        for (const e of entries) {
          const childRel = rel ? path.join(rel, e.name) : e.name;
          if (e.isDirectory() && !isExcludedScanDirectory(e.name)) {
            res.push(...await collectSource(dir, childRel));
          } else if (e.isFile() && [
            ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
            ".py", ".pyw",
            ".go",
            ".rs",
            ".java", ".kt",
            ".c", ".cpp", ".cc", ".cxx", ".h", ".hpp",
            ".cs"
          ].includes(path.extname(e.name).toLowerCase())) {
            res.push(childRel.split(path.sep).join("/"));
          }
        }
        return res;
      };

      const sourceFiles = await collectSource(root);
      for (const file of sourceFiles) {
        const fullFilePath = path.join(root, file);
        try {
          const raw = await readFile(fullFilePath, "utf8");
          const { newContent, fixes } = autoFixCodeContent(raw, file);
          if (fixes.length > 0) {
            codeFixes.push(...fixes);
            filesToModify.push({ file, fullFilePath, originalContent: raw, newContent, fixes });
          }
        } catch {
          // File read error
        }
      }
    } catch (err: any) {
      warnings.push(`Code repair pass encountered an error: ${err?.message || String(err)}`);
    }
  }

  // 3. Execution (if apply: true)
  let backupId: string | undefined;
  let verification: CleanVerificationResult | undefined;

  if (apply) {
    // A. Create snapshot backup before modifying or deleting anything
    try {
      const bid = await createBackupSnapshot(root, junkItems, emptyDirs, filesToModify);
      if (bid) backupId = bid;
    } catch (err: any) {
      warnings.push(`Could not create rollback backup: ${err?.message || String(err)}`);
    }

    // B. Delete junk files and empty directories
    for (const item of junkItems) {
      try {
        if (item.isDirectory) {
          await rm(item.absolutePath, { recursive: true, force: true });
        } else {
          await unlink(item.absolutePath);
        }
        junkDeleted++;
      } catch (err: any) {
        warnings.push(`Failed to delete ${item.path}: ${err?.message || String(err)}`);
      }
    }

    // C. Write code fixes
    for (const item of filesToModify) {
      try {
        await writeFile(item.fullFilePath, item.newContent, "utf8");
      } catch (err: any) {
        warnings.push(`Failed to write code fix to ${item.file}: ${err?.message || String(err)}`);
      }
    }

    // D. Self-Healing Verification Loop
    if (verify) {
      const testCmd = options.testCommand || await detectTestCommand(root);
      if (testCmd) {
        try {
          let stdout = "";
          const execOpts = { cwd: root, timeout: 60000, shell: process.platform === "win32" };
          if (testCmd.includes("npm")) {
            const res = await execFileAsync(testCmd, ["test"], execOpts);
            stdout = res.stdout;
          } else if (testCmd === "cargo") {
            const res = await execFileAsync("cargo", ["test"], execOpts);
            stdout = res.stdout;
          } else if (testCmd === "pytest") {
            const res = await execFileAsync("pytest", [], execOpts);
            stdout = res.stdout;
          } else if (testCmd === "go") {
            const res = await execFileAsync("go", ["test", "./..."], execOpts);
            stdout = res.stdout;
          }
          verification = {
            enabled: true,
            passed: true,
            rolledBack: false,
            command: testCmd,
            output: stdout.trim().slice(0, 500)
          };
        } catch (testErr: any) {
          // Tests failed! Auto-rollback to restore original workspace
          await undoLastClean(root);
          verification = {
            enabled: true,
            passed: false,
            rolledBack: true,
            command: testCmd,
            error: `Project tests failed after code repairs: ${testErr?.message || String(testErr)}. Workspace was automatically restored.`
          };
          warnings.push("Verification failed! Workspace was automatically rolled back to prevent regression.");
        }
      } else {
        warnings.push("No automated test suite detected in workspace to verify changes.");
      }
    }
  }

  const codeFixesApplied = (apply && (!verification || !verification.rolledBack)) ? codeFixes.length : 0;

  return {
    root,
    generatedAt: new Date().toISOString(),
    applied: apply,
    dryRun: !apply,
    backupId,
    verification,
    junkItems,
    orphanFiles,
    codeFixes,
    stats: {
      junkFound: junkItems.length,
      junkDeleted: (apply && (!verification || !verification.rolledBack)) ? junkDeleted : 0,
      bytesReclaimed,
      codeFixesFound: codeFixes.length,
      codeFixesApplied,
      orphanFilesFound: orphanFiles.length
    },
    warnings
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatCleanReport(result: CleanResult): string {
  const modeText = result.applied ? "**APPLIED** (Deleted junk & saved fixes)" : "**DRY RUN** (Preview only — pass `--apply` to execute)";
  const lines = [
    "# ANVIL Workspace Clean & Repair",
    "",
    `- **Target:** \`${result.root}\``,
    `- **Status:** ${modeText}`,
    `- **Junk items:** \`${result.stats.junkFound}\` found (${formatBytes(result.stats.bytesReclaimed)} space)${result.applied ? ` · \`${result.stats.junkDeleted}\` deleted` : ""}`,
    `- **Code auto-fixes:** \`${result.stats.codeFixesFound}\` available${result.applied ? ` · \`${result.stats.codeFixesApplied}\` applied` : ""}`,
    `- **Orphan files detected:** \`${result.stats.orphanFilesFound}\``,
    ...(result.backupId ? [`- **Rollback backup:** \`${result.backupId}\` (Run \`anvil undo\` to restore anytime)`] : []),
    ...(result.verification ? [(result.verification.passed ? `- **Self-Healing Verification:** PASSED (\`${result.verification.command}\`)` : `- **Self-Healing Verification:** FAILED -> AUTO-ROLLED BACK (\`${result.verification.command}\`)`)] : []),
    `- **Timestamp:** \`${result.generatedAt}\``,
    ""
  ];

  if (result.junkItems.length > 0) {
    lines.push("## Workspace Junk Artifacts");
    for (const item of result.junkItems.slice(0, 50)) {
      lines.push(`- \`[${item.category.toUpperCase()}]\` \`${item.path}\` (${formatBytes(item.sizeBytes)}) — ${item.reason}`);
    }
    if (result.junkItems.length > 50) {
      lines.push(`- *...and ${result.junkItems.length - 50} more items.*`);
    }
    lines.push("");
  } else {
    lines.push("## Workspace Junk Artifacts", "- No OS, editor, download, or log clutter detected. Workspace is clean!", "");
  }

  if (result.codeFixes.length > 0) {
    lines.push("## Code Auto-Fixes");
    for (const fix of result.codeFixes.slice(0, 30)) {
      lines.push(`- \`[${fix.type.toUpperCase()}]\` \`${fix.file}\`: ${fix.detail}`);
    }
    if (result.codeFixes.length > 30) {
      lines.push(`- *...and ${result.codeFixes.length - 30} more code fixes.*`);
    }
    lines.push("");
  }

  if (result.orphanFiles.length > 0) {
    lines.push("## Orphan & Unreferenced Source Modules");
    lines.push("> [!NOTE] These files exist in the project but are never imported or linked by other modules. Review them to decide if they should be pruned.");
    for (const orphan of result.orphanFiles.slice(0, 20)) {
      lines.push(`- \`${orphan.file}\` (${orphan.lines} lines) — ${orphan.reason}`);
    }
    if (result.orphanFiles.length > 20) {
      lines.push(`- *...and ${result.orphanFiles.length - 20} more unreferenced files.*`);
    }
    lines.push("");
  }

  if (result.warnings.length > 0) {
    lines.push("## Warnings");
    for (const w of result.warnings) {
      lines.push(`- ${w}`);
    }
    lines.push("");
  }

  if (result.dryRun) {
    lines.push("> [!TIP] Run `anvil clean . --apply` to delete junk files, or `anvil clean . --apply --fix` to clean clutter AND auto-repair code issues.");
    lines.push("");
  }

  lines.push("_Generated by ANVIL Workspace Cleaner._");
  return lines.join("\n");
}
