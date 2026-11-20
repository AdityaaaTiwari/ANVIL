import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type McpClientType = "cursor" | "claude" | "windsurf" | "vscode" | "all";

export interface McpClientConfigResult {
  client: string;
  configPath?: string;
  configured: boolean;
  commandSnippet?: string;
  details: string;
}

export interface McpSetupReport {
  projectPath: string;
  serverScriptPath: string;
  results: McpClientConfigResult[];
}

export function resolveMcpServerScript(): string {
  try {
    const currentFile = fileURLToPath(import.meta.url);
    const coreDir = path.dirname(currentFile);
    const distOrSrcDir = path.dirname(coreDir);
    const candidate = path.join(distOrSrcDir, "mcp", "server.js");
    return candidate;
  } catch {
    return path.resolve(process.cwd(), "dist", "mcp", "server.js");
  }
}

async function safelyMergeMcpJson(
  filePath: string,
  serverName: string,
  serverConfig: { command: string; args: string[]; env?: Record<string, string> }
): Promise<void> {
  let existing: Record<string, unknown> = {};
  try {
    const raw = await readFile(filePath, "utf8");
    existing = JSON.parse(raw);
  } catch {
    existing = {};
  }

  const mcpServers = (existing.mcpServers && typeof existing.mcpServers === "object")
    ? (existing.mcpServers as Record<string, unknown>)
    : {};

  mcpServers[serverName] = serverConfig;
  existing.mcpServers = mcpServers;

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(existing, null, 2) + "\n", "utf8");
}

export async function setupCursorMcp(projectPath: string, serverScriptPath: string): Promise<McpClientConfigResult> {
  const resolved = path.resolve(projectPath);
  const configPath = path.join(resolved, ".cursor", "mcp.json");
  const serverConfig = {
    command: "node",
    args: [serverScriptPath],
    env: {
      ANVIL_WORKSPACE: "${workspaceFolder}"
    }
  };
  await safelyMergeMcpJson(configPath, "anvil", serverConfig);
  return {
    client: "cursor",
    configPath,
    configured: true,
    details: `Configured ANVIL MCP server in ${path.relative(resolved, configPath)}`
  };
}

export async function setupVsCodeMcp(projectPath: string, serverScriptPath: string): Promise<McpClientConfigResult> {
  const resolved = path.resolve(projectPath);
  const configPath = path.join(resolved, ".vscode", "mcp.json");
  const serverConfig = {
    command: "node",
    args: [serverScriptPath],
    env: {
      ANVIL_WORKSPACE: "${workspaceFolder}"
    }
  };
  await safelyMergeMcpJson(configPath, "anvil", serverConfig);
  return {
    client: "vscode",
    configPath,
    configured: true,
    details: `Configured ANVIL MCP server in ${path.relative(resolved, configPath)}`
  };
}

export async function setupWindsurfMcp(projectPath: string, serverScriptPath: string): Promise<McpClientConfigResult> {
  const resolved = path.resolve(projectPath);
  const configPath = path.join(resolved, ".windsurf", "mcp_config.json");
  const serverConfig = {
    command: "node",
    args: [serverScriptPath],
    env: {
      ANVIL_WORKSPACE: resolved
    }
  };
  await safelyMergeMcpJson(configPath, "anvil", serverConfig);
  return {
    client: "windsurf",
    configPath,
    configured: true,
    details: `Configured ANVIL MCP server in ${path.relative(resolved, configPath)}`
  };
}

export function getClaudeCodeSnippet(projectPath: string, serverScriptPath: string): string {
  const resolved = path.resolve(projectPath);
  return `claude mcp add --transport stdio anvil --env ANVIL_WORKSPACE="${resolved}" -- node "${serverScriptPath}"`;
}

export async function setupClaudeCodeMcp(projectPath: string, serverScriptPath: string): Promise<McpClientConfigResult> {
  const snippet = getClaudeCodeSnippet(projectPath, serverScriptPath);
  return {
    client: "claude",
    configured: true,
    commandSnippet: snippet,
    details: `Run this command in your terminal to register with Claude Code:\n  ${snippet}`
  };
}

export async function setupHarnessMcp(
  projectPath: string,
  client: McpClientType = "all",
  customServerScript?: string
): Promise<McpSetupReport> {
  const resolved = path.resolve(projectPath);
  const serverScript = customServerScript ?? resolveMcpServerScript();
  const results: McpClientConfigResult[] = [];

  if (client === "cursor" || client === "all") {
    results.push(await setupCursorMcp(resolved, serverScript));
  }
  if (client === "vscode" || client === "all") {
    results.push(await setupVsCodeMcp(resolved, serverScript));
  }
  if (client === "windsurf" || client === "all") {
    results.push(await setupWindsurfMcp(resolved, serverScript));
  }
  if (client === "claude" || client === "all") {
    results.push(await setupClaudeCodeMcp(resolved, serverScript));
  }

  return {
    projectPath: resolved,
    serverScriptPath: serverScript,
    results
  };
}
