import path from "node:path";
import { createAdr, initAdrDirectory, listAdrs, syncMemoryToAdrs, type AdrStatus } from "../core/adr-engine.js";

export async function runAdr(_command: string, rest: string[]): Promise<void> {
  if (rest.includes("--help") || rest.includes("-h") || rest[0] === "help") {
    process.stdout.write(`Usage: anvil adr <subcommand> [options]

Manage Architecture Decision Records (ADR) using the MADR 3.0 standard.

Subcommands:
  init [path]                           Initialize docs/adr/ directory with template
  new "Title" [path] [--status STATUS]  Create a new ADR record
  list [path]                           List all recorded ADRs
  sync [path]                           Sync decisions from project memory to docs/adr/
`);
    return;
  }
  const [action = "list", ...adrArgs] = rest;
  const option = (name: string) => {
    const index = adrArgs.indexOf(name);
    return index >= 0 ? adrArgs[index + 1] : undefined;
  };
  const skipValues = new Set<number>();
  for (let i = 0; i < adrArgs.length; i++) {
    if (adrArgs[i]?.startsWith("--")) skipValues.add(i + 1);
  }
  const positional = adrArgs.filter((arg, i) => !arg.startsWith("--") && !skipValues.has(i));
  try {
    if (action === "init") {
      const target = path.resolve(positional[0] ?? ".");
      const res = await initAdrDirectory(target);
      process.stdout.write(
        res.created
          ? `Initialized Architecture Decision Records in ${res.path}\n`
          : `ADR directory already initialized in ${res.path}\n`
      );
    } else if (action === "new") {
      const title = positional[0];
      if (!title) throw new Error('Usage: anvil adr new "Title of decision" [path] [--status Proposed|Accepted]');
      const target = path.resolve(positional[1] ?? ".");
      const status = (option("--status") ?? "Accepted") as AdrStatus;
      const context = option("--context");
      const decision = option("--decision");
      const record = await createAdr(target, title, { status, context, decision });
      process.stdout.write(`Created ADR ${record.id}: ${record.filename}\n`);
    } else if (action === "sync") {
      const target = path.resolve(positional[0] ?? ".");
      const res = await syncMemoryToAdrs(target);
      process.stdout.write(
        res.syncedCount > 0
          ? `Synced ${res.syncedCount} decisions from project memory to docs/adr/:\n` +
              res.createdAdrs.map((a) => `  - [${a.id}] ${a.filename}`).join("\n") +
              "\n"
          : `All project memory decisions are already synced to docs/adr/.\n`
      );
    } else if (action === "list") {
      const target = path.resolve(positional[0] ?? ".");
      const records = await listAdrs(target);
      if (!records.length) {
        process.stdout.write("No Architecture Decision Records found. Run 'anvil adr init' to get started.\n");
      } else {
        process.stdout.write(`Architecture Decision Records (${records.length}):\n\n`);
        for (const r of records) {
          process.stdout.write(`  [${r.id}] ${r.title} (${r.status}, ${r.date})\n`);
        }
      }
    } else {
      throw new Error("ADR actions: init, new, list, sync.");
    }
  } catch (error) {
    process.stderr.write(
      "ANVIL ADR command failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
