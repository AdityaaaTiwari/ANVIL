import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initializeProject } from "../src/core/project-init.js";

describe("initializeProject", () => {
  let root = "";
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    root = "";
  });

  it("creates starter agents, skills, config, and memory", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "anvil-init-"));
    const result = await initializeProject(root);
    expect(result.created).toContain(".anvil/anvil.json");
    expect(result.created).toContain(".anvil/agents/planner.md");
    expect(result.created).toContain(".anvil/skills/verification-loop.md");
    expect(result.created).toContain(".anvil/memory/README.md");
    const config = JSON.parse(await readFile(path.join(root, ".anvil", "anvil.json"), "utf8"));
    expect(config.defaults.approvalRequiredForFileWrites).toBe(true);
  });

  it("does not overwrite existing project instructions", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "anvil-init-"));
    const target = path.join(root, ".anvil", "agents", "planner.md");
    await import("node:fs/promises").then((fs) => fs.mkdir(path.dirname(target), { recursive: true }));
    await import("node:fs/promises").then((fs) => fs.writeFile(target, "my custom planner", "utf8"));
    const result = await initializeProject(root);
    expect(result.skipped).toContain(".anvil/agents/planner.md");
    expect(await readFile(target, "utf8")).toBe("my custom planner");
  });
});
