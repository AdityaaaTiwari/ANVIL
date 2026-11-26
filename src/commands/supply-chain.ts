import path from "node:path";
import { formatSupplyChainReport, scanSupplyChain } from "../core/supply-chain-scanner.js";

export async function runSupplyChain(_command: string, rest: string[]): Promise<void> {
  if (rest.includes("--help") || rest.includes("-h")) {
    process.stdout.write(
      `Usage: anvil supply-chain [path] [--json] [--findings-only] [--max-packages N] [--no-entrypoints]\n` +
        `\n` +
        `Zero-dependency deep node_modules & lockfile supply-chain scanner.\n` +
        `Detects malicious lifecycle hooks (preinstall/install/postinstall), exfiltration,\n` +
        `obfuscated payloads, native .node/PE/ELF/Mach-O/WASM addons, extension spoofing,\n` +
        `plaintext/unpinned lockfile entries, and typosquatting dependencies offline.\n`
    );
    return;
  }

  const maxPkgIdx = rest.indexOf("--max-packages");
  let maxPackages: number | undefined;
  if (maxPkgIdx >= 0) {
    const raw = rest[maxPkgIdx + 1];
    const parsed = Number(raw);
    if (!raw || !Number.isInteger(parsed) || parsed < 1) {
      process.stderr.write(`ANVIL supply-chain: --max-packages must be a positive integer.\n`);
      process.exitCode = 1;
      return;
    }
    maxPackages = parsed;
  }

  const targetArg = rest.find((arg, idx) => !arg.startsWith("--") && rest[idx - 1] !== "--max-packages");
  const target = path.resolve(targetArg ?? ".");
  const isJson = rest.includes("--json");
  const findingsOnly = rest.includes("--findings-only");
  const scanEntrypoints = !rest.includes("--no-entrypoints");

  try {
    const report = await scanSupplyChain(target, {
      ...(maxPackages !== undefined ? { maxPackages } : {}),
      scanEntrypoints,
    });

    if (isJson) {
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    } else {
      process.stdout.write(formatSupplyChainReport(report, { findingsOnly }) + "\n");
    }

    if (!report.passed) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`ANVIL supply-chain scan failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
