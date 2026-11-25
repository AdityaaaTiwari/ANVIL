#!/usr/bin/env node
/**
 * Cross-platform launcher for `scripts/run-rea-bridge-tests.py`.
 * Resolves a working Python 3 interpreter (`python3`, `python`, or Windows `py -3`)
 * and forwards CLI arguments such as `--require-posix` or `--verbose`.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runnerScript = path.join(__dirname, "run-rea-bridge-tests.py");
const extraArgs = process.argv.slice(2);

const candidates =
  process.platform === "win32"
    ? [
        { cmd: "python", prefix: [] },
        { cmd: "py", prefix: ["-3"] },
        { cmd: "python3", prefix: [] },
      ]
    : [
        { cmd: "python3", prefix: [] },
        { cmd: "python", prefix: [] },
      ];

let selected;
for (const candidate of candidates) {
  const probe = spawnSync(candidate.cmd, [...candidate.prefix, "-c", "import sys; assert sys.version_info >= (3, 10)"], {
    stdio: "ignore",
  });
  if (!probe.error && probe.status === 0) {
    selected = candidate;
    break;
  }
}

if (!selected) {
  console.error("Error: Python >= 3.10 is required to run the REA bridge test suite.");
  process.exit(1);
}

const run = spawnSync(selected.cmd, [...selected.prefix, runnerScript, ...extraArgs], {
  stdio: "inherit",
});

if (run.error) {
  console.error(`Failed to execute ${selected.cmd}:`, run.error);
  process.exit(1);
}

process.exit(run.status ?? 1);
