import path from "node:path";

export interface ParsedArgs {
  /** Resolved project path (first positional argument, default "."). */
  path: string;
  values: Map<string, string>;
  flags: Set<string>;
}

/**
 * Strict parser for commands that take one optional project path plus a known
 * set of `--option VALUE` and `--flag` arguments. Unknown options are errors,
 * so a typo never silently runs the command against the wrong scope.
 */
export function parseCommandArgs(
  args: readonly string[],
  valueOptions: readonly string[],
  flagOptions: readonly string[]
): ParsedArgs {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const positional: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (valueOptions.includes(arg)) {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      if (values.has(arg)) throw new Error(`${arg} may only be given once`);
      values.set(arg, value);
      index += 1;
    } else if (flagOptions.includes(arg)) {
      flags.add(arg);
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  if (positional.length > 1) throw new Error("Expected at most one project path");
  return { path: path.resolve(positional[0] ?? "."), values, flags };
}

export function reportCommandError(command: string, error: unknown): void {
  process.stderr.write(`anvil ${command} failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
