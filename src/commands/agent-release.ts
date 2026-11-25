import path from "node:path";
import { loadBenchmarkRegression } from "../core/benchmark-regression.js";
import {
  decideAgentConfigRelease,
  formatAgentConfigRelease,
  listAgentConfigReleases,
  prepareAgentConfigRelease,
} from "../core/agent-config-release.js";

export async function runAgentRelease(_command: string, rest: string[]): Promise<void> {
  const action = rest[0] ?? "list";
  const option = (name: string) => {
    const index = rest.indexOf(name);
    return index >= 0 ? rest[index + 1] : undefined;
  };
  const pathIndex = rest.indexOf("--path");
  const target = path.resolve(pathIndex >= 0 ? (rest[pathIndex + 1] ?? ".") : ".");
  const args = rest
    .slice(1)
    .filter(
      (arg, index, all) =>
        !arg.startsWith("--") &&
        all[index - 1] !== "--path" &&
        all[index - 1] !== "--reviewer" &&
        all[index - 1] !== "--matrix"
    );
  try {
    if (action === "prepare") {
      const [candidateVersionId, baselineVersionId] = args;
      const matrixId = option("--matrix");
      if (!candidateVersionId || !baselineVersionId || !matrixId)
        throw new Error(
          "Usage: anvil agent-release prepare CANDIDATE_CONFIG_ID BASELINE_CONFIG_ID --matrix MATRIX_ID --path PROJECT"
        );
      const regression = await loadBenchmarkRegression(target, matrixId);
      const release = await prepareAgentConfigRelease(target, {
        candidateVersionId,
        baselineVersionId,
        regression,
      });
      process.stdout.write(
        formatAgentConfigRelease(release) + "\nHuman approval is still required. No live files were changed.\n"
      );
    } else if (action === "list") {
      const items = await listAgentConfigReleases(target);
      process.stdout.write(
        items.length
          ? items
              .map(
                (item) =>
                  item.id + "  " + item.status.padEnd(17) + "  " + item.candidateVersionId + "  " + item.benchmarkStatus
              )
              .join("\n") + "\n"
          : "No agent configuration releases found.\n"
      );
    } else if (action === "show") {
      const id = args[0];
      if (!id) throw new Error("Usage: anvil agent-release show RELEASE_ID --path PROJECT");
      const item = (await listAgentConfigReleases(target)).find((entry) => entry.id === id);
      if (!item) throw new Error("Release not found: " + id);
      process.stdout.write(formatAgentConfigRelease(item) + "\n");
    } else if (action === "approve" || action === "reject") {
      const id = args[0];
      if (!id) throw new Error("Usage: anvil agent-release approve|reject RELEASE_ID --reviewer NAME --path PROJECT");
      const reviewer = option("--reviewer");
      if (!reviewer?.trim()) throw new Error("A reviewer is required via --reviewer NAME.");
      const item = await decideAgentConfigRelease(target, id, reviewer, action);
      process.stdout.write(formatAgentConfigRelease(item) + "\n");
    } else throw new Error("Unknown action. Use prepare, list, show, approve or reject.");
  } catch (error) {
    process.stderr.write(
      "ANVIL agent release failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
