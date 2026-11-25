import path from "node:path";
import { getAnvilEnv } from "../core/env-compat.js";
import { fingerprintAgentConfig, loadBenchmarkMatrix } from "../core/benchmark-matrix.js";
import { loadEvaluationSuites } from "../core/evaluation-engine.js";
import { loadAgentConfigVersion } from "../core/agent-config-versioning.js";
import {
  captureExperimentManifest,
  compareExperimentManifests,
  formatExperimentManifest,
  loadExperimentManifest,
  saveExperimentManifest,
} from "../core/experiment-manifest.js";

export async function runExperiment(_command: string, rest: string[]): Promise<void> {
  const action = rest[0] ?? "capture";
  const option = (name: string) => {
    const index = rest.indexOf(name);
    return index >= 0 ? rest[index + 1] : undefined;
  };
  const pathIndex = rest.indexOf("--path");
  const target = path.resolve(pathIndex >= 0 ? (rest[pathIndex + 1] ?? ".") : ".");
  try {
    if (action === "capture") {
      const matrixFile = option("--matrix-file");
      const suiteId = option("--suite");
      const matrixId = option("--matrix-id");
      const provider = option("--provider") ?? getAnvilEnv("ANVIL_AI_PROVIDER", "openai")!;
      const model = option("--model") ?? getAnvilEnv("ANVIL_AI_MODEL") ?? getAnvilEnv("ANVIL_MODEL", "gpt-4.1")!;
      if (!matrixFile || !suiteId || !matrixId)
        throw new Error(
          "Usage: anvil experiment capture --matrix-file CONFIG.json --matrix-id ID --suite SUITE_ID [--provider ID] [--model NAME] [--path PROJECT]"
        );
      const matrix = await loadBenchmarkMatrix(path.resolve(matrixFile));
      const suites = await loadEvaluationSuites(target);
      const suite = suites.find((item) => item.id === suiteId);
      if (!suite) throw new Error("Evaluation suite not found: " + suiteId);
      const fingerprints = [];
      for (const candidate of matrix.candidates) {
        if (!candidate.configVersionId) continue;
        const snapshot = await loadAgentConfigVersion(target, candidate.configVersionId);
        fingerprints.push({
          candidateId: candidate.id,
          configVersionId: snapshot.id,
          fingerprint: fingerprintAgentConfig(snapshot.files),
        });
      }
      const baseUrl = getAnvilEnv("ANVIL_BASE_URL");
      const manifest = await captureExperimentManifest({
        projectPath: target,
        matrixFile: path.resolve(matrixFile),
        matrixId,
        suiteId,
        suite,
        provider,
        model,
        ...(baseUrl ? { baseUrl } : {}),
        agentConfigFingerprints: fingerprints,
      });
      const saved = await saveExperimentManifest(target, manifest);
      process.stdout.write(formatExperimentManifest(manifest) + "\nSaved: " + path.relative(target, saved) + "\n");
    } else if (action === "show") {
      const id = rest[1];
      if (!id) throw new Error("Usage: anvil experiment show EXPERIMENT_ID --path PROJECT");
      process.stdout.write(formatExperimentManifest(await loadExperimentManifest(target, id)) + "\n");
    } else if (action === "compare") {
      const ids = rest.slice(1).filter((arg, index, all) => !arg.startsWith("--") && all[index - 1] !== "--path");
      if (ids.length !== 2) throw new Error("Usage: anvil experiment compare EXPERIMENT_A EXPERIMENT_B --path PROJECT");
      const [a, b] = await Promise.all([
        loadExperimentManifest(target, ids[0]!),
        loadExperimentManifest(target, ids[1]!),
      ]);
      const comparison = compareExperimentManifests(a, b);
      process.stdout.write(
        "Experiment reproducibility: " +
          (comparison.compatible ? "COMPATIBLE" : "NOT COMPARABLE") +
          "\n" +
          (comparison.differences.length
            ? comparison.differences.map((item) => "  - " + item).join("\n")
            : "  Critical manifest fields match.") +
          "\n"
      );
      if (!comparison.compatible) process.exitCode = 2;
    } else throw new Error("Unknown action. Use capture, show or compare.");
  } catch (error) {
    process.stderr.write(
      "ANVIL experiment command failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
