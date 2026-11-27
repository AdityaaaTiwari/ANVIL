import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  analyzeRepository,
  collectLocalRepository,
  formatRepoProfile,
  renderProjectSkill,
} from "../github/repo-analysis.js";
import { parseCommandArgs, reportCommandError } from "./arg-parse.js";

/** Where the generated project skill is written: Claude Code, then Codex/OpenCode. */
export const PROJECT_SKILL_PATHS = [".claude/skills/anvil-project/SKILL.md", ".agents/skills/anvil-project/SKILL.md"];

export async function runAnalyze(_command: string, rest: string[]): Promise<void> {
  if (rest.includes("--help") || rest.includes("-h")) {
    process.stdout.write(
      "Usage: anvil analyze [path] [--write] [--json]\n\n" +
        "Profile the repository (stack, layout, conventions from git history) and, with --write,\n" +
        "save it as an anvil-project skill for Claude Code and Codex/OpenCode.\n"
    );
    return;
  }
  try {
    const options = parseCommandArgs(rest, [], ["--write", "--json"]);
    const json = options.flags.has("--json");
    const profile = analyzeRepository(await collectLocalRepository(options.path));
    process.stdout.write((json ? JSON.stringify(profile, null, 2) : formatRepoProfile(profile)) + "\n");
    if (!options.flags.has("--write")) {
      if (!json) process.stdout.write("\nRun with --write to save the anvil-project skill for your coding agents.\n");
      return;
    }
    const skill = renderProjectSkill(profile);
    for (const relative of PROJECT_SKILL_PATHS) {
      const target = path.join(options.path, relative);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, skill, "utf8");
      if (!json) process.stdout.write(`  wrote ${relative}\n`);
    }
  } catch (error) {
    reportCommandError("analyze", error);
  }
}
