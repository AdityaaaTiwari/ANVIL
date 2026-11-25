import { mkdir, mkdtemp, writeFile, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanProject,
  autoFixCodeContent,
  formatCleanReport,
  undoLastClean,
  formatUndoReport,
  installPrecommitHook,
  uninstallPrecommitHook,
} from "../src/core/project-cleaner.js";
import { safeRm } from "./test-helpers.js";

const temporaryDirectories: string[] = [];

async function createTempWorkspace(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "anvil-cleaner-test-"));
  temporaryDirectories.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((d) => safeRm(d)));
});

describe("autoFixCodeContent", () => {
  it("trims trailing whitespace and collapses multiple blank lines", () => {
    const code = "const a = 1;   \n\n\n\nconst b = 2;\t\t\n";
    const { newContent, fixes } = autoFixCodeContent(code, "test.ts");

    expect(newContent).toBe("const a = 1;\n\nconst b = 2;\n");
    expect(fixes.some((f) => f.type === "whitespace")).toBe(true);
    expect(fixes.some((f) => f.type === "blank-lines")).toBe(true);
  });

  it("preserves trailing whitespace and consecutive blank lines inside JS/TS template literals", () => {
    const code = "const sql = `\n  SELECT *   \n\n\n\n  FROM users   \n`;\nconst a = 1;   \n";
    const { newContent, fixes } = autoFixCodeContent(code, "query.ts");

    // Trailing whitespace inside template literal MUST be preserved exactly
    expect(newContent).toContain("  SELECT *   \n");
    expect(newContent).toContain("  FROM users   \n");
    // Trailing whitespace outside template literal should be cleaned
    expect(newContent).toContain("const a = 1;\n");
  });

  it("preserves trailing whitespace and docstrings in Python files", () => {
    const pyCode = `def fetch_data():\n    """\n    Query builder docstring with spaces   \n\n\n\n    Another line   \n    """\n    x = 42   \n    return x\n`;
    const { newContent } = autoFixCodeContent(pyCode, "service.py");

    // Whitespace inside triple-quoted docstring MUST NOT be altered
    expect(newContent).toContain("Query builder docstring with spaces   \n");
    expect(newContent).toContain("Another line   \n");
    // Code line outside docstring should be cleaned
    expect(newContent).toContain("    x = 42\n");
  });

  it("removes unused named imports and keeps used ones", () => {
    const code = `import { usedFn, unusedFn } from "./helpers.js";\n\nconsole.log(usedFn());\n`;
    const { newContent, fixes } = autoFixCodeContent(code, "example.ts");

    expect(newContent).toContain(`import { usedFn } from "./helpers.js";`);
    expect(newContent).not.toContain("unusedFn");
    expect(fixes.some((f) => f.type === "unused-import" && f.detail.includes("unusedFn"))).toBe(true);
  });

  it("removes the entire import line when all named specifiers are unused", () => {
    const code = `import { junkA, junkB } from "./dead.js";\n\nexport const x = 42;\n`;
    const { newContent, fixes } = autoFixCodeContent(code, "example.ts");

    expect(newContent).not.toContain("./dead.js");
    expect(fixes.some((f) => f.type === "unused-import")).toBe(true);
  });

  it("removes unused imports in Python files while keeping used ones", () => {
    const pyCode = "from math import sqrt, ceil, floor\n\nprint(sqrt(16))\n";
    const { newContent, fixes } = autoFixCodeContent(pyCode, "script.py");

    expect(newContent).toContain("from math import sqrt");
    expect(newContent).not.toContain("ceil");
    expect(newContent).not.toContain("floor");
    expect(fixes.some((f) => f.type === "unused-import" && f.detail.includes("ceil"))).toBe(true);
  });

  it("preserves Python re-exports in __init__.py and exports in __all__", () => {
    const initPy = "from .models import User, Post\nfrom .auth import authenticate\n";
    const initResult = autoFixCodeContent(initPy, "__init__.py");
    expect(initResult.newContent).toContain("from .models import User, Post");
    expect(initResult.newContent).toContain("from .auth import authenticate");
    expect(initResult.fixes.filter((f) => f.type === "unused-import")).toHaveLength(0);

    const modulePy = 'from .internal import Engine, Driver, unused\n\n__all__ = ["Engine", "Driver"]\n';
    const modResult = autoFixCodeContent(modulePy, "pkg.py");
    expect(modResult.newContent).toContain("Engine, Driver");
    expect(modResult.newContent).not.toContain("unused");
  });

  it("preserves JSX pragma imports like { h } from preact and React when JSX is present", () => {
    const jsxCode =
      '/** @jsx h */\nimport { h, Fragment, unusedFn } from "preact";\n\nexport const App = () => <div>Hello</div>;\n';
    const result = autoFixCodeContent(jsxCode, "component.tsx");
    expect(result.newContent).toContain("h, Fragment");
    expect(result.newContent).not.toContain("unusedFn");
  });

  it("does not alter markdown or json files (preserves line-breaks and strings)", () => {
    const md = "# Title  \nHard break above with two trailing spaces.  \n";
    const mdResult = autoFixCodeContent(md, "README.md");
    expect(mdResult.newContent).toBe(md);
    expect(mdResult.fixes).toHaveLength(0);

    const json = '{\n  "msg": "trailing spaces   "\n}\n';
    const jsonResult = autoFixCodeContent(json, "config.json");
    expect(jsonResult.newContent).toBe(json);
    expect(jsonResult.fixes).toHaveLength(0);
  });
});

describe("cleanProject", () => {
  it("detects OS, editor, download, and log clutter in dry-run mode without deleting", async () => {
    const root = await createTempWorkspace();
    const dsStore = path.join(root, ".DS_Store");
    const npmLog = path.join(root, "npm-debug.log");
    const tempDownload = path.join(root, "file.crdownload");
    const editorBackup = path.join(root, "script.js~");

    await writeFile(dsStore, "ds-store-data");
    await writeFile(npmLog, "error log contents");
    await writeFile(tempDownload, "partial data");
    await writeFile(editorBackup, "backup data");

    const dryRun = await cleanProject(root, { apply: false });

    expect(dryRun.dryRun).toBe(true);
    expect(dryRun.applied).toBe(false);
    expect(dryRun.junkItems.length).toBe(4);
    expect(dryRun.stats.bytesReclaimed).toBeGreaterThan(0);
    expect(dryRun.stats.junkDeleted).toBe(0);

    // Verify files were NOT deleted in dry-run mode
    const s1 = await stat(dsStore);
    expect(s1.isFile()).toBe(true);

    const markdown = formatCleanReport(dryRun);
    expect(markdown).toContain("# ANVIL Workspace Clean & Repair");
    expect(markdown).toContain("DRY RUN");
    expect(markdown).toContain(".DS_Store");
    expect(markdown).toContain("npm-debug.log");
  });

  it("deletes junk files and cleans empty directories when apply is true", async () => {
    const root = await createTempWorkspace();
    const thumbsDb = path.join(root, "Thumbs.db");
    const yarnError = path.join(root, "yarn-error.log");
    const emptySubdir = path.join(root, "empty-folder");

    await writeFile(thumbsDb, "thumbs");
    await writeFile(yarnError, "yarn error log");
    await mkdir(emptySubdir);

    const result = await cleanProject(root, { apply: true });

    expect(result.applied).toBe(true);
    expect(result.stats.junkDeleted).toBeGreaterThanOrEqual(2);

    // Verify files were actually deleted
    await expect(stat(thumbsDb)).rejects.toThrow();
    await expect(stat(yarnError)).rejects.toThrow();
  });

  it("detects multi-language junk: Python cache, C objects, Java classes", async () => {
    const root = await createTempWorkspace();
    const pycache = path.join(root, "__pycache__");
    const pycFile = path.join(pycache, "module.cpython-311.pyc");
    const cObj = path.join(root, "main.o");
    const javaClass = path.join(root, "App.class");
    const downloadPart = path.join(root, "package.tar.gz.part");

    await mkdir(pycache);
    await writeFile(pycFile, "pyc bytes");
    await writeFile(cObj, "object bytes");
    await writeFile(javaClass, "bytecode");
    await writeFile(downloadPart, "partial download");

    const result = await cleanProject(root, { apply: false });
    expect(result.junkItems.length).toBeGreaterThanOrEqual(4);
    expect(result.junkItems.some((i) => i.path.includes("__pycache__") || i.path.includes(".pyc"))).toBe(true);
    expect(result.junkItems.some((i) => i.path.includes("main.o"))).toBe(true);
    expect(result.junkItems.some((i) => i.path.includes("App.class"))).toBe(true);
    expect(result.junkItems.some((i) => i.path.includes(".part"))).toBe(true);
  });

  it("auto-fixes source code files when fix and apply are both true", async () => {
    const root = await createTempWorkspace();
    const sourceFile = path.join(root, "main.ts");
    await writeFile(sourceFile, `import { alpha, unusedBeta } from "./lib.js";  \n\n\n\nconsole.log(alpha);   \n`);

    const result = await cleanProject(root, { apply: true, fix: true });

    expect(result.applied).toBe(true);
    expect(result.codeFixes.length).toBeGreaterThan(0);

    const fixed = await readFile(sourceFile, "utf8");
    expect(fixed).toContain(`import { alpha } from "./lib.js";`);
    expect(fixed).not.toContain("unusedBeta");
    expect(fixed).not.toContain("   ");
  });

  it("creates a rollback snapshot and restores files with undoLastClean", async () => {
    const root = await createTempWorkspace();
    const junkFile = path.join(root, ".DS_Store");
    const sourceFile = path.join(root, "index.ts");
    const originalSource = 'import { foo, bar } from "./helper.js";   \n\nconsole.log(foo);\n';

    await writeFile(junkFile, "ds-store-content");
    await writeFile(sourceFile, originalSource);

    // Apply clean & fix
    const cleanResult = await cleanProject(root, { apply: true, fix: true });
    expect(cleanResult.applied).toBe(true);
    expect(cleanResult.backupId).toBeDefined();

    // Verify junk was deleted and code was fixed
    await expect(stat(junkFile)).rejects.toThrow();
    const modifiedCode = await readFile(sourceFile, "utf8");
    expect(modifiedCode).not.toContain("bar");

    // Perform UNDO
    const undoResult = await undoLastClean(root);
    expect(undoResult.errors.length).toBe(0);
    expect(undoResult.restoredFiles.length).toBeGreaterThan(0);
    expect(undoResult.revertedCodeFixes.length).toBeGreaterThan(0);

    // Verify junk file was restored from backup
    const restoredJunkStat = await stat(junkFile);
    expect(restoredJunkStat.isFile()).toBe(true);

    // Verify source file was restored to exact original content
    const restoredCode = await readFile(sourceFile, "utf8");
    expect(restoredCode).toBe(originalSource);

    const report = formatUndoReport(undoResult);
    expect(report).toContain("# ANVIL Workspace Rollback (Undo)");
  });

  it("returns a clean error message when undoLastClean is called with no prior backup", async () => {
    const root = await createTempWorkspace();
    const result = await undoLastClean(root);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("No previous ANVIL clean/fix backup found");
  });

  it("installs pre-commit hook into .git/hooks/pre-commit", async () => {
    const root = await createTempWorkspace();
    await mkdir(path.join(root, ".git"));

    const hookResult = await installPrecommitHook(root);
    expect(hookResult.success).toBe(true);

    const hookContent = await readFile(hookResult.hookPath, "utf8");
    expect(hookContent).toContain("#!/usr/bin/env sh");
    expect(hookContent).toContain("anvil clean");
  });

  it("protects template literal whitespace even when an apostrophe in JSX text precedes it on the same line", async () => {
    const root = await createTempWorkspace();
    const tsxCode = `export function Banner() {
  return (
    <div>
      <p>Don't miss out</p> {\`multi-line
template with space   
end\`}
    </div>
  );
}`;
    const filePath = path.join(root, "Banner.tsx");
    await writeFile(filePath, tsxCode, "utf8");

    await cleanProject(root, { apply: true, fix: true });
    const cleaned = await readFile(filePath, "utf8");
    expect(cleaned).toContain("template with space   \n");
  });

  it("backs up and restores junk directories like __pycache__ during clean & undo", async () => {
    const root = await createTempWorkspace();
    const pycache = path.join(root, "__pycache__");
    await mkdir(pycache);
    const pycFile = path.join(pycache, "cache.pyc");
    await writeFile(pycFile, "compiled python cache data");

    const cleanResult = await cleanProject(root, { apply: true });
    expect(cleanResult.applied).toBe(true);
    await expect(stat(pycFile)).rejects.toThrow();

    const undoResult = await undoLastClean(root, cleanResult.backupId);
    expect(undoResult.errors).toHaveLength(0);
    const restored = await stat(pycFile);
    expect(restored.isFile()).toBe(true);
    const restoredContent = await readFile(pycFile, "utf8");
    expect(restoredContent).toBe("compiled python cache data");
  });

  it("refuses to overwrite existing pre-commit hook and uses non-destructive dry-run", async () => {
    const root = await createTempWorkspace();
    const hooksDir = path.join(root, ".git", "hooks");
    await mkdir(hooksDir, { recursive: true });
    const hookPath = path.join(hooksDir, "pre-commit");
    await writeFile(hookPath, "#!/bin/sh\necho custom-hook\n");

    const result = await installPrecommitHook(root);
    expect(result.success).toBe(false);
    expect(result.detail).toContain("already exists");

    const content = await readFile(hookPath, "utf8");
    expect(content).toContain("custom-hook");

    // Overwrite with force
    const forceResult = await installPrecommitHook(root, { force: true });
    expect(forceResult.success).toBe(true);
    const forcedContent = await readFile(hookPath, "utf8");
    expect(forcedContent).toContain("ANVIL automated pre-commit");

    // Uninstall hook
    const uninstallResult = await uninstallPrecommitHook(root);
    expect(uninstallResult.success).toBe(true);
    await expect(stat(hookPath)).rejects.toThrow();
  });

  it("does not classify .pyd or top-level Protein Data Bank .pdb files as junk", async () => {
    const root = await createTempWorkspace();
    const pydFile = path.join(root, "native_ext.pyd");
    const pdbMolecule = path.join(root, "protein_structure.pdb");
    const objDir = path.join(root, "obj");
    await mkdir(objDir);
    const objPdb = path.join(objDir, "symbols.pdb");

    await writeFile(pydFile, "compiled c-extension");
    await writeFile(pdbMolecule, "ATOM      1  N   ASP A   1");
    await writeFile(objPdb, "microsoft pdb debug symbols");

    const result = await cleanProject(root, { apply: false });
    const junkPaths = result.junkItems.map((i) => i.path);
    expect(junkPaths).not.toContain("native_ext.pyd");
    expect(junkPaths).not.toContain("protein_structure.pdb");
    expect(junkPaths.some((p) => p.includes("obj") && p.includes("symbols.pdb"))).toBe(true);
  });

  it("preserves PEP 8 two blank lines in Python files", () => {
    const pyCode = "def func_a():\n    pass\n\n\ndef func_b():\n    pass\n";
    const { newContent } = autoFixCodeContent(pyCode, "module.py");
    expect(newContent).toBe(pyCode);
  });
});
