import path from "node:path";
import { resolveMcpServerScript, setupHarnessMcp, type McpClientType } from "../core/mcp-setup.js";

export async function runMcp(_command: string, rest: string[]): Promise<void> {
  const [subcommand = "info", ...mcpArgs] = rest;
  const option = (name: string) => {
    const index = mcpArgs.indexOf(name);
    return index >= 0 ? mcpArgs[index + 1] : undefined;
  };
  const skipValues = new Set<number>();
  for (let i = 0; i < mcpArgs.length; i++) {
    if (mcpArgs[i]?.startsWith("--")) skipValues.add(i + 1);
  }
  const positional = mcpArgs.filter((arg, i) => !arg.startsWith("--") && !skipValues.has(i));
  const target = path.resolve(positional[0] ?? ".");
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
    } else if (subcommand === "server" || subcommand === "start" || subcommand === "run") {
      const { pathToFileURL } = await import("node:url");
      const script = resolveMcpServerScript();
      await import(pathToFileURL(script).href);
    } else {
      const script = resolveMcpServerScript();
      process.stdout.write(`ANVIL Model Context Protocol (MCP) Server\n\n`);
      process.stdout.write(`Server entrypoint: ${script}\n\n`);
      process.stdout.write(`Commands:\n`);
      process.stdout.write(
        `  anvil mcp setup [--client cursor|claude|windsurf|vscode|all]  Configure your AI harness (legacy)\n` +
          `  anvil install [--target all|claude|codex|cursor|...]          Connect ANVIL to every AI tool\n`
      );
      process.stdout.write(
        `  anvil mcp start                                                Run MCP stdio transport\n\n`
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
