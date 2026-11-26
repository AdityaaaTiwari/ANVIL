import { readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { mapArchitecture, resolveInternal } from "./architecture-map.js";

export type CallGraphSymbolKind = "function" | "arrow-function" | "method" | "class" | "module";

export interface CallGraphNode {
  id: string;
  file: string;
  name: string;
  kind: CallGraphSymbolKind;
  exported: boolean;
  line: number;
  endLine: number;
  inDegree: number;
  outDegree: number;
}

export interface CallGraphEdge {
  from: string;
  to: string;
  fromFile: string;
  toFile: string;
  callerName: string;
  calleeName: string;
  line: number;
  kind: "local" | "cross-file";
}

export interface CallGraphTrace {
  matches: CallGraphNode[];
  callers: Array<{ depth: number; edge: CallGraphEdge; node?: CallGraphNode | undefined }>;
  callees: Array<{ depth: number; edge: CallGraphEdge; node?: CallGraphNode | undefined }>;
}

export interface SymbolCallGraphReport {
  schemaVersion: 1;
  root: string;
  generatedAt: string;
  summary: {
    totalFiles: number;
    totalSymbols: number;
    exportedSymbols: number;
    totalEdges: number;
    crossFileEdges: number;
    localEdges: number;
  };
  topCalledSymbols: Array<{ id: string; file: string; name: string; inDegree: number; outDegree: number }>;
  orphanExportedSymbols: Array<{ id: string; file: string; name: string; line: number }>;
  nodes: CallGraphNode[];
  edges: CallGraphEdge[];
  warnings: string[];
}

interface ParsedFileSymbols {
  file: string;
  source: ts.SourceFile;
  nodes: CallGraphNode[];
  byName: Map<string, CallGraphNode>;
  defaultExportName?: string | undefined;
  namedImports: Map<string, { targetFile: string; importedName: string }>;
  namespaceImports: Map<string, string>;
}

const TS_JS_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

function hasExportModifier(node: ts.Node): boolean {
  return Boolean(
    ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  );
}

function hasDefaultModifier(node: ts.Node): boolean {
  return Boolean(
    ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
  );
}

function lineNumber(source: ts.SourceFile, pos: number): number {
  return source.getLineAndCharacterOfPosition(pos).line + 1;
}

function collectFileSymbols(
  file: string,
  text: string
): {
  source: ts.SourceFile;
  nodes: CallGraphNode[];
  byName: Map<string, CallGraphNode>;
  defaultExportName?: string;
} {
  const kind = file.endsWith(".tsx") || file.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const nodes: CallGraphNode[] = [];
  const byName = new Map<string, CallGraphNode>();
  let defaultExportName: string | undefined;

  const pushNode = (name: string, symKind: CallGraphSymbolKind, exported: boolean, astNode: ts.Node) => {
    const id = `${file}#${name}`;
    if (byName.has(name)) return;
    const node: CallGraphNode = {
      id,
      file,
      name,
      kind: symKind,
      exported,
      line: lineNumber(source, astNode.getStart(source)),
      endLine: lineNumber(source, astNode.getEnd()),
      inDegree: 0,
      outDegree: 0,
    };
    nodes.push(node);
    byName.set(name, node);
  };

  for (const stmt of source.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      const name = stmt.name.text;
      const exported = hasExportModifier(stmt);
      if (hasDefaultModifier(stmt)) defaultExportName = name;
      pushNode(name, "function", exported, stmt);
    } else if (ts.isClassDeclaration(stmt) && stmt.name) {
      const className = stmt.name.text;
      const exported = hasExportModifier(stmt);
      if (hasDefaultModifier(stmt)) defaultExportName = className;
      pushNode(className, "class", exported, stmt);
      for (const member of stmt.members) {
        if (ts.isMethodDeclaration(member) && member.name && ts.isIdentifier(member.name)) {
          pushNode(`${className}.${member.name.text}`, "method", exported, member);
        }
      }
    } else if (ts.isVariableStatement(stmt)) {
      const exported = hasExportModifier(stmt);
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
        if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
          pushNode(
            decl.name.text,
            ts.isArrowFunction(decl.initializer) ? "arrow-function" : "function",
            exported,
            decl
          );
        }
      }
    } else if (ts.isExportAssignment(stmt) && ts.isIdentifier(stmt.expression)) {
      defaultExportName = stmt.expression.text;
    }
  }

  return { source, nodes, byName, ...(defaultExportName ? { defaultExportName } : {}) };
}

function collectImports(
  file: string,
  source: ts.SourceFile,
  knownFiles: Set<string>
): {
  namedImports: Map<string, { targetFile: string; importedName: string }>;
  namespaceImports: Map<string, string>;
} {
  const namedImports = new Map<string, { targetFile: string; importedName: string }>();
  const namespaceImports = new Map<string, string>();

  for (const stmt of source.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const targetFile = resolveInternal(file, stmt.moduleSpecifier.text, knownFiles);
    if (!targetFile) continue;
    const clause = stmt.importClause;
    if (!clause) continue;

    if (clause.name) {
      namedImports.set(clause.name.text, { targetFile, importedName: "default" });
    }
    if (clause.namedBindings) {
      if (ts.isNamespaceImport(clause.namedBindings)) {
        namespaceImports.set(clause.namedBindings.name.text, targetFile);
      } else if (ts.isNamedImports(clause.namedBindings)) {
        for (const el of clause.namedBindings.elements) {
          const importedName = (el.propertyName ?? el.name).text;
          namedImports.set(el.name.text, { targetFile, importedName });
        }
      }
    }
  }

  return { namedImports, namespaceImports };
}

function resolveTargetNode(
  parsedByFile: Map<string, ParsedFileSymbols>,
  targetFile: string,
  targetName: string
): CallGraphNode | undefined {
  const target = parsedByFile.get(targetFile);
  if (!target) return undefined;
  if (targetName === "default" && target.defaultExportName) {
    return target.byName.get(target.defaultExportName);
  }
  return target.byName.get(targetName);
}

/**
 * Builds a deterministic symbol-level call graph across TypeScript/JavaScript source files
 * using the TypeScript AST compiler (zero external dependencies, zero network calls).
 */
export async function buildSymbolCallGraph(
  inputPath: string,
  options: { includeTests?: boolean } = {}
): Promise<SymbolCallGraphReport> {
  const root = path.resolve(inputPath);
  const architecture = await mapArchitecture(root);
  const knownFiles = new Set(architecture.nodes.map((n) => n.file));
  const warnings = [...architecture.warnings];

  const sourceNodes = architecture.nodes.filter((n) => {
    const ext = path.extname(n.file).toLowerCase();
    if (!TS_JS_EXTENSIONS.has(ext)) return false;
    if (!options.includeTests && n.role === "test") return false;
    return true;
  });

  const parsedByFile = new Map<string, ParsedFileSymbols>();
  const allNodes: CallGraphNode[] = [];

  for (const node of sourceNodes) {
    try {
      const text = await readFile(path.join(root, node.file), "utf8");
      const info = collectFileSymbols(node.file, text);
      const imports = collectImports(node.file, info.source, knownFiles);
      parsedByFile.set(node.file, {
        file: node.file,
        source: info.source,
        nodes: info.nodes,
        byName: info.byName,
        defaultExportName: info.defaultExportName,
        ...imports,
      });
      allNodes.push(...info.nodes);
    } catch {
      warnings.push(`Call-graph parser skipped ${node.file}.`);
    }
  }

  const nodeById = new Map<string, CallGraphNode>(allNodes.map((n) => [n.id, n]));
  const edges: CallGraphEdge[] = [];
  const edgeDedup = new Set<string>();

  const recordEdge = (fromNode: CallGraphNode, toNode: CallGraphNode, line: number, kind: "local" | "cross-file") => {
    if (fromNode.id === toNode.id) return;
    const dedupKey = `${fromNode.id}->${toNode.id}@${line}`;
    if (edgeDedup.has(dedupKey)) return;
    edgeDedup.add(dedupKey);
    edges.push({
      from: fromNode.id,
      to: toNode.id,
      fromFile: fromNode.file,
      toFile: toNode.file,
      callerName: fromNode.name,
      calleeName: toNode.name,
      line,
      kind,
    });
  };

  for (const parsed of parsedByFile.values()) {
    const ensureModuleNode = (astLine: number): CallGraphNode => {
      const modId = `${parsed.file}#<module>`;
      let existing = nodeById.get(modId);
      if (!existing) {
        existing = {
          id: modId,
          file: parsed.file,
          name: "<module>",
          kind: "module",
          exported: false,
          line: astLine,
          endLine: astLine,
          inDegree: 0,
          outDegree: 0,
        };
        nodeById.set(modId, existing);
        allNodes.push(existing);
      }
      return existing;
    };

    const localInstances = new Map<string, string>();

    const resolveCallee = (expr: ts.LeftHandSideExpression, enclosingClass?: string): CallGraphNode | undefined => {
      if (ts.isIdentifier(expr)) {
        const localTarget = parsed.byName.get(expr.text);
        if (localTarget) return localTarget;
        const imported = parsed.namedImports.get(expr.text);
        if (imported) return resolveTargetNode(parsedByFile, imported.targetFile, imported.importedName);
        return undefined;
      }

      if (ts.isPropertyAccessExpression(expr)) {
        const memberName = expr.name.text;
        if (expr.expression.kind === ts.SyntaxKind.ThisKeyword && enclosingClass) {
          return parsed.byName.get(`${enclosingClass}.${memberName}`);
        }
        if (ts.isIdentifier(expr.expression)) {
          const baseName = expr.expression.text;
          const nsFile = parsed.namespaceImports.get(baseName);
          if (nsFile) {
            return resolveTargetNode(parsedByFile, nsFile, memberName);
          }
          const importedClass = parsed.namedImports.get(baseName);
          if (importedClass) {
            return resolveTargetNode(
              parsedByFile,
              importedClass.targetFile,
              `${importedClass.importedName}.${memberName}`
            );
          }
          const instClass = localInstances.get(baseName);
          if (instClass) {
            const localMethod = parsed.byName.get(`${instClass}.${memberName}`);
            if (localMethod) return localMethod;
            const importedInstClass = parsed.namedImports.get(instClass);
            if (importedInstClass) {
              return resolveTargetNode(
                parsedByFile,
                importedInstClass.targetFile,
                `${importedInstClass.importedName}.${memberName}`
              );
            }
          }
          const localClassMethod = parsed.byName.get(`${baseName}.${memberName}`);
          if (localClassMethod) return localClassMethod;
        }
      }
      return undefined;
    };

    const scanBody = (node: ts.Node, callerNode: CallGraphNode | undefined, enclosingClass?: string): void => {
      let nextCaller = callerNode;
      let nextClass = enclosingClass;

      if (ts.isFunctionDeclaration(node) && node.name) {
        nextCaller = parsed.byName.get(node.name.text) ?? callerNode;
      } else if (ts.isClassDeclaration(node) && node.name) {
        nextClass = node.name.text;
        nextCaller = parsed.byName.get(nextClass) ?? callerNode;
      } else if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name) && enclosingClass) {
        nextCaller = parsed.byName.get(`${enclosingClass}.${node.name.text}`) ?? callerNode;
      } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) {
          nextCaller = parsed.byName.get(node.name.text) ?? callerNode;
        } else if (ts.isNewExpression(node.initializer) && ts.isIdentifier(node.initializer.expression)) {
          localInstances.set(node.name.text, node.initializer.expression.text);
        }
      }

      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const target = resolveCallee(node.expression, nextClass);
        if (target) {
          const callLine = lineNumber(parsed.source, node.getStart(parsed.source));
          const activeCaller = nextCaller ?? ensureModuleNode(callLine);
          recordEdge(activeCaller, target, callLine, activeCaller.file === target.file ? "local" : "cross-file");
        }
      }

      ts.forEachChild(node, (child) => scanBody(child, nextCaller, nextClass));
    };

    for (const stmt of parsed.source.statements) {
      scanBody(stmt, undefined, undefined);
    }
  }

  for (const edge of edges) {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (from) from.outDegree++;
    if (to) to.inDegree++;
  }

  allNodes.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  edges.sort((a, b) => a.fromFile.localeCompare(b.fromFile) || a.line - b.line || a.to.localeCompare(b.to));

  const crossFileEdges = edges.filter((e) => e.kind === "cross-file").length;
  const topCalledSymbols = [...allNodes]
    .filter((n) => n.inDegree > 0)
    .sort((a, b) => b.inDegree - a.inDegree || a.id.localeCompare(b.id))
    .slice(0, 15)
    .map((n) => ({ id: n.id, file: n.file, name: n.name, inDegree: n.inDegree, outDegree: n.outDegree }));

  const orphanExportedSymbols = allNodes
    .filter((n) => n.exported && n.inDegree === 0 && n.kind !== "module")
    .slice(0, 30)
    .map((n) => ({ id: n.id, file: n.file, name: n.name, line: n.line }));

  return {
    schemaVersion: 1,
    root,
    generatedAt: new Date().toISOString(),
    summary: {
      totalFiles: parsedByFile.size,
      totalSymbols: allNodes.length,
      exportedSymbols: allNodes.filter((n) => n.exported).length,
      totalEdges: edges.length,
      crossFileEdges,
      localEdges: edges.length - crossFileEdges,
    },
    topCalledSymbols,
    orphanExportedSymbols,
    nodes: allNodes,
    edges,
    warnings,
  };
}

/**
 * Queries upstream callers and downstream callees around matching symbols up to `maxDepth` hops.
 */
export function querySymbolCallGraph(report: SymbolCallGraphReport, symbolQuery: string, maxDepth = 2): CallGraphTrace {
  const depthCap = Math.max(1, Math.min(5, Math.floor(maxDepth)));
  const clean = symbolQuery.trim().toLowerCase();
  const matches = report.nodes.filter(
    (n) =>
      n.id.toLowerCase() === clean ||
      n.name.toLowerCase() === clean ||
      (clean.length >= 3 && n.name.toLowerCase().includes(clean))
  );

  const nodeMap = new Map(report.nodes.map((n) => [n.id, n]));
  const callers: CallGraphTrace["callers"] = [];
  const callees: CallGraphTrace["callees"] = [];
  const seenUp = new Set<string>(matches.map((m) => m.id));
  const seenDown = new Set<string>(matches.map((m) => m.id));

  let upFrontier = matches.map((m) => m.id);
  for (let d = 1; d <= depthCap && upFrontier.length > 0; d++) {
    const nextFrontier: string[] = [];
    for (const targetId of upFrontier) {
      for (const edge of report.edges) {
        if (edge.to === targetId) {
          callers.push({ depth: d, edge, node: nodeMap.get(edge.from) });
          if (!seenUp.has(edge.from)) {
            seenUp.add(edge.from);
            nextFrontier.push(edge.from);
          }
        }
      }
    }
    upFrontier = nextFrontier;
  }

  let downFrontier = matches.map((m) => m.id);
  for (let d = 1; d <= depthCap && downFrontier.length > 0; d++) {
    const nextFrontier: string[] = [];
    for (const sourceId of downFrontier) {
      for (const edge of report.edges) {
        if (edge.from === sourceId) {
          callees.push({ depth: d, edge, node: nodeMap.get(edge.to) });
          if (!seenDown.has(edge.to)) {
            seenDown.add(edge.to);
            nextFrontier.push(edge.to);
          }
        }
      }
    }
    downFrontier = nextFrontier;
  }

  return { matches: matches.slice(0, 15), callers: callers.slice(0, 60), callees: callees.slice(0, 60) };
}

export function formatCallGraph(
  report: SymbolCallGraphReport,
  options: { symbol?: string | undefined; depth?: number | undefined; mermaid?: boolean | undefined } = {}
): string {
  if (options.mermaid) {
    const trace = options.symbol ? querySymbolCallGraph(report, options.symbol, options.depth ?? 2) : null;
    const edges = trace
      ? [...trace.callers.map((c) => c.edge), ...trace.callees.map((c) => c.edge)]
      : report.edges.filter((e) => e.kind === "cross-file").slice(0, 40);
    const idMap = new Map<string, string>();
    const safeId = (full: string) => {
      if (!idMap.has(full)) idMap.set(full, `n${idMap.size + 1}`);
      return idMap.get(full)!;
    };
    const label = (full: string) => {
      const [file, sym] = full.split("#");
      return `${sym ?? full} (${path.posix.basename(file ?? "")})`.replace(/"/g, "'");
    };
    const lines = ["flowchart LR"];
    const emitted = new Set<string>();
    for (const edge of edges.slice(0, 40)) {
      const a = safeId(edge.from);
      const b = safeId(edge.to);
      const key = `${a}->${b}`;
      if (emitted.has(key)) continue;
      emitted.add(key);
      lines.push(`  ${a}["${label(edge.from)}"] --> ${b}["${label(edge.to)}"]`);
    }
    return lines.join("\n");
  }

  const lines = [
    ``,
    `# ANVIL Symbol Call-Graph`,
    `Root: ${report.root}`,
    `Files Analyzed: ${report.summary.totalFiles} | Symbols: ${report.summary.totalSymbols} (${report.summary.exportedSymbols} exported)`,
    `Call Edges: ${report.summary.totalEdges} (${report.summary.crossFileEdges} cross-file, ${report.summary.localEdges} local)`,
  ];

  if (options.symbol) {
    const trace = querySymbolCallGraph(report, options.symbol, options.depth ?? 2);
    lines.push(``, `Symbol Trace for '${options.symbol}' (${trace.matches.length} match(es)):`);
    if (trace.callers.length > 0) {
      lines.push(`  Upstream Callers (${trace.callers.length}):`);
      for (const item of trace.callers.slice(0, 20)) {
        lines.push(
          `    [hop ${item.depth}] ${item.edge.from} -> ${item.edge.to} (${item.edge.fromFile}:${item.edge.line})`
        );
      }
    } else {
      lines.push(`  Upstream Callers: none detected.`);
    }
    if (trace.callees.length > 0) {
      lines.push(`  Downstream Callees (${trace.callees.length}):`);
      for (const item of trace.callees.slice(0, 20)) {
        lines.push(
          `    [hop ${item.depth}] ${item.edge.from} -> ${item.edge.to} (${item.edge.fromFile}:${item.edge.line})`
        );
      }
    } else {
      lines.push(`  Downstream Callees: none detected.`);
    }
    return lines.join("\n");
  }

  if (report.topCalledSymbols.length > 0) {
    lines.push(``, `Most Referenced Symbols (Fan-In):`);
    for (const sym of report.topCalledSymbols) {
      lines.push(`  - ${sym.name} (${sym.file}) — called by ${sym.inDegree}, calls ${sym.outDegree}`);
    }
  }
  return lines.join("\n");
}
