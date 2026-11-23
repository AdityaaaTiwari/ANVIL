import os from "node:os";
import path from "node:path";
import { resolveMcpServerScript } from "../core/mcp-setup.js";
import {
  applyHarnessPlan,
  formatHarnessPlan,
  HARNESS_LABELS,
  HARNESS_TARGETS,
  parseTargets,
  planHarnessInstall,
  type ServerMode,
} from "../core/harness-installer.js";

const USAGE = `Usage: anvil install [path] [options]
       anvil uninstall [path] [options]

Connect ANVIL to your AI coding tools in one step: registers the ANVIL MCP
server in each tool's config and adds an ANVIL section to AGENTS.md
(plus CLAUDE.md / GEMINI.md for those tools).

Options:
  --target LIST      Comma-separated tools, or "all" (default).
                     ${HARNESS_TARGETS.join(", ")}
                     "all" covers every tool except claude-desktop.
  --server MODE      How tools start ANVIL:
                       npx     npx -y anvil-engineering-workbench mcp start (default, nothing to install)
                       global  anvil mcp start (after npm install -g anvil-engineering-workbench)
                       local   node <this checkout>/dist/mcp/server.js
  --no-instructions  Do not touch AGENTS.md / CLAUDE.md / GEMINI.md.
  --dry-run          Show what would change without writing anything.
  --json             Print the plan as JSON.

Project files (.mcp.json, .cursor/, .vscode/, .agents/, .gemini/, opencode.json)
are written in [path]. Codex, Windsurf and Claude Desktop use a config file in
your home directory. Existing settings are kept; only the "anvil" entry changes.

Tools:
${HARNESS_TARGETS.map((t) => `  ${t.padEnd(15)} ${HARNESS_LABELS[t]}`).join("\n")}`;

export async function runInstall(command: string, rest: string[]): Promise<void> {
  if (rest.includes("--help") || rest.includes("-h")) {
    process.stdout.write(USAGE + "\n");
    return;
  }
  const remove = command === "uninstall";
  const option = (name: string) => {
    const index = rest.indexOf(name);
    return index >= 0 ? rest[index + 1] : undefined;
  };
  const valueFlags = new Set(["--target", "--server"]);
  const positional = rest.filter((arg, i) => !arg.startsWith("--") && !valueFlags.has(rest[i - 1] ?? ""));
  const project = path.resolve(positional[0] ?? ".");
  const dryRun = rest.includes("--dry-run");
  const json = rest.includes("--json");
  try {
    const server = (option("--server") ?? "npx") as ServerMode;
    if (!["npx", "global", "local"].includes(server))
      throw new Error(`--server must be npx, global or local (got "${server}").`);
    const targets = parseTargets(option("--target"));
    const plans = await planHarnessInstall(
      {
        projectPath: project,
        targets,
        server,
        localServerScript: resolveMcpServerScript(),
        instructions: !rest.includes("--no-instructions"),
        ...(process.env.APPDATA ? { appData: process.env.APPDATA } : {}),
      },
      remove
    );
    if (!dryRun) await applyHarnessPlan(plans);
    if (json) {
      process.stdout.write(
        JSON.stringify(
          { project, dryRun, remove, plans: plans.map(({ content: _content, ...plan }) => plan) },
          null,
          2
        ) + "\n"
      );
      return;
    }
    const title = remove ? "Removing ANVIL from AI tools" : "Connecting ANVIL to AI tools";
    process.stdout.write(`${title}${dryRun ? " (dry run, nothing written)" : ""}\nProject: ${project}\n\n`);
    process.stdout.write(formatHarnessPlan(plans, project, os.homedir(), dryRun) + "\n\n");
    if (plans.some((plan) => plan.action === "skip")) process.exitCode = 1;
    if (remove || dryRun) return;
    process.stdout.write(
      [
        "Next steps:",
        "  1. Restart (or reload) your AI tools so they pick up the new MCP server.",
        '  2. Ask your agent: "Use the ANVIL tools to map this project\'s architecture."',
        "  3. Before merging, run: anvil gate .",
        "",
        "Configs for Antigravity, Windsurf and Claude Desktop contain this project's",
        "absolute path; keep .agents/mcp_config.json out of git if others share the repo.",
        "",
      ].join("\n")
    );
  } catch (error) {
    process.stderr.write(
      `ANVIL could not ${remove ? "uninstall" : "install"}: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  }
}
