import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { isExcludedScanDirectory } from "./workspace-scan-policy.js";

const SOURCE_EXTENSIONS = new Set([
  // JavaScript / TypeScript
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  // Python
  ".py",
  ".pyw",
  // Go
  ".go",
  // Rust
  ".rs",
  // Java & JVM
  ".java",
  ".kt",
  ".kts",
  ".scala",
  // C / C++
  ".c",
  ".cpp",
  ".cc",
  ".cxx",
  ".h",
  ".hpp",
  ".hxx",
  // C#
  ".cs",
  // Ruby & PHP
  ".rb",
  ".php",
]);

const JS_IMPORT_PATTERNS = [
  /\bimport\s+(?:type\s+)?(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']/g,
  /\bexport\s+(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/g,
  /\brequire\(\s*["']([^"']+)["']\s*\)/g,
  /\bimport\(\s*["']([^"']+)["']\s*\)/g,
];

export interface ArchitectureNode {
  file: string;
  imports: string[];
  lines: number;
  role: "entry" | "module" | "test" | "config" | "documentation";
}

export interface ArchitectureEdge {
  from: string;
  to: string;
  kind: "internal" | "external";
}

export interface ArchitectureMap {
  root: string;
  generatedAt: string;
  scannedFiles: number;
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
  entryPoints: string[];
  externalPackages: Array<{ name: string; importedBy: number }>;
  warnings: string[];
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function roleFor(file: string): ArchitectureNode["role"] {
  const lower = file.toLowerCase();
  const base = path.basename(lower);

  // Tests across languages
  if (
    /(^|\/)(test|tests|__tests__|spec|specs)(\/|$)/.test(lower) ||
    /\.(test|spec)\.[a-z0-9]+$/.test(lower) ||
    base.startsWith("test_") ||
    base.endsWith("_test.py") ||
    base.endsWith("_test.go") ||
    base.endsWith("test.java")
  ) {
    return "test";
  }

  // Documentation
  if (/\.(md|mdx|txt|rst|adoc)$/.test(lower)) return "documentation";

  // Configuration
  if (
    /(^|\/)(config|configs)\//.test(lower) ||
    /(^|\/)(vite|next|vitest|eslint|prettier|tsconfig|webpack|rollup|babel|cargo|pyproject|setup|go)\./.test(lower) ||
    base === "cmakelists.txt" ||
    base === "makefile" ||
    base === "dockerfile"
  ) {
    return "config";
  }

  // Entry points (main entry, CLI, servers, framework routing & serverless / API routes)
  if (
    /(^|\/)(api|routes|pages|views|controllers|handlers|endpoints|app)(\/|$)/.test(lower) ||
    /(^|\/)(index|main|cli|server|app|run|launch)\.[a-z0-9]+$/.test(lower) ||
    /^(src\/)?(index|main|cli|server|app)\.[a-z0-9]+$/.test(lower) ||
    base === "manage.py" ||
    base === "wsgi.py" ||
    base === "asgi.py" ||
    base === "__main__.py" ||
    base === "conftest.py" ||
    base === "urls.py" ||
    base === "routers.py" ||
    base === "tasks.py" ||
    base === "celery.py" ||
    base === "lib.rs" ||
    base === "build.rs" ||
    /(^|\/)bin\/[^\/]+\.rs$/.test(lower) ||
    /(^|\/)examples\/[^\/]+\.rs$/.test(lower) ||
    /(^|\/)benches\/[^\/]+\.rs$/.test(lower) ||
    /(^|\/)cmd\/[^\/]+\/main\.go$/.test(lower) ||
    base.startsWith("page.") ||
    base.startsWith("layout.") ||
    base.startsWith("loading.") ||
    base.startsWith("error.") ||
    base.startsWith("not-found.") ||
    base.startsWith("route.") ||
    base.startsWith("middleware.") ||
    base.startsWith("+page.") ||
    base.startsWith("+layout.") ||
    base.startsWith("+server.")
  ) {
    return "entry";
  }

  return "module";
}

function extractImports(file: string, content: string): string[] {
  const ext = path.extname(file).toLowerCase();
  const imports: string[] = [];

  if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
    for (const pattern of JS_IMPORT_PATTERNS) {
      pattern.lastIndex = 0;
      for (const match of content.matchAll(pattern)) {
        if (match[1]) imports.push(match[1]);
      }
    }
  } else if ([".py", ".pyw"].includes(ext)) {
    const fromPattern = /^\s*from\s+([.\w]+)\s+import/gm;
    const importPattern = /^\s*import\s+([\w\s,.]+)/gm;
    for (const match of content.matchAll(fromPattern)) {
      if (match[1]) imports.push(match[1]);
    }
    for (const match of content.matchAll(importPattern)) {
      if (match[1]) {
        for (const item of match[1].split(",")) {
          const mod = item
            .trim()
            .split(/\s+as\s+/)[0]
            ?.trim();
          if (mod) imports.push(mod);
        }
      }
    }
  } else if (ext === ".go") {
    const singleImport = /\bimport\s+["']([^"']+)["']/g;
    const multiImport = /\bimport\s*\(\s*([^)]+)\s*\)/g;
    for (const match of content.matchAll(singleImport)) {
      if (match[1]) imports.push(match[1]);
    }
    for (const match of content.matchAll(multiImport)) {
      if (match[1]) {
        const itemPattern = /["']([^"']+)["']/g;
        for (const m of match[1].matchAll(itemPattern)) {
          if (m[1]) imports.push(m[1]);
        }
      }
    }
  } else if (ext === ".rs") {
    const modPattern = /\bmod\s+([a-zA-Z0-9_]+)\s*;/g;
    const usePattern = /\buse\s+(?:crate::|super::)?([a-zA-Z0-9_:]+)/g;
    for (const match of content.matchAll(modPattern)) {
      if (match[1]) imports.push("./" + match[1]);
    }
    for (const match of content.matchAll(usePattern)) {
      if (match[1]) imports.push(match[1].replace(/::/g, "/"));
    }
  } else if ([".c", ".cpp", ".cc", ".cxx", ".h", ".hpp", ".hxx"].includes(ext)) {
    const includePattern = /#include\s+([<"][^>"]+[>"])/g;
    for (const match of content.matchAll(includePattern)) {
      const raw = match[1];
      if (raw) {
        if (raw.startsWith('"') && raw.endsWith('"')) {
          imports.push("./" + raw.slice(1, -1));
        } else if (raw.startsWith("<") && raw.endsWith(">")) {
          imports.push(raw.slice(1, -1));
        }
      }
    }
  } else if ([".java", ".kt", ".kts", ".cs"].includes(ext)) {
    const jvmPattern = /\bimport\s+(?:static\s+)?([a-zA-Z0-9_.*]+)\s*;/g;
    for (const match of content.matchAll(jvmPattern)) {
      if (match[1]) imports.push(match[1]);
    }
  }

  return unique(imports);
}

export function resolveInternal(from: string, rawSpecifier: string, knownFiles: Set<string>): string | null {
  const fromDir = path.posix.dirname(from);
  const candidates: string[] = [];

  // Normalize Python relative imports: `.service` -> `./service`, `..service` -> `../service`, `.models.user` -> `./models/user`
  let specifier = rawSpecifier;
  if (/^\.+[a-zA-Z0-9_]/.test(specifier)) {
    const m = specifier.match(/^(\.+)(.*)$/);
    if (m && m[1] && m[2] !== undefined) {
      const dots = m[1].length;
      const rest = m[2].replace(/\./g, "/");
      const up = "../".repeat(dots - 1);
      specifier = (up ? up : "./") + rest;
    }
  }

  if (specifier.startsWith(".")) {
    const base = path.posix.normalize(path.posix.join(fromDir, specifier));
    const noExt = base.replace(/\.[a-zA-Z0-9]+$/, "");
    candidates.push(
      base,
      ...[
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".mjs",
        ".cjs",
        ".py",
        ".go",
        ".rs",
        ".java",
        ".c",
        ".cpp",
        ".h",
        ".hpp",
        ".json",
      ].map((ext) => noExt + ext),
      ...[
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".mjs",
        ".cjs",
        ".py",
        ".go",
        ".rs",
        ".java",
        ".c",
        ".cpp",
        ".h",
        ".hpp",
        ".json",
      ].map((ext) => base + ext),
      ...["index.ts", "index.tsx", "index.js", "index.jsx", "__init__.py", "mod.rs"].map((name) =>
        path.posix.join(base, name)
      ),
      ...["index.ts", "index.tsx", "index.js", "index.jsx", "__init__.py", "mod.rs"].map((name) =>
        path.posix.join(noExt, name)
      )
    );
  } else {
    // Non-relative import that might resolve to a project file (Python `from utils.helpers ...`, Go `app/pkg ...`)
    const asPath = specifier.replace(/\./g, "/");
    candidates.push(
      asPath + ".py",
      path.posix.join(asPath, "__init__.py"),
      asPath + ".ts",
      asPath + ".js",
      asPath + ".go",
      asPath + ".rs"
    );
    candidates.push(
      path.posix.join("src", asPath + ".py"),
      path.posix.join("src", asPath + ".ts"),
      path.posix.join("src", asPath + ".js")
    );
  }

  return candidates.find((candidate) => knownFiles.has(candidate)) ?? null;
}

function packageName(specifier: string): string {
  if (specifier.startsWith("@")) return specifier.split("/").slice(0, 2).join("/");
  if (specifier.includes("/")) return specifier.split("/")[0] ?? specifier;
  if (specifier.includes(".")) return specifier.split(".")[0] ?? specifier;
  return specifier;
}

export async function mapArchitecture(inputPath: string): Promise<ArchitectureMap> {
  const root = path.resolve(inputPath);
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const sourceFiles = entries
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const parentPath = (entry as { parentPath?: string }).parentPath ?? root;
      return path.relative(root, path.join(parentPath, entry.name)).split(path.sep).join("/");
    });
  const eligibleSourceFiles = sourceFiles.filter(
    (file) =>
      SOURCE_EXTENSIONS.has(path.extname(file)) &&
      !file.split("/").some((part) => part.startsWith(".") || isExcludedScanDirectory(part))
  );
  const filtered = eligibleSourceFiles.slice(0, 3000);
  const knownFiles = new Set(filtered);
  const nodes: ArchitectureNode[] = [];
  const edges: ArchitectureEdge[] = [];
  const external = new Map<string, Set<string>>();
  const warnings: string[] = [];

  for (const file of filtered) {
    let content: string;
    try {
      content = await readFile(path.join(root, file), "utf8");
    } catch {
      warnings.push(`Could not read ${file}; it was skipped.`);
      continue;
    }
    const imports = extractImports(file, content);
    nodes.push({ file, imports, lines: content.split(/\r?\n/).length, role: roleFor(file) });

    for (const specifier of imports) {
      const internal = resolveInternal(file, specifier, knownFiles);
      if (internal) {
        edges.push({ from: file, to: internal, kind: "internal" });
      } else if (!specifier.startsWith(".")) {
        const name = packageName(specifier);
        if (!external.has(name)) external.set(name, new Set());
        external.get(name)?.add(file);
      }
    }
  }

  if (eligibleSourceFiles.length > filtered.length)
    warnings.push("Architecture scan was limited to 3,000 source files.");
  const importedInternally = new Set(edges.map((edge) => edge.to));
  const entryPoints = nodes
    .filter((node) => node.role === "entry" || !importedInternally.has(node.file))
    .map((node) => node.file)
    .sort();

  return {
    root,
    generatedAt: new Date().toISOString(),
    scannedFiles: nodes.length,
    nodes: nodes.sort((a, b) => a.file.localeCompare(b.file)),
    edges: edges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)),
    entryPoints,
    externalPackages: [...external.entries()]
      .map(([name, files]) => ({ name, importedBy: files.size }))
      .sort((a, b) => b.importedBy - a.importedBy || a.name.localeCompare(b.name)),
    warnings,
  };
}

export function formatArchitectureMap(map: ArchitectureMap): string {
  const lines = [
    "# ANVIL Architecture Map",
    "",
    `- **Project:** \`${map.root}\``,
    `- **Source files mapped:** ${map.scannedFiles}`,
    `- **Internal import relationships:** ${map.edges.length}`,
    `- **Generated:** ${map.generatedAt}`,
    "",
    "## Entry points",
    ...(map.entryPoints.length ? map.entryPoints.map((file) => `- \`${file}\``) : ["- None confidently identified."]),
    "",
    "## Module graph",
    ...(map.edges.length
      ? map.edges.map((edge) => `- \`${edge.from}\` → \`${edge.to}\``)
      : ["- No relative import links detected."]),
    "",
    "## External packages",
    ...(map.externalPackages.length
      ? map.externalPackages.map((item) => `- \`${item.name}\` (imported by ${item.importedBy} file(s))`)
      : ["- None detected."]),
    "",
    "## Files",
    ...map.nodes.map(
      (node) => `- \`${node.file}\` — ${node.role}, ${node.lines} lines, ${node.imports.length} imports`
    ),
    "",
    "## Limitations",
    "- This is a static, heuristic import map, not a complete compiler-level dependency graph.",
    "- Dynamic imports assembled from variables, path aliases, and generated modules may not resolve.",
    ...(map.warnings.length ? map.warnings.map((warning) => `- ${warning}`) : ["- No scan warnings."]),
  ];
  return lines.join("\n");
}
