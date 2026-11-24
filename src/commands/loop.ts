import path from "node:path";
import { formatLoop, listLoops, readLoop, runVerifiedLoop, type LoopAgent } from "../core/verified-loop.js";

export async function runLoopCommand(_command: string, args: string[]): Promise<void> {
  const [action = "run", ...rest] = args;
  if (action === "help" || action === "--help") {
    process.stdout.write("Usage: anvil loop [run|list|show] [--agent claude|codex] [--prompt TEXT] [options]\n");
    return;
  }
  const projectPath = path.resolve(rest.find((a) => !a.startsWith("-")) ?? ".");
  const isJson = rest.includes("--json");

  if (action === "list") {
    const loops = await listLoops(projectPath);
    if (isJson) {
      process.stdout.write(JSON.stringify(loops, null, 2) + "\n");
    } else {
      process.stdout.write(`Found ${loops.length} loop(s).\n`);
      for (const l of loops) process.stdout.write(`  ${l.id}  status: ${l.status}\n`);
    }
    return;
  }

  if (action === "show") {
    const id = rest[0];
    if (!id) throw new Error("Usage: anvil loop show <LOOP_ID>");
    const loop = await readLoop(projectPath, id);
    if (!loop) throw new Error(`Loop ${id} not found.`);
    if (isJson) {
      process.stdout.write(JSON.stringify(loop, null, 2) + "\n");
    } else {
      process.stdout.write(formatLoop(loop) + "\n");
    }
    return;
  }

  const goalIdx = rest.indexOf("--goal");
  const goal = goalIdx !== -1 ? rest[goalIdx + 1] : "Verify and repair code";
  const checksIdx = rest.indexOf("--checks");
  const checks =
    checksIdx !== -1 && typeof rest[checksIdx + 1] === "string"
      ? (rest[checksIdx + 1] as string).split(",")
      : ["npm test"];
  const agentIdx = rest.indexOf("--agent");
  const agent = agentIdx !== -1 ? (rest[agentIdx + 1] as LoopAgent) : "claude";
  const maxItersIdx = rest.indexOf("--max-iterations");
  const maxIterations = maxItersIdx !== -1 ? Number(rest[maxItersIdx + 1]) : 5;

  const result = await runVerifiedLoop({
    projectPath,
    agent,
    goal: goal ?? "Verify and repair code",
    checks,
    maxIterations,
    dryRun: rest.includes("--dry-run"),
  });

  if (isJson) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(formatLoop(result) + "\n");
  }
}
