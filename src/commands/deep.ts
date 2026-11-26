import path from "node:path";
import { analyzeCodebase, formatCodebaseAnalysis } from "../core/code-intelligence.js";
import { buildSymbolCallGraph, formatCallGraph, querySymbolCallGraph } from "../core/call-graph.js";

export async function runDeep(_command: string, rest: string[]): Promise<void> {
  if (rest.includes("--help") || rest.includes("-h")) {
    process.stdout.write(`Usage: anvil deep [path] [--call-graph] [--symbol NAME] [--depth N] [--mermaid] [--json]\n`);
    return;
  }

  const json = rest.includes("--json");
  const withCallGraph = rest.includes("--call-graph") || rest.includes("--mermaid");
  const symIdx = rest.indexOf("--symbol");
  const symbol = symIdx >= 0 && rest[symIdx + 1] && !rest[symIdx + 1]!.startsWith("--") ? rest[symIdx + 1] : undefined;
  const depthIdx = rest.indexOf("--depth");
  const depth =
    depthIdx >= 0 && rest[depthIdx + 1] ? Math.max(1, Math.min(5, Math.floor(Number(rest[depthIdx + 1]) || 2))) : 2;
  const mermaid = rest.includes("--mermaid");

  const target = path.resolve(
    rest.find((arg, i) => !arg.startsWith("--") && i !== symIdx + 1 && i !== depthIdx + 1) ?? "."
  );

  try {
    const [report, callGraph] = await Promise.all([
      analyzeCodebase(target),
      withCallGraph || symbol ? buildSymbolCallGraph(target) : Promise.resolve(undefined),
    ]);

    if (json) {
      const payload = callGraph
        ? { ...report, callGraph, ...(symbol ? { trace: querySymbolCallGraph(callGraph, symbol, depth) } : {}) }
        : report;
      process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
      return;
    }

    process.stdout.write(formatCodebaseAnalysis(report) + "\n");
    if (callGraph) {
      process.stdout.write(formatCallGraph(callGraph, { symbol, depth, mermaid }) + "\n");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`ANVIL deep analysis failed: ${message}\n`);
    process.exitCode = 1;
  }
}
