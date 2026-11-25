import os from "node:os";
import path from "node:path";
import { resolveMcpServerScript } from "../core/mcp-setup.js";
import { HARNESS_CAPABILITIES } from "../core/harness-capabilities.js";
import {
  applyHarnessPlan,
  formatHarnessPlan,
  formatInstallResult,
  HARNESS_LABELS,
  HARNESS_TARGETS,
  installHarness,
  loadInstallState,
  parseProfile,
  parseTargets,
  planHarnessInstall,
  type HarnessTarget,
  type ServerMode,
} from "../core/harness-installer.js";
import { findPositionalArgs, resolvePackageVersion } from "./shared.js";

const USAGE = `Usage: anvil install [path] [options]
       anvil repair [path] [options]
       anvil uninstall [path] [options]

Connect ANVIL to your AI coding tools in one step: registers the ANVIL MCP
server in each tool's config, installs agents/skills/commands/rules when
--profile or --with is used, and adds an ANVIL section to AGENTS.md.

Options:
  --target LIST      Comma-separated tools, or "all" (default).
                     ${HARNESS_TARGETS.join(", ")}
                     "all" covers every tool except claude-desktop.
  --profile LEVEL    Install catalog harness pack: minimal | standard | full
  --with LIST        Also install catalog extras (e.g. skill:e2e-testing,agent:architect)
  --server MODE      How tools start ANVIL:
                       npx     npx -y anvil-engineering-workbench mcp start (default, nothing to install)
                       global  anvil mcp start (after npm install -g anvil-engineering-workbench)
                       local   node <this checkout>/dist/mcp/server.js
  --hooks            Also add stop/guard hooks to Claude Code, Cursor, Codex and Gemini
  --statusline       Add ANVIL status line to Claude Code settings (with --hooks)
  --rea              Also register the REA reverse-engineering MCP server (npx -y rea-agents serve)
                     for black-box binary analysis and bundle inspection.
  --force            Overwrite conflicting files during catalog install/repair
  --catalog-only     Only install/repair catalog files (skip MCP config files)
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
  const isRepair = command === "repair";
  const option = (name: string) => {
    const index = rest.indexOf(name);
    return index >= 0 ? rest[index + 1] : undefined;
  };
  const valueFlags = new Set(["--target", "--targets", "--server", "--profile", "--with"]);
  const positional = findPositionalArgs(rest, valueFlags);
  const project = path.resolve(positional[0] ?? ".");
  const dryRun = rest.includes("--dry-run");
  const json = rest.includes("--json");
  const force = rest.includes("--force");
  const catalogOnly = rest.includes("--catalog-only");
  const profileArg = option("--profile");
  const withArg = option("--with");
  const targetArg = option("--target") ?? option("--targets");
  try {
    const server = (option("--server") ?? "npx") as ServerMode;
    if (!["npx", "global", "local"].includes(server))
      throw new Error(`--server must be npx, global or local (got "${server}").`);
    const targets = parseTargets(targetArg);

    if (isRepair || profileArg !== undefined || withArg !== undefined) {
      const prior = await loadInstallState(project).catch(() => undefined);
      const catalogTargets: HarnessTarget[] = targetArg
        ? targets
        : prior?.targets?.length
          ? (prior.targets as HarnessTarget[])
          : HARNESS_CAPABILITIES.map((c) => c.target as HarnessTarget);
      const profile = parseProfile(profileArg ?? prior?.profile);
      const extras = [
        ...(prior?.extras ?? []),
        ...(withArg
          ? withArg
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : []),
      ];
      const harnessResult = await installHarness({
        projectPath: project,
        targets: catalogTargets,
        profile,
        extras,
        hooks: rest.includes("--hooks") || Boolean(prior?.settings) || Boolean(prior?.nativeHooks?.length),
        statusLine: rest.includes("--statusline"),
        hookCommand: "anvil",
        anvilVersion: resolvePackageVersion(),
        dryRun,
        force,
      });

      if (catalogOnly || isRepair) {
        if (json) {
          process.stdout.write(JSON.stringify(harnessResult, null, 2) + "\n");
        } else {
          process.stdout.write(formatInstallResult(harnessResult) + "\n");
        }
        return;
      }
      if (!json) {
        process.stdout.write(formatInstallResult(harnessResult) + "\n\n");
      }
    }

    const plans = await planHarnessInstall(
      {
        projectPath: project,
        targets,
        server,
        localServerScript: resolveMcpServerScript(),
        instructions: !rest.includes("--no-instructions"),
        hooks: rest.includes("--hooks"),
        rea: rest.includes("--rea"),
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
