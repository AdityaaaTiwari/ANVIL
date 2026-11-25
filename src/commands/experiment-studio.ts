import path from "node:path";
import { loadAgentConfigVersion } from "../core/agent-config-versioning.js";
import {
  createModelComparisonMatrix,
  createSkillExperimentMatrix,
  formatModelComparisonMatrix,
  formatSkillExperimentMatrix,
} from "../core/agent-experiment-studio.js";
import { loadSkillRegistry } from "../core/skill-registry.js";
import { anvilWorkspacePath } from "../core/workspace-paths.js";

export async function runExperimentStudio(_command: string, rest: string[]): Promise<void> {
  const action = rest[0] ?? "create";
  const option = (name: string) => {
    const index = rest.indexOf(name);
    return index >= 0 ? rest[index + 1] : undefined;
  };
  if (action !== "create" && action !== "compare") {
    process.stderr.write(
      "Usage: anvil experiment-studio compare --id ID --name NAME --candidates id:provider:model,id:provider:model [--config-versions id=cfg-id,id=cfg-id] [--repeats 2] [--path PROJECT]\n"
    );
    process.stderr.write(
      "   or: anvil experiment-studio create --id ID --name NAME --provider PROVIDER --model MODEL --skills skill-a,skill-b [--repeats 2] [--path PROJECT]\n"
    );
    process.exitCode = 1;
    return;
  }
  const id = option("--id");
  const name = option("--name");
  if (action === "compare") {
    const rawCandidates = option("--candidates");
    const repeats = Number(option("--repeats") ?? "2");
    const pathIndex = rest.indexOf("--path");
    const target = path.resolve(pathIndex >= 0 ? (rest[pathIndex + 1] ?? ".") : ".");
    if (!id || !name || !rawCandidates) {
      process.stderr.write(
        "Usage: anvil experiment-studio compare --id ID --name NAME --candidates id:provider:model,id:provider:model [--repeats 2] [--path PROJECT]\n"
      );
      process.exitCode = 1;
      return;
    }
    try {
      const configVersions = new Map(
        (option("--config-versions") ?? "")
          .split(",")
          .filter(Boolean)
          .map((item) => {
            const separator = item.indexOf("=");
            if (separator < 1 || separator === item.length - 1)
              throw new Error("Each config version must use candidate-id=cfg-xxxxxxxxxxxx format.");
            return [item.slice(0, separator), item.slice(separator + 1)] as const;
          })
      );
      const candidates = rawCandidates.split(",").map((item) => {
        const [candidateId, candidateProvider, ...modelParts] = item.split(":");
        const model = modelParts.join(":");
        if (!candidateId || !candidateProvider || !model)
          throw new Error("Each candidate must use id:provider:model format.");
        if (!["openai", "claude-code", "anthropic", "google", "ollama"].includes(candidateProvider))
          throw new Error("Unsupported candidate provider: " + candidateProvider);
        const configVersionId = configVersions.get(candidateId);
        return {
          id: candidateId,
          provider: candidateProvider as "openai" | "claude-code" | "anthropic" | "google" | "ollama",
          model,
          ...(configVersionId ? { configVersionId } : {}),
        };
      });
      for (const candidateId of configVersions.keys())
        if (!candidates.some((candidate) => candidate.id === candidateId))
          throw new Error("Configuration snapshot references unknown candidate: " + candidateId);
      for (const candidate of candidates)
        if (candidate.configVersionId) await loadAgentConfigVersion(target, candidate.configVersionId);
      const matrix = createModelComparisonMatrix({ id, name, repeats, candidates });
      const destination = anvilWorkspacePath(target, "experiments", id + ".json");
      const { mkdir, writeFile } = await import("node:fs/promises");
      await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
      await writeFile(destination, JSON.stringify(matrix, null, 2) + "\n", {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      process.stdout.write(
        formatModelComparisonMatrix(matrix) + "\nSaved: " + path.relative(target, destination) + "\n"
      );
    } catch (error) {
      process.stderr.write(
        "ANVIL model comparison failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
      );
      process.exitCode = 1;
    }
    return;
  }
  const provider = option("--provider") ?? "openai";
  const model = option("--model");
  const skills = option("--skills");
  const repeats = Number(option("--repeats") ?? "2");
  const pathIndex = rest.indexOf("--path");
  const target = path.resolve(pathIndex >= 0 ? (rest[pathIndex + 1] ?? ".") : ".");
  if (!id || !name || !model || !skills) {
    process.stderr.write(
      "Usage: anvil experiment-studio create --id ID --name NAME --provider openai|claude-code --model MODEL --skills skill-a,skill-b [--repeats 2] [--path PROJECT]\n"
    );
    process.exitCode = 1;
    return;
  }
  if (!["openai", "claude-code", "anthropic", "google", "ollama"].includes(provider)) {
    process.stderr.write("Unsupported provider. Choose openai, claude-code, anthropic, google or ollama.\n");
    process.exitCode = 1;
    return;
  }
  try {
    const skillIds = skills
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const matrix = createSkillExperimentMatrix({
      id,
      name,
      baselineCandidateId: "baseline",
      treatmentCandidateId: "treatment",
      provider: provider as "openai" | "claude-code" | "anthropic" | "google" | "ollama",
      model,
      repeats,
      skillIds,
    });
    const registry = await loadSkillRegistry(target);
    const unknown = skillIds.filter((skillId) => !registry.some((skill) => skill.id === skillId));
    if (unknown.length) throw new Error("Unknown workspace/built-in skill(s): " + unknown.join(", "));
    const destination = anvilWorkspacePath(target, "experiments", id + ".json");
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    await writeFile(destination, JSON.stringify(matrix, null, 2) + "\n", {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    process.stdout.write(formatSkillExperimentMatrix(matrix) + "\nSaved: " + path.relative(target, destination) + "\n");
  } catch (error) {
    process.stderr.write(
      "ANVIL experiment studio failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
