import path from "node:path";
import { analyzeBinaryIntelligence } from "../core/binary-intelligence.js";
import { formatSupplyChainReport, scanSupplyChain } from "../core/supply-chain-scanner.js";

export async function runBinary(_command: string, rest: string[]): Promise<void> {
  if (rest.includes("--help") || rest.includes("-h")) {
    process.stdout.write(`Usage: anvil binary [path] [--supply-chain] [--findings-only] [--clean-room] [--json]\n`);
    return;
  }

  const target = path.resolve(rest.find((arg) => !arg.startsWith("--")) ?? ".");
  const isJson = rest.includes("--json");
  const findingsOnly = rest.includes("--findings-only") || rest.includes("--clean-room");
  const withSupplyChain = rest.includes("--supply-chain");

  try {
    const [report, supplyChain] = await Promise.all([
      analyzeBinaryIntelligence(target),
      withSupplyChain ? scanSupplyChain(target) : Promise.resolve(undefined),
    ]);

    const payload = supplyChain ? { ...report, supplyChain } : report;

    if (isJson) {
      process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
      if (!report.cleanRoomReport.compliant || (supplyChain && !supplyChain.passed)) {
        process.exitCode = 1;
      }
      return;
    }

    process.stdout.write(`\n# ANVIL Binary & Provenance Intelligence\n`);
    process.stdout.write(`Target: ${report.workspace}\n`);
    process.stdout.write(`Total Binary/Bundle Assets: ${report.totalAssets}\n\n`);

    process.stdout.write(`Asset Breakdown:\n`);
    for (const [cat, count] of Object.entries(report.categories)) {
      if (count > 0) {
        process.stdout.write(`  - ${cat.padEnd(16)}: ${count}\n`);
      }
    }

    process.stdout.write(
      `\nProvenance Compliance: ${report.cleanRoomReport.compliant ? "PASSED" : "VIOLATIONS DETECTED"}\n`
    );
    process.stdout.write(`${report.cleanRoomReport.summary}\n`);

    if (report.cleanRoomReport.findings.length > 0) {
      process.stdout.write(`\nFindings:\n`);
      for (const finding of report.cleanRoomReport.findings) {
        process.stdout.write(`  [${finding.severity.toUpperCase()}] ${finding.ruleId} in ${finding.file}\n`);
        process.stdout.write(`    ${finding.message}\n`);
        process.stdout.write(`    Remediation: ${finding.remediation}\n\n`);
      }
    }

    if (!findingsOnly && report.assets.length > 0) {
      process.stdout.write(`\nTracked Assets (Sample):\n`);
      for (const asset of report.assets.slice(0, 15)) {
        const kb = (asset.sizeBytes / 1024).toFixed(1);
        const arch = asset.binaryMetadata?.arch ? ` ${asset.binaryMetadata.arch}` : "";
        const fmt = asset.detectedFormat ? `, ${asset.detectedFormat}${arch}` : "";
        const hash = asset.sha256 ? `, sha256:${asset.sha256.slice(0, 10)}` : "";
        process.stdout.write(`  ${asset.path} (${asset.category}${fmt}, ${kb} KB${hash})\n`);
      }
    }

    if (supplyChain) {
      process.stdout.write(formatSupplyChainReport(supplyChain, { findingsOnly }) + "\n");
    }

    if (!report.cleanRoomReport.compliant || (supplyChain && !supplyChain.passed)) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(
      `Could not inspect binary assets: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  }
}
