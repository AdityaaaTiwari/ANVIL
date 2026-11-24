import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import {
  addManualInstinct,
  evolveInstincts,
  exportInstincts,
  formatInstinctList,
  importInstincts,
  learnInstincts,
  loadInstincts,
  removeInstinct,
  setInstinctStatus,
  type InstinctStatus,
} from "../core/instincts.js";

export async function runInstincts(command: string, args: string[]): Promise<void> {
  if (command === "evolve") {
    const isWrite = args.includes("--write");
    const isForce = args.includes("--force");
    const isGlobal = args.includes("--global");
    const isJson = args.includes("--json");
    const projectPath = path.resolve(args.find((a) => !a.startsWith("-")) ?? ".");
    const result = await evolveInstincts(projectPath, { write: isWrite, force: isForce, includeGlobal: isGlobal });
    if (isJson) {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    } else {
      process.stdout.write(
        `Evolved ${result.instincts} active instincts into skills.${isWrite ? " Changes written." : " Dry-run, use --write to persist."}\n`
      );
    }
    return;
  }

  const [action = "list", ...rest] = args;
  if (action === "help" || action === "--help") {
    process.stdout.write("Usage: anvil instinct <learn|list|add|promote|reject|remove|export|import> [options]\n");
    return;
  }

  const projectPath = path.resolve(rest.find((a) => !a.startsWith("-") && !/^inst-[a-f0-9]{10}$/.test(a)) ?? ".");
  const isGlobal = rest.includes("--global");
  const isDryRun = rest.includes("--dry-run");
  const isJson = rest.includes("--json");
  const scope = isGlobal ? ("global" as const) : ("project" as const);
  const ids = rest.filter((a) => /^inst-[a-f0-9]{10}$/.test(a));

  switch (action) {
    case "learn": {
      const result = await learnInstincts(projectPath, { dryRun: isDryRun });
      if (isJson) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      } else {
        process.stdout.write(
          `Learned ${result.added.length} new and refreshed ${result.updated.length} instincts (${result.total} total).\n`
        );
      }
      break;
    }
    case "list":
    case "status": {
      const statusIdx = rest.indexOf("--status");
      const status = statusIdx !== -1 ? (rest[statusIdx + 1] as InstinctStatus) : undefined;
      const instincts = (await loadInstincts(projectPath, scope)).filter((i) => !status || i.status === status);
      if (isJson) {
        process.stdout.write(JSON.stringify(instincts, null, 2) + "\n");
      } else {
        process.stdout.write(formatInstinctList(instincts) + "\n");
      }
      break;
    }
    case "add": {
      const triggerIdx = rest.indexOf("--trigger");
      const actionIdx = rest.indexOf("--action");
      const trigger = triggerIdx !== -1 ? rest[triggerIdx + 1] : undefined;
      const what = actionIdx !== -1 ? rest[actionIdx + 1] : undefined;
      if (!trigger || !what) {
        throw new Error("anvil instinct add requires --trigger and --action arguments.");
      }
      const instinct = await addManualInstinct(projectPath, trigger, what, { scope });
      process.stdout.write(`Added instinct ${instinct.id} (${scope}).\n`);
      break;
    }
    case "promote":
    case "reject": {
      if (!ids.length) throw new Error(`Usage: anvil instinct ${action} <ID...>`);
      const changed = await setInstinctStatus(projectPath, ids, action === "promote" ? "active" : "rejected", {
        scope,
      });
      process.stdout.write(`${action === "promote" ? "Promoted" : "Rejected"} ${changed.length} instinct(s).\n`);
      break;
    }
    case "remove": {
      const targetId = ids[0];
      if (!targetId) throw new Error("Usage: anvil instinct remove <ID>");
      const removed = await removeInstinct(projectPath, targetId, scope);
      process.stdout.write(removed ? `Removed ${targetId}.\n` : `Instinct ${targetId} not found.\n`);
      break;
    }
    case "export": {
      const exported = await exportInstincts(projectPath, { scope });
      process.stdout.write(JSON.stringify(exported, null, 2) + "\n");
      break;
    }
    case "import": {
      const file = rest.find((a) => !a.startsWith("-") && a.endsWith(".json"));
      if (!file) throw new Error("Usage: anvil instinct import <FILE.json>");
      const data = JSON.parse(await readFile(file, "utf8"));
      const result = await importInstincts(projectPath, data, { scope });
      process.stdout.write(`Imported ${result.added.length} instinct(s).\n`);
      break;
    }
    default:
      process.stdout.write(
        `Unknown instinct action "${action}". Use learn, list, add, promote, reject, remove, export or import.\n`
      );
  }
}
