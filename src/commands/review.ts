import path from "node:path";
import { formatCodeReview, reviewProject } from "../core/code-review.js";
import { formatAIReview, generateAIReview } from "../core/ai-code-review.js";
import { getAnvilEnv } from "../core/env-compat.js";
import { OpenAICompatibleProvider } from "../core/openai-compatible-provider.js";
import { saveReview } from "../core/review-history.js";

export async function runReview(_command: string, rest: string[]): Promise<void> {
  const json = rest.includes("--json");
  const all = rest.includes("--all");
  const pathIndex = rest.indexOf("--path");
  const baseIndex = rest.indexOf("--base");
  const target = path.resolve(
    pathIndex >= 0
      ? (rest[pathIndex + 1] ?? ".")
      : (rest.find(
          (arg, index) => !arg.startsWith("--") && rest[index - 1] !== "--base" && rest[index - 1] !== "--path"
        ) ?? ".")
  );
  const base = baseIndex >= 0 ? (rest[baseIndex + 1] ?? "HEAD") : "HEAD";
  try {
    const report = await reviewProject(target, { base, all });
    let ai: Awaited<ReturnType<typeof generateAIReview>> | undefined;
    if (rest.includes("--ai")) {
      const apiKey = getAnvilEnv("ANVIL_API_KEY") ?? process.env.OPENAI_API_KEY ?? "";
      if (!apiKey) throw new Error("Set ANVIL_API_KEY or OPENAI_API_KEY before using --ai.");
      const provider = new OpenAICompatibleProvider({
        apiKey,
        model: getAnvilEnv("ANVIL_MODEL", "gpt-4.1-mini")!,
        baseUrl: getAnvilEnv("ANVIL_BASE_URL", "https://api.openai.com/v1")!,
      });
      ai = await generateAIReview(report, provider);
    }
    const saved = await saveReview(target, report, ai);
    process.stdout.write(
      json
        ? JSON.stringify({ ...saved, reviewId: saved.id }, null, 2) + "\n"
        : formatCodeReview(report) + (ai ? "\n\n" + formatAIReview(ai) : "") + "\n\nSaved review: " + saved.id + "\n"
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`ANVIL code review failed: ${message}\n`);
    process.exitCode = 1;
  }
  return;
}
