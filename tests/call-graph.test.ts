import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { safeRm } from "./test-helpers.js";
import { buildSymbolCallGraph, formatCallGraph, querySymbolCallGraph } from "../src/core/call-graph.js";

describe("TypeScript AST Symbol Call-Graph Engine", () => {
  const dirs: string[] = [];

  async function makeProject(): Promise<string> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "anvil-cg-"));
    dirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => safeRm(d)));
  });

  it("extracts functions, arrow functions, classes, and cross-file caller/callee edges", async () => {
    const root = await makeProject();
    await mkdir(path.join(root, "src"), { recursive: true });

    await writeFile(
      path.join(root, "src", "crypto.ts"),
      [
        "export function hashToken(raw: string): string {",
        "  return normalizeHash(raw);",
        "}",
        "function normalizeHash(val: string): string {",
        "  return val.trim();",
        "}",
        "export function unusedExport(): number {",
        "  return 42;",
        "}",
        "export function auditDigest(digest: string): string {",
        "  return digest.slice(0, 8);",
        "}",
      ].join("\n")
    );

    await writeFile(
      path.join(root, "src", "service.ts"),
      [
        'import { auditDigest, hashToken } from "./crypto.js";',
        "export class AuthService {",
        "  authenticate(secret: string): string {",
        "    return this.verify(hashToken(secret));",
        "  }",
        "  verify(digest: string): string {",
        "    return digest;",
        "  }",
        "}",
        "export const runLogin = (secret: string) => {",
        "  const svc = new AuthService();",
        "  return auditDigest(svc.authenticate(secret));",
        "};",
      ].join("\n")
    );

    const graph = await buildSymbolCallGraph(root);
    expect(graph.summary.totalFiles).toBe(2);
    expect(graph.summary.crossFileEdges).toBeGreaterThanOrEqual(2);
    expect(graph.summary.localEdges).toBeGreaterThanOrEqual(2);

    // Cross-file edge from AuthService.authenticate -> crypto.ts#hashToken
    expect(
      graph.edges.some(
        (e) =>
          e.from === "src/service.ts#AuthService.authenticate" &&
          e.to === "src/crypto.ts#hashToken" &&
          e.kind === "cross-file"
      )
    ).toBe(true);

    // `this.verify` local class method edge
    expect(
      graph.edges.some(
        (e) =>
          e.from === "src/service.ts#AuthService.authenticate" &&
          e.to === "src/service.ts#AuthService.verify" &&
          e.kind === "local"
      )
    ).toBe(true);

    // Trace upstream callers of normalizeHash across 2 hops: hashToken -> AuthService.authenticate
    const trace = querySymbolCallGraph(graph, "normalizeHash", 2);
    expect(trace.matches[0]?.id).toBe("src/crypto.ts#normalizeHash");
    expect(trace.callers.some((c) => c.depth === 1 && c.edge.from === "src/crypto.ts#hashToken")).toBe(true);
    expect(trace.callers.some((c) => c.depth === 2 && c.edge.from === "src/service.ts#AuthService.authenticate")).toBe(
      true
    );

    // Orphan exported symbol detection
    expect(graph.orphanExportedSymbols.some((s) => s.id === "src/crypto.ts#unusedExport")).toBe(true);

    // Mermaid & text formatting
    const mermaid = formatCallGraph(graph, { symbol: "hashToken", mermaid: true });
    expect(mermaid).toContain("flowchart LR");
    expect(mermaid).toContain("hashToken");
  });
});
