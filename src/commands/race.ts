import path from "node:path";
import { cleanRace, formatRace, listRaces, parseContestants, pickRace, readRace, runRace } from "../core/agent-race.js";
import { findPositionalArgs } from "./shared.js";

const VALUE_FLAGS = new Set(["--goal", "--prompt", "--contestants", "--checks", "--check", "--path"]);

export async function runRaceCommand(_command: string, args: string[]): Promise<void> {
  const [action = "list", ...rest] = args;
  if (action === "help" || args.includes("--help") || args.includes("-h")) {
    process.stdout.write("Usage: anvil race <run|list|show|pick|clean> [options]\n");
    return;
  }
  const isJson = rest.includes("--json");
  const positional = findPositionalArgs(rest, VALUE_FLAGS);
  const pathIdx = rest.indexOf("--path");
  const defaultPathArg =
    action === "list" || action === "run" ? positional[0] : action === "pick" ? positional[2] : positional[1];
  const projectPath = path.resolve(pathIdx !== -1 && rest[pathIdx + 1] ? rest[pathIdx + 1]! : (defaultPathArg ?? "."));

  switch (action) {
    case "list": {
      const races = await listRaces(projectPath);
      if (isJson) {
        process.stdout.write(JSON.stringify(races, null, 2) + "\n");
      } else {
        process.stdout.write(`Found ${races.length} race(s).\n`);
        for (const r of races) process.stdout.write(`  ${r.id}  ${r.goal}\n`);
      }
      break;
    }
    case "show": {
      const id = positional[0];
      if (!id) throw new Error("Usage: anvil race show <RACE_ID>");
      const race = await readRace(projectPath, id);
      if (!race) throw new Error(`Race ${id} not found.`);
      if (isJson) {
        process.stdout.write(JSON.stringify(race, null, 2) + "\n");
      } else {
        process.stdout.write(formatRace(race) + "\n");
      }
      break;
    }
    case "clean": {
      const id = positional[0];
      if (!id) throw new Error("Usage: anvil race clean <RACE_ID>");
      const cleaned = await cleanRace(projectPath, id);
      process.stdout.write(cleaned ? `Cleaned race ${id}.\n` : `Race ${id} not found.\n`);
      break;
    }
    case "pick": {
      const id = positional[0];
      const contestant = positional[1];
      if (!id || !contestant) throw new Error("Usage: anvil race pick <RACE_ID> <CONTESTANT>");
      const result = await pickRace(projectPath, id, contestant);
      process.stdout.write(`Picked ${contestant} for race ${id}. Contestants: ${result.race.entries.length}\n`);
      break;
    }
    case "run": {
      const goalIdx = rest.indexOf("--goal") !== -1 ? rest.indexOf("--goal") : rest.indexOf("--prompt");
      const goal = goalIdx !== -1 ? rest[goalIdx + 1] : undefined;
      const contestantsIdx = rest.indexOf("--contestants");
      const contestantsRaw = contestantsIdx !== -1 ? rest[contestantsIdx + 1] : undefined;
      const checksIdx = rest.indexOf("--checks") !== -1 ? rest.indexOf("--checks") : rest.indexOf("--check");
      const checks =
        checksIdx !== -1 && typeof rest[checksIdx + 1] === "string"
          ? (rest[checksIdx + 1] as string)
              .split(",")
              .map((c) => c.trim())
              .filter(Boolean)
          : ["npm test"];
      if (!goal || !contestantsRaw) {
        throw new Error("Usage: anvil race run --goal <GOAL> --contestants <LIST> [--checks <CMD>]");
      }
      const contestants = parseContestants(contestantsRaw);
      const race = await runRace({ projectPath, goal, checks, contestants });
      if (isJson) {
        process.stdout.write(JSON.stringify(race, null, 2) + "\n");
      } else {
        process.stdout.write(formatRace(race) + "\n");
      }
      break;
    }
    default:
      process.stdout.write(`Unknown race action "${action}". Use run, list, show, pick or clean.\n`);
  }
}
