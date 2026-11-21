import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  setupHarnessMcp,
  setupCursorMcp,
  setupVsCodeMcp,
  setupWindsurfMcp,
  getClaudeCodeSnippet,
} from "../src/core/mcp-setup.js";

describe("MCP harness setup wizard", () => {
  let tempDir = "";

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
      tempDir = "";
    }
  });

  async function createWorkspace(): Promise<string> {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "anvil-mcp-test-"));
    return tempDir;
  }

  it("configures Cursor .cursor/mcp.json cleanly", async () => {
    const root = await createWorkspace();
    const result = await setupCursorMcp(root, "/fake/dist/mcp/server.js");
    expect(result.configured).toBe(true);
    expect(result.client).toBe("cursor");

    const written = JSON.parse(await readFile(result.configPath!, "utf8"));
    expect(written.mcpServers.anvil).toBeDefined();
    expect(written.mcpServers.anvil.command).toBe("node");
    expect(written.mcpServers.anvil.args).toEqual(["/fake/dist/mcp/server.js"]);
    expect(written.mcpServers.anvil.env.ANVIL_WORKSPACE).toBe("${workspaceFolder}");
  });

  it("preserves existing mcpServers in Cursor config without overwriting", async () => {
    const root = await createWorkspace();
    const cursorDir = path.join(root, ".cursor");
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(cursorDir, { recursive: true });
    await writeFile(
      path.join(cursorDir, "mcp.json"),
      JSON.stringify({ mcpServers: { other_server: { command: "python" } } })
    );

    await setupCursorMcp(root, "/fake/dist/mcp/server.js");
    const written = JSON.parse(await readFile(path.join(cursorDir, "mcp.json"), "utf8"));
    expect(written.mcpServers.other_server).toBeDefined();
    expect(written.mcpServers.anvil).toBeDefined();
  });

  it("configures VS Code .vscode/mcp.json", async () => {
    const root = await createWorkspace();
    const result = await setupVsCodeMcp(root, "/fake/dist/mcp/server.js");
    expect(result.configured).toBe(true);
    const written = JSON.parse(await readFile(result.configPath!, "utf8"));
    expect(written.mcpServers.anvil).toBeDefined();
  });

  it("configures Windsurf .windsurf/mcp_config.json", async () => {
    const root = await createWorkspace();
    const result = await setupWindsurfMcp(root, "/fake/dist/mcp/server.js");
    expect(result.configured).toBe(true);
    const written = JSON.parse(await readFile(result.configPath!, "utf8"));
    expect(written.mcpServers.anvil.env.ANVIL_WORKSPACE).toBe(path.resolve(root));
  });

  it("generates exact Claude Code registration snippet", () => {
    const snippet = getClaudeCodeSnippet("/my/project", "/anvil/dist/mcp/server.js");
    expect(snippet).toContain("claude mcp add --transport stdio anvil");
    expect(snippet).toContain("/anvil/dist/mcp/server.js");
  });

  it("runs setupHarnessMcp for all supported clients in one step", async () => {
    const root = await createWorkspace();
    const report = await setupHarnessMcp(root, "all", "/fake/server.js");
    expect(report.results.length).toBe(4);
    expect(report.results.map((r) => r.client)).toEqual(["cursor", "vscode", "windsurf", "claude"]);
  });
});
