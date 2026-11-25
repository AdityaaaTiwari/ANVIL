import path from "node:path";
import { analyzeBinaryIntelligence } from "../core/binary-intelligence.js";

export async function runBinary(_command: string, rest: string[]): Promise<void> {
  const target = path.resolve(rest.find((arg) => !arg.startsWith("--")) ?? ".");
  const isJson = rest.includes("--json");
  const findingsOnly = rest.includes("--findings-only") || rest.includes("--clean-room");

  try {
    const report = await analyzeBinaryIntelligence(target);

    if (isJson) {
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
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
        const fmt = asset.detectedFormat ? `, ${asset.detectedFormat}` : "";
        process.stdout.write(`  ${asset.path} (${asset.category}${fmt}, ${kb} KB)\n`);
      }
    }

    if (!report.cleanRoomReport.compliant) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(
      `Could not inspect binary assets: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  }
}
