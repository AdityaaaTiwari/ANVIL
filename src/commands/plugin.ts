import { syncClaudePlugin } from "../core/claude-plugin.js";
import { parseCommandArgs, reportCommandError } from "./arg-parse.js";
import { resolvePackageVersion } from "./shared.js";

const USAGE = `Usage: anvil plugin build [path] [--check] [--json]

Generate the ANVIL Claude Code plugin (plugin/ and .claude-plugin/marketplace.json)
from catalog/. With --check, change nothing and exit 1 if the committed plugin is stale.

Install the plugin in Claude Code:
  /plugin marketplace add AdityaaaTiwari/ANVIL
  /plugin install anvil@anvil
`;

export async function runPlugin(_command: string, rest: string[]): Promise<void> {
  const [sub, ...args] = rest;
  if (!sub || sub === "--help" || sub === "-h" || sub === "help") {
    process.stdout.write(USAGE);
    return;
  }
  try {
    if (sub !== "build") throw new Error(`Unknown plugin subcommand "${sub}"\n${USAGE}`);
    const options = parseCommandArgs(args, [], ["--check", "--json"]);
    const check = options.flags.has("--check");
    const result = await syncClaudePlugin(options.path, resolvePackageVersion(), { check });
    if (options.flags.has("--json")) {
      process.stdout.write(JSON.stringify({ counts: result.build.counts, drift: result.drift }, null, 2) + "\n");
    } else {
      const { agents, skills, commands, ruleSkills } = result.build.counts;
      const summary = `${agents} agents · ${skills} skills · ${commands} commands · ${ruleSkills} rule skills`;
      if (!result.drift.length) process.stdout.write(`ANVIL plugin is up to date (${summary}).\n`);
      else if (check)
        process.stdout.write(`ANVIL plugin is stale. Run \`anvil plugin build\`:\n  ${result.drift.join("\n  ")}\n`);
      else process.stdout.write(`ANVIL plugin built (${summary}), ${result.drift.length} file(s) updated.\n`);
    }
    if (check && result.drift.length) process.exitCode = 1;
  } catch (error) {
    reportCommandError("plugin", error);
  }
}
