import path from "node:path";
import { loadEvaluationSuites } from "../core/evaluation-engine.js";

export async function runEvals(_command: string, rest: string[]): Promise<void> {
  const target = path.resolve(rest.find((arg) => !arg.startsWith("--")) ?? ".");
  try {
    const suites = await loadEvaluationSuites(target);
    process.stdout.write(
      suites.length
        ? suites.map((suite) => suite.id + "  " + suite.name + " · " + suite.cases.length + " cases").join("\n") + "\n"
        : "No evaluation suites. Add JSON suites under .forge/evals/.\n"
    );
  } catch (error) {
    process.stderr.write(
      "Could not load evaluation suites: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
