import path from "node:path";
import { resolveMcpServerScript, setupHarnessMcp, type McpClientType } from "../core/mcp-setup.js";
import {
  MCP_CATALOG,
  MCP_TARGETS,
  addMcpServers,
  detectMcpTargets,
  formatChanges,
  formatMatrix,
  mcpMatrix,
  readSyncSource,
  removeMcpServers,
  type McpTarget,
} from "../core/mcp-sync.js";
import { findPositionalArgs } from "./shared.js";

function parseMcpTargets(raw: string | undefined): McpTarget[] | undefined {
  if (!raw) return undefined;
  if (raw === "all") return [...MCP_TARGETS];
  const requested = raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  for (const item of requested) {
    if (!MCP_TARGETS.includes(item as McpTarget)) {
      throw new Error(`Unknown MCP target "${item}". Supported: ${MCP_TARGETS.join(", ")}, all.`);
    }
  }
  return requested as McpTarget[];
}

export async function runMcp(_command: string, rest: string[]): Promise<void> {
  const [subcommand = "info", ...mcpArgs] = rest;
  const option = (name: string) => {
    const index = mcpArgs.indexOf(name);
    return index >= 0 ? mcpArgs[index + 1] : undefined;
  };
  const valueFlags = new Set(["--client", "--target", "--targets", "--from", "--path"]);
  const positional = findPositionalArgs(mcpArgs, valueFlags);
  const pathArg = option("--path") ?? positional[0];
  const target = path.resolve(pathArg ?? ".");
  const isJson = mcpArgs.includes("--json");
  const dryRun = mcpArgs.includes("--dry-run");
  const force = mcpArgs.includes("--force");

  try {
    if (subcommand === "setup") {
      const client = (option("--client") ?? "all") as McpClientType;
      const report = await setupHarnessMcp(target, client);
      process.stdout.write(`\nANVIL Model Context Protocol Harness Setup\n`);
      process.stdout.write(`Project: ${report.projectPath}\n`);
      process.stdout.write(`MCP Server: ${report.serverScriptPath}\n\n`);
      for (const res of report.results) {
        process.stdout.write(`✓ [${res.client.toUpperCase()}]: ${res.details}\n`);
      }
      process.stdout.write(`\nYour AI harness is ready to use ANVIL tools!\n`);
    } else if (subcommand === "catalog") {
      if (isJson) {
        process.stdout.write(JSON.stringify(MCP_CATALOG, null, 2) + "\n");
        return;
      }
      const width = Math.max(...MCP_CATALOG.map((entry) => entry.name.length), 8);
      process.stdout.write("ANVIL pinned MCP catalog:\n\n");
      for (const entry of MCP_CATALOG) {
        process.stdout.write(`  ${entry.name.padEnd(width)}  [${entry.transport}]  ${entry.description}\n`);
      }
      process.stdout.write("\nAdd servers with: anvil mcp add <name...>\n");
    } else if (subcommand === "list" || subcommand === "status" || subcommand === "matrix") {
      const rows = await mcpMatrix(target);
      if (isJson) {
        process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
      } else {
        process.stdout.write(formatMatrix(rows) + "\n");
      }
    } else if (subcommand === "add") {
      const names = findPositionalArgs(mcpArgs, valueFlags).filter(
        (item) => !item.includes("/") && !item.includes("\\")
      );
      if (!names.length) {
        throw new Error(
          `Usage: anvil mcp add <server...> [--targets claude,cursor,...] [--path DIR] [--dry-run] [--force]\nAvailable: ${MCP_CATALOG.map((e) => e.name).join(", ")}`
        );
      }
      const servers = names.map((name) => {
        const entry = MCP_CATALOG.find((item) => item.name === name);
        if (!entry) {
          throw new Error(`Unknown catalog MCP server "${name}". Run \`anvil mcp catalog\` to list available servers.`);
        }
        return entry;
      });
      const projectRoot = path.resolve(option("--path") ?? ".");
      const targets =
        parseMcpTargets(option("--targets") ?? option("--target")) ?? (await detectMcpTargets(projectRoot));
      const changes = await addMcpServers(servers, {
        projectPath: projectRoot,
        targets,
        dryRun,
        force,
        source: "catalog",
      });
      if (isJson) {
        process.stdout.write(JSON.stringify({ project: projectRoot, dryRun, targets, changes }, null, 2) + "\n");
      } else {
        process.stdout.write(
          `ANVIL MCP add${dryRun ? " (dry run)" : ""} → targets: ${targets.join(", ")}\n${formatChanges(changes)}\n`
        );
      }
    } else if (subcommand === "remove") {
      const names = findPositionalArgs(mcpArgs, valueFlags).filter(
        (item) => !item.includes("/") && !item.includes("\\")
      );
      if (!names.length) {
        throw new Error("Usage: anvil mcp remove <server...> [--targets ...] [--path DIR] [--dry-run] [--force]");
      }
      const projectRoot = path.resolve(option("--path") ?? ".");
      const targets =
        parseMcpTargets(option("--targets") ?? option("--target")) ?? (await detectMcpTargets(projectRoot));
      const changes = await removeMcpServers(names, { projectPath: projectRoot, targets, dryRun, force });
      if (isJson) {
        process.stdout.write(JSON.stringify({ project: projectRoot, dryRun, targets, changes }, null, 2) + "\n");
      } else {
        process.stdout.write(`ANVIL MCP remove${dryRun ? " (dry run)" : ""}\n${formatChanges(changes)}\n`);
      }
    } else if (subcommand === "sync") {
      const projectRoot = path.resolve(option("--path") ?? positional[0] ?? ".");
      const from = (option("--from") ?? "claude") as McpTarget;
      if (!MCP_TARGETS.includes(from)) {
        throw new Error(`Unknown source target "${from}". Supported: ${MCP_TARGETS.join(", ")}.`);
      }
      const { servers, problems } = await readSyncSource(projectRoot, from);
      const targets =
        parseMcpTargets(option("--targets") ?? option("--target")) ??
        (await detectMcpTargets(projectRoot)).filter((t) => t !== from);
      const targetList = targets.length ? targets : [...MCP_TARGETS].filter((t) => t !== from);
      const changes = await addMcpServers(servers, {
        projectPath: projectRoot,
        targets: targetList,
        dryRun,
        force,
        source: "sync",
      });
      if (isJson) {
        process.stdout.write(
          JSON.stringify({ project: projectRoot, from, targets: targetList, changes, problems }, null, 2) + "\n"
        );
      } else {
        process.stdout.write(
          `ANVIL MCP sync${dryRun ? " (dry run)" : ""} from ${from} → ${targetList.join(", ")}\n${formatChanges(changes)}\n`
        );
        if (problems.length) {
          process.stdout.write("\nSkipped source entries:\n");
          for (const p of problems) process.stdout.write(`  - ${p.name}: ${p.problem}\n`);
        }
      }
    } else if (subcommand === "server" || subcommand === "start" || subcommand === "run") {
      const { pathToFileURL } = await import("node:url");
      const script = resolveMcpServerScript();
      await import(pathToFileURL(script).href);
    } else if (subcommand === "check" || subcommand === "test" || subcommand === "verify") {
      const { spawnSync } = await import("node:child_process");
      const script = resolveMcpServerScript();
      process.stdout.write(`Checking ANVIL MCP Server at ${script}...\n`);
      const res = spawnSync(process.execPath, [script, "--check"], { encoding: "utf8" });
      if (res.status === 0) {
        process.stdout.write(`✓ ${res.stdout.trim()}\n`);
      } else {
        throw new Error(res.stderr || `Check exited with status ${res.status}`);
      }
    } else {
      const script = resolveMcpServerScript();
      process.stdout.write(`ANVIL Model Context Protocol (MCP) Server & Cross-Harness Sync\n\n`);
      process.stdout.write(`Server entrypoint: ${script}\n\n`);
      process.stdout.write(`Commands:\n`);
      process.stdout.write(
        `  anvil mcp catalog                                             List pinned MCP catalog servers\n` +
          `  anvil mcp list [path]                                         Show MCP server coverage matrix\n` +
          `  anvil mcp add <server...> [--targets ...] [--dry-run]         Add pinned catalog MCP servers\n` +
          `  anvil mcp remove <server...> [--targets ...] [--dry-run]      Remove ANVIL-managed MCP servers\n` +
          `  anvil mcp sync [--from claude] [--targets ...] [--dry-run]    Sync MCP servers across AI tools\n` +
          `  anvil mcp setup [--client cursor|claude|windsurf|vscode|all]  Configure your AI harness (legacy)\n` +
          `  anvil install [--target all|claude|codex|cursor|...]          Connect ANVIL to every AI tool\n`
      );
      process.stdout.write(
        `  anvil mcp check                                               Verify MCP server entrypoint health\n` +
          `  anvil mcp start                                               Run MCP stdio transport\n\n`
      );
    }
  } catch (error) {
    process.stderr.write(
      "ANVIL MCP command failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
