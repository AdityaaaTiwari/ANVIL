import { mkdir, mkdtemp, readFile, rm, writeFile, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyHarnessPlan,
  DEFAULT_TARGETS,
  parseTargets,
  planHarnessInstall,
  type InstallOptions,
} from "../src/core/harness-installer.js";

const exists = (file: string) =>
  access(file).then(
    () => true,
    () => false
  );

describe("anvil install (harness installer)", () => {
  let tempDir = "";
  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  });

  async function setup(): Promise<{ project: string; home: string; options: InstallOptions }> {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "anvil-install-test-"));
    const project = path.join(tempDir, "proj");
    const home = path.join(tempDir, "home");
    await mkdir(project, { recursive: true });
    await mkdir(home, { recursive: true });
    return {
      project,
      home,
      options: { projectPath: project, targets: DEFAULT_TARGETS, homeDir: home, platform: "linux" },
    };
  }

  async function install(options: InstallOptions, remove = false) {
    const plans = await planHarnessInstall(options, remove);
    await applyHarnessPlan(plans);
    return plans;
  }

  const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8"));

  it("writes the right config format for every default tool", async () => {
    const { project, home, options } = await setup();
    await install(options);
    const npx = { command: "npx", args: ["-y", "anvil-engineering-workbench", "mcp", "start"] };

    expect((await readJson(path.join(project, ".mcp.json"))).mcpServers.anvil).toEqual(npx);
    expect((await readJson(path.join(project, ".cursor/mcp.json"))).mcpServers.anvil.env).toEqual({
      ANVIL_WORKSPACE: "${workspaceFolder}",
    });
    // VS Code uses "servers", not "mcpServers".
    expect((await readJson(path.join(project, ".vscode/mcp.json"))).servers.anvil.type).toBe("stdio");
    expect((await readJson(path.join(project, ".agents/mcp_config.json"))).mcpServers.anvil.env).toEqual({
      ANVIL_WORKSPACE: project,
    });
    expect((await readJson(path.join(project, ".gemini/settings.json"))).mcpServers.anvil).toEqual(npx);
    const opencode = await readJson(path.join(project, "opencode.json"));
    expect(opencode.mcp.anvil).toEqual({ type: "local", command: ["npx", ...npx.args], enabled: true });
    expect(opencode.$schema).toBe("https://opencode.ai/config.json");
    expect((await readJson(path.join(home, ".codeium/windsurf/mcp_config.json"))).mcpServers.anvil.command).toBe("npx");
    const toml = await readFile(path.join(home, ".codex/config.toml"), "utf8");
    expect(toml).toContain("[mcp_servers.anvil]");
    expect(toml).toContain('args = ["-y", "anvil-engineering-workbench", "mcp", "start"]');

    for (const file of ["AGENTS.md", "CLAUDE.md", "GEMINI.md"])
      expect(await readFile(path.join(project, file), "utf8")).toContain("anvil gate");
  });

  it("keeps existing settings and is idempotent", async () => {
    const { project, home, options } = await setup();
    await mkdir(path.join(project, ".cursor"));
    await writeFile(
      path.join(project, ".cursor/mcp.json"),
      JSON.stringify({ mcpServers: { github: { command: "gh" } }, extra: true })
    );
    await mkdir(path.join(home, ".codex"));
    await writeFile(path.join(home, ".codex/config.toml"), 'model = "x"\n\n[mcp_servers.docs]\ncommand = "docs"\n');
    await writeFile(path.join(project, "AGENTS.md"), "# Mine\n\nKeep me.\n");

    await install(options);
    const cursor = await readJson(path.join(project, ".cursor/mcp.json"));
    expect(cursor.mcpServers.github).toEqual({ command: "gh" });
    expect(cursor.extra).toBe(true);
    expect(await readFile(path.join(home, ".codex/config.toml"), "utf8")).toMatch(
      /^model = "x"[\s\S]*mcp_servers\.docs/
    );
    expect(await readFile(path.join(project, "AGENTS.md"), "utf8")).toMatch(/^# Mine\n\nKeep me\.\n\n<!-- anvil:start/);

    const second = await planHarnessInstall(options);
    expect(second.every((plan) => plan.action === "unchanged")).toBe(true);
  });

  it("uninstall restores the user's files and deletes ones it created", async () => {
    const { project, home, options } = await setup();
    await mkdir(path.join(project, ".cursor"));
    const cursorBefore = JSON.stringify({ mcpServers: { github: { command: "gh" } } }, null, 2) + "\n";
    await writeFile(path.join(project, ".cursor/mcp.json"), cursorBefore);
    await mkdir(path.join(home, ".codex"));
    const tomlBefore = 'model = "x"\n';
    await writeFile(path.join(home, ".codex/config.toml"), tomlBefore);
    await writeFile(path.join(project, "AGENTS.md"), "# Mine\n");

    await install(options);
    await install(options, true);

    expect(await readFile(path.join(project, ".cursor/mcp.json"), "utf8")).toBe(cursorBefore);
    expect(await readFile(path.join(home, ".codex/config.toml"), "utf8")).toBe(tomlBefore);
    expect(await readFile(path.join(project, "AGENTS.md"), "utf8")).toBe("# Mine\n");
    expect(await exists(path.join(project, ".mcp.json"))).toBe(false);
    expect(await exists(path.join(project, "opencode.json"))).toBe(false);
    expect(await exists(path.join(project, "CLAUDE.md"))).toBe(false);
  });

  it("never rewrites JSON it cannot parse, and never takes over a foreign codex entry", async () => {
    const { project, home, options } = await setup();
    const jsonc = '{\n  // my comment\n  "a": 1\n}\n';
    await writeFile(path.join(project, "opencode.json"), jsonc);
    await mkdir(path.join(home, ".codex"));
    const toml = '[mcp_servers.anvil]\ncommand = "my-own"\n';
    await writeFile(path.join(home, ".codex/config.toml"), toml);

    const plans = await install(options);
    expect(plans.find((p) => p.target === "opencode")?.action).toBe("skip");
    expect(plans.find((p) => p.target === "codex")?.action).toBe("skip");
    expect(await readFile(path.join(project, "opencode.json"), "utf8")).toBe(jsonc);
    expect(await readFile(path.join(home, ".codex/config.toml"), "utf8")).toBe(toml);
  });

  it("supports global/local server modes and the Windows Claude Desktop shim", async () => {
    const { options } = await setup();
    const global = await planHarnessInstall({ ...options, targets: ["claude"], server: "global", instructions: false });
    expect(JSON.parse(global[0]!.content!).mcpServers.anvil).toEqual({ command: "anvil", args: ["mcp", "start"] });

    const local = await planHarnessInstall({
      ...options,
      targets: ["claude"],
      server: "local",
      localServerScript: "/x/dist/mcp/server.js",
      instructions: false,
    });
    expect(JSON.parse(local[0]!.content!).mcpServers.anvil).toEqual({
      command: "node",
      args: ["/x/dist/mcp/server.js"],
    });

    const win = await planHarnessInstall({
      ...options,
      targets: ["claude-desktop"],
      platform: "win32",
      appData: "C:\\Users\\a\\AppData\\Roaming",
      instructions: false,
    });
    expect(win[0]!.path).toContain(path.join("Claude", "claude_desktop_config.json"));
    expect(JSON.parse(win[0]!.content!).mcpServers.anvil.command).toBe("cmd");
  });

  it("parses target lists and aliases", () => {
    expect(parseTargets(undefined)).toEqual([...DEFAULT_TARGETS]);
    expect(parseTargets("claude-code,copilot,cursor,cursor")).toEqual(["claude", "vscode", "cursor"]);
    expect(() => parseTargets("chatgpt")).toThrow(/Unknown target/);
  });
});
