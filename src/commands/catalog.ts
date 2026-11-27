import type { CatalogKind } from "../core/harness-catalog.js";
import { loadHarnessCatalog } from "../core/harness-catalog.js";
import { parseCommandArgs, reportCommandError } from "./arg-parse.js";

const KINDS: readonly CatalogKind[] = ["agent", "skill", "command", "rule"];

export async function runCatalog(_command: string, rest: string[]): Promise<void> {
  if (rest.includes("--help") || rest.includes("-h")) {
    process.stdout.write(
      "Usage: anvil catalog [--kind agent|skill|command|rule] [--json]\n\n" +
        "List the agents, skills, commands and rules ANVIL can install, with the lowest profile that includes each.\n"
    );
    return;
  }
  try {
    const options = parseCommandArgs(rest, ["--kind"], ["--json"]);
    const kind = options.values.get("--kind");
    if (kind && !KINDS.includes(kind as CatalogKind)) throw new Error("--kind must be agent, skill, command or rule");
    const catalog = await loadHarnessCatalog();
    const items = catalog.items.filter((item) => !kind || item.kind === kind);
    if (options.flags.has("--json")) {
      process.stdout.write(
        JSON.stringify(
          items.map(({ body: _body, ...item }) => item),
          null,
          2
        ) + "\n"
      );
      return;
    }
    const counts = KINDS.map((k) => catalog.items.filter((item) => item.kind === k).length);
    const lines = [
      `ANVIL catalog: ${counts[0]} agents · ${counts[1]} skills · ${counts[2]} commands · ${counts[3]} rules`,
      "",
    ];
    for (const item of items) {
      const id = item.language ? `${item.language}/${item.id}` : item.id;
      lines.push(`  ${item.kind.padEnd(8)}${id.padEnd(32)} ${item.profile.padEnd(9)}${item.description}`);
    }
    process.stdout.write(lines.join("\n") + "\n");
  } catch (error) {
    reportCommandError("catalog", error);
  }
}
