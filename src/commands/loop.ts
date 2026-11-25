import path from "node:path";
import { formatLoop, listLoops, readLoop, runVerifiedLoop, type LoopAgent } from "../core/verified-loop.js";
import { findPositionalArgs } from "./shared.js";

const VALUE_FLAGS = new Set(["--goal", "--checks", "--check", "--agent", "--max-iterations", "--path"]);

export async function runLoopCommand(_command: string, args: string[]): Promise<void> {
  const first = args[0];
  const hasSubcommand = first !== undefined && ["list", "show", "run", "start", "help"].includes(first);
  const action = hasSubcommand ? first : "run";
  const rest = hasSubcommand ? args.slice(1) : args;

  if (action === "help" || args.includes("--help") || args.includes("-h")) {
    process.stdout.write(
      "Usage: anvil loop [run|start|list|show] [path] [--goal TEXT] [--checks CMD[,CMD...]] [--check CMD] [--agent claude|codex|gemini|opencode] [--max-iterations N] [--dry-run] [--json]\n"
    );
    return;
  }

  const isJson = rest.includes("--json");
  const positional = findPositionalArgs(rest, VALUE_FLAGS);
  const pathIdx = rest.indexOf("--path");
  const projectPath = path.resolve(
    pathIdx !== -1 && rest[pathIdx + 1]
      ? rest[pathIdx + 1]!
      : ((action === "show" ? positional[1] : positional[0]) ?? ".")
  );

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
    const id = positional[0];
    if (!id) throw new Error("Usage: anvil loop show <LOOP_ID> [--path PROJECT]");
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
  const checkFlags: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    if ((rest[i] === "--checks" || rest[i] === "--check") && typeof rest[i + 1] === "string") {
      checkFlags.push(
        ...rest[i + 1]!.split(",")
          .map((c) => c.trim())
          .filter(Boolean)
      );
    }
  }
  const checks = checkFlags.length ? checkFlags : ["npm test"];
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
