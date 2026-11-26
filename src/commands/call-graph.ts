import path from "node:path";
import { buildSymbolCallGraph, formatCallGraph, querySymbolCallGraph } from "../core/call-graph.js";

export async function runCallGraph(_command: string, rest: string[]): Promise<void> {
  if (rest.includes("--help") || rest.includes("-h")) {
    process.stdout.write(
      `Usage: anvil call-graph [path] [--symbol NAME] [--depth N] [--include-tests] [--mermaid] [--json]\n` +
        `\n` +
        `Builds a deterministic TypeScript/JavaScript AST symbol call graph.\n` +
        `Traces cross-file caller -> callee edges, upstream callers, downstream callees,\n` +
        `high fan-in hotspots, and orphan exported symbols.\n`
    );
    return;
  }

  const option = (flag: string): string | undefined => {
    const idx = rest.indexOf(flag);
    return idx >= 0 && rest[idx + 1] && !rest[idx + 1]!.startsWith("--") ? rest[idx + 1] : undefined;
  };

  const symbol = option("--symbol");
  const depthRaw = option("--depth");
  const depth = depthRaw ? Math.max(1, Math.min(5, Math.floor(Number(depthRaw) || 2))) : 2;
  const includeTests = rest.includes("--include-tests");
  const mermaid = rest.includes("--mermaid");
  const isJson = rest.includes("--json");

  const targetArg = rest.find(
    (arg, idx) => !arg.startsWith("--") && rest[idx - 1] !== "--symbol" && rest[idx - 1] !== "--depth"
  );
  const target = path.resolve(targetArg ?? ".");

  try {
    const report = await buildSymbolCallGraph(target, { includeTests });
    if (isJson) {
      const payload = symbol ? { ...report, trace: querySymbolCallGraph(report, symbol, depth) } : report;
      process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
      return;
    }
    process.stdout.write(formatCallGraph(report, { symbol, depth, mermaid }) + "\n");
  } catch (error) {
    process.stderr.write(`ANVIL call-graph failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
