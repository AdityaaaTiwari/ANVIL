import path from "node:path";
import {
  buildGuardReport,
  checkGuard,
  formatGuardCheck,
  formatGuardReport,
  readGuardEvents,
} from "../core/guard-report.js";
import { doctorHarness } from "../core/harness-installer.js";
import { parseCommandArgs, reportCommandError } from "./arg-parse.js";
import { resolvePackageVersion } from "./shared.js";

const USAGE = `Usage: anvil guard check "<command>" [--path DIR] [--json]
       anvil guard check --file PATH [--write] [--path DIR] [--json]
       anvil guard log [path] [--days N] [--limit N] [--json]
       anvil guard status [path] [--json]

  check   Dry-run Guard on a shell command or file access. Exits 2 on deny.
  log     What Guard blocked or asked about, by harness and rule.
  status  Which harnesses have Guard hooks live.
`;

export async function runGuard(_command: string, rest: string[]): Promise<void> {
  const sub = rest[0] ?? "log";
  if (sub === "--help" || sub === "-h" || sub === "help") {
    process.stdout.write(USAGE);
    return;
  }
  try {
    if (sub === "check") return await guardCheck(rest.slice(1));
    if (sub === "status") return await guardStatus(rest.slice(1));
    if (sub === "log") return await guardLog(rest.slice(1));
    throw new Error(`Unknown guard subcommand "${sub}"\n${USAGE}`);
  } catch (error) {
    reportCommandError("guard", error);
  }
}

async function guardCheck(args: string[]): Promise<void> {
  let projectPath = ".";
  let file: string | undefined;
  let write = false;
  let json = false;
  const words: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? "";
    if (arg === "--path") {
      const value = args[++i];
      if (!value) throw new Error("--path requires a directory");
      projectPath = value;
    } else if (arg === "--file") {
      file = args[++i];
      if (!file) throw new Error("--file requires a path");
    } else if (arg === "--write") write = true;
    else if (arg === "--json") json = true;
    else if (arg === "--") {
      words.push(...args.slice(i + 1));
      break;
    } else words.push(arg);
  }
  if (!file && !words.length) throw new Error("Give a command to check, or --file PATH");
  const result = await checkGuard(path.resolve(projectPath), file ? { file, write } : { command: words.join(" ") });
  process.stdout.write((json ? JSON.stringify(result, null, 2) : formatGuardCheck(result)) + "\n");
  process.exitCode = result.verdict.decision === "deny" ? 2 : 0;
}

async function guardStatus(args: string[]): Promise<void> {
  const options = parseCommandArgs(args, [], ["--json"]);
  const doctor = await doctorHarness({ projectPath: options.path, anvilVersion: resolvePackageVersion() });
  const guarded = doctor.hookTargets ?? [];
  const status = {
    installed: doctor.installed,
    guarded,
    unguarded: (doctor.targets ?? []).filter((target) => !guarded.includes(target)),
    interventions: (await readGuardEvents(options.path)).length,
  };
  if (options.flags.has("--json")) {
    process.stdout.write(JSON.stringify(status, null, 2) + "\n");
    return;
  }
  process.stdout.write(
    [
      "ANVIL Guard",
      `  live in:   ${guarded.length ? guarded.join(", ") : "none (run `anvil install --hooks`)"}`,
      ...(status.unguarded.length ? [`  no hooks:  ${status.unguarded.join(", ")} (instructions only)`] : []),
      `  blocked or asked so far: ${status.interventions}`,
    ].join("\n") + "\n"
  );
}

async function guardLog(args: string[]): Promise<void> {
  const options = parseCommandArgs(args, ["--days", "--limit"], ["--json"]);
  let since: Date | undefined;
  if (options.values.has("--days")) {
    const days = Number(options.values.get("--days"));
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      throw new Error("--days must be a whole number from 1 to 3650");
    }
    since = new Date(Date.now() - days * 86_400_000);
  }
  const limit = options.values.has("--limit") ? Number(options.values.get("--limit")) : 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("--limit must be between 1 and 500");
  const report = buildGuardReport(await readGuardEvents(options.path), { ...(since ? { since } : {}), limit });
  const output = options.flags.has("--json") ? JSON.stringify(report, null, 2) : formatGuardReport(report);
  process.stdout.write(output + "\n");
}
