import { loadAgentRegistry } from "../core/agent-registry.js";
import path from "node:path";

export async function runAgents(_command: string, rest: string[]): Promise<void> {
  const target = rest.find((arg) => !arg.startsWith("--")) ?? ".";
  try {
    const agents = await loadAgentRegistry(path.resolve(target));
    process.stdout.write("ANVIL agent registry\n\n");
    for (const agent of agents) {
      process.stdout.write(`  ${agent.id.padEnd(20)} ${agent.name} [${agent.source}]\n    ${agent.description}\n`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`ANVIL could not load agents: ${message}\n`);
    process.exitCode = 1;
  }
  return;
}
