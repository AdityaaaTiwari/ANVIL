import path from "node:path";
import { formatSkillContext, loadSkillRegistry, selectSkills } from "../core/skill-registry.js";

export async function runSkills(_command: string, rest: string[]): Promise<void> {
  const option = (name: string) => {
    const index = rest.indexOf(name);
    return index >= 0 ? rest[index + 1] : undefined;
  };
  const target = path.resolve(
    rest.find((arg) => !arg.startsWith("--") && arg !== option("--show") && arg !== option("--match")) ?? "."
  );
  try {
    const skills = await loadSkillRegistry(target);
    const showId = option("--show");
    const matchGoal = option("--match");
    if (showId) {
      const skill = skills.find((item) => item.id === showId);
      if (!skill) throw new Error("Skill not found: " + showId);
      process.stdout.write(
        (rest.includes("--json") ? JSON.stringify(skill, null, 2) : formatSkillContext([skill])) + "\n"
      );
    } else if (matchGoal !== undefined) {
      const selected = selectSkills(skills, matchGoal);
      process.stdout.write(
        rest.includes("--json")
          ? JSON.stringify(selected, null, 2) + "\n"
          : selected.length
            ? selected.map((skill) => skill.id + "  " + skill.name + " — " + skill.description).join("\n") + "\n"
            : "No skills matched that goal.\n"
      );
    } else if (rest.includes("--json")) {
      process.stdout.write(JSON.stringify(skills, null, 2) + "\n");
    } else {
      process.stdout.write("ANVIL skill registry (" + skills.length + ")\n\n");
      for (const skill of skills)
        process.stdout.write(
          "  " + skill.id.padEnd(24) + " " + skill.name + " [" + skill.source + "]\n    " + skill.description + "\n"
        );
      process.stdout.write('\nUse --show ID to inspect instructions or --match "GOAL" to preview task selection.\n');
    }
  } catch (error) {
    process.stderr.write("Could not load skills: " + (error instanceof Error ? error.message : String(error)) + "\n");
    process.exitCode = 1;
  }
  return;
}
