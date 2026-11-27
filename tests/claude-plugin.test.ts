import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { safeRm } from "./test-helpers.js";
import { loadHarnessCatalog } from "../src/core/harness-catalog.js";
import { renderClaudePlugin, renderMarketplace, syncClaudePlugin } from "../src/core/claude-plugin.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => safeRm(directory)));
});

async function workspace(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "anvil-plugin-"));
  directories.push(directory);
  return directory;
}

describe("Claude Code plugin", () => {
  it("renders every catalog agent, skill and command plus rule skills", async () => {
    const catalog = await loadHarnessCatalog();
    const build = renderClaudePlugin(catalog, "9.9.9");
    const count = (kind: string) => catalog.items.filter((item) => item.kind === kind).length;
    expect(build.counts.agents).toBe(count("agent"));
    expect(build.counts.skills).toBe(count("skill"));
    expect(build.counts.commands).toBe(count("command"));
    expect(build.counts.ruleSkills).toBeGreaterThan(0);
    const paths = build.files.map((file) => file.path);
    expect(paths).toContain(".claude-plugin/plugin.json");
    expect(paths).toContain(".mcp.json");
    expect(paths).toContain("hooks/hooks.json");
    expect(paths).toContain("skills/rules-common/SKILL.md");
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("pins the MCP server and hooks to the plugin version", () => {
    const build = renderClaudePlugin({ root: "", items: [] }, "2.3.4");
    const file = (p: string) => JSON.parse(build.files.find((f) => f.path === p)?.content ?? "{}");
    expect(file(".claude-plugin/plugin.json")).toMatchObject({ name: "anvil", version: "2.3.4", license: "MIT" });
    expect(file(".mcp.json").mcpServers.anvil.args).toEqual([
      "-y",
      "anvil-engineering-workbench@2.3.4",
      "mcp",
      "start",
    ]);
    const hooks = file("hooks/hooks.json").hooks as Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    expect(Object.keys(hooks)).toEqual(expect.arrayContaining(["PreToolUse", "Stop", "SessionStart"]));
    expect(hooks.PreToolUse[0].hooks[0].command).toBe("npx -y anvil-engineering-workbench@2.3.4 hook pre-tool");
  });

  it("writes agent files with Claude Code frontmatter", async () => {
    const build = renderClaudePlugin(await loadHarnessCatalog(), "1.0.0");
    const agent = build.files.find((file) => file.path.startsWith("agents/"));
    expect(agent?.content).toMatch(/^---\nname: [a-z0-9-]+\ndescription: /);
  });

  it("points the marketplace at the plugin folder", () => {
    const marketplace = JSON.parse(renderMarketplace("1.2.3"));
    expect(marketplace.name).toBe("anvil");
    expect(marketplace.plugins[0]).toMatchObject({ name: "anvil", source: "./plugin", version: "1.2.3" });
  });

  it("builds, detects drift and removes stale files", async () => {
    const root = await workspace();
    const first = await syncClaudePlugin(root, "1.0.0");
    expect(first.drift.length).toBeGreaterThan(0);
    expect((await syncClaudePlugin(root, "1.0.0", { check: true })).drift).toEqual([]);

    await writeFile(path.join(root, "plugin", "agents", "stale.md"), "old\n");
    const manifest = path.join(root, "plugin", ".claude-plugin", "plugin.json");
    await writeFile(manifest, (await readFile(manifest, "utf8")).replace(/\n/g, "\r\n"));
    const check = await syncClaudePlugin(root, "1.0.0", { check: true });
    expect(check.drift).toEqual(["- plugin/agents/stale.md"]);

    const bumped = await syncClaudePlugin(root, "1.0.1", { check: true });
    expect(bumped.drift).toContain("~ plugin/.claude-plugin/plugin.json");
    expect(bumped.drift).toContain("~ .claude-plugin/marketplace.json");
  });

  it("keeps the committed plugin in sync with the catalog and package version", async () => {
    const pkg = JSON.parse(await readFile(path.resolve("package.json"), "utf8")) as { version: string };
    const result = await syncClaudePlugin(path.resolve("."), pkg.version, { check: true });
    expect(result.drift, "Run `anvil plugin build` and commit plugin/").toEqual([]);
  });
});
