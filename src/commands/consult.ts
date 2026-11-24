import { consult, formatConsult, type ConsultOptions } from "../core/consult.js";

export async function runConsult(_command: string, args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h") || !args.some((a) => !a.startsWith("-"))) {
    process.stdout.write(
      "Usage: anvil consult <task or query> [--limit N] [--kinds agent,skill,command,rule,mcp] [--lang LIST] [--json]\n"
    );
    return;
  }
  const isJson = args.includes("--json");
  const queryWords = args.filter((a, idx) => {
    if (a.startsWith("-")) return false;
    const prev = args[idx - 1];
    if (prev === "--limit" || prev === "--kinds" || prev === "--lang") return false;
    return true;
  });
  const query = queryWords.join(" ");

  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx !== -1 && args[limitIdx + 1] ? Number(args[limitIdx + 1]) : 10;

  const kindsIdx = args.indexOf("--kinds");
  const kindsVal = kindsIdx !== -1 && args[kindsIdx + 1] ? args[kindsIdx + 1] : undefined;

  const langIdx = args.indexOf("--lang");
  const langVal = langIdx !== -1 && args[langIdx + 1] ? args[langIdx + 1] : undefined;

  const options: ConsultOptions = { limit };
  if (kindsVal) options.kinds = kindsVal.split(",") as ("mcp" | "skill" | "agent" | "command" | "rule")[];
  if (langVal) options.languages = langVal.split(",");

  const matches = await consult(query, options);
  if (isJson) {
    process.stdout.write(JSON.stringify(matches, null, 2) + "\n");
  } else {
    process.stdout.write(formatConsult(query, matches) + "\n");
  }
}
