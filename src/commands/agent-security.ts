import { writeFile } from "node:fs/promises";
import path from "node:path";
import { auditAgentConfiguration, formatAgentSecurityReport } from "../core/agent-security-audit.js";
import { generateSarif } from "../core/sarif-formatter.js";
import type { NormalizedFinding } from "../core/policy-engine.js";

const USAGE = `Usage: anvil agent-security [path] [--global] [--json] [--sarif PATH]

Scan AI-agent configuration for security problems: instruction files
(AGENTS.md, CLAUDE.md, GEMINI.md, rules, skills), Claude Code settings
and hooks, MCP server configs for every tool, and Codex config.toml.

Checks include plain-text credentials, prompt injection and hidden
Unicode, shell commands that pipe downloads into a shell or send secrets
over the network, "allow every command" permissions, disabled sandboxes,
unencrypted MCP servers and unpinned MCP packages.

Options:
  --global       Also scan your per-user configs (~/.claude, ~/.codex,
                 ~/.cursor, Windsurf, Gemini, OpenCode, Claude Desktop).
  --json         Print the report as JSON.
  --sarif PATH   Also write findings as SARIF v2.1.0 (for GitHub code scanning).

Exit code: 2 if any critical finding, 1 if the scan failed, else 0.
Matched values (tokens, passwords) are never printed.`;

export async function runAgentSecurity(_command: string, rest: string[]): Promise<void> {
  if (rest.includes("--help") || rest.includes("-h")) {
    process.stdout.write(USAGE + "\n");
    return;
  }
  const sarifIndex = rest.indexOf("--sarif");
  const sarifPath = sarifIndex >= 0 ? rest[sarifIndex + 1] : undefined;
  if (sarifIndex >= 0 && (!sarifPath || sarifPath.startsWith("--"))) {
    process.stderr.write("--sarif needs an output file path.\n");
    process.exitCode = 1;
    return;
  }
  const target = path.resolve(
    rest.find((arg, i) => !arg.startsWith("--") && (sarifIndex < 0 || i !== sarifIndex + 1)) ?? "."
  );
  try {
    const report = await auditAgentConfiguration(target, { includeGlobal: rest.includes("--global") });
    if (sarifPath) {
      const activeFindings: NormalizedFinding[] = report.findings
        .filter((finding) => !finding.file.startsWith("~/"))
        .map((finding) => ({
          id: finding.id,
          source: "security",
          category: "agent-config",
          severity: finding.severity,
          confidence: "high",
          file: finding.file,
          line: finding.line,
          message: `${finding.title}. ${finding.detail} ${finding.recommendation}`,
          fingerprint: `agent:${finding.id}:${finding.file}:${finding.line}`,
          legacyFingerprint: `agent:${finding.id}:${finding.file}:${finding.line}`,
        }));
      await writeFile(path.resolve(sarifPath), generateSarif({ activeFindings, targetRoot: target }), "utf8");
    }
    process.stdout.write(
      rest.includes("--json") ? JSON.stringify(report, null, 2) + "\n" : formatAgentSecurityReport(report) + "\n"
    );
    if (report.summary.critical > 0) process.exitCode = 2;
  } catch (error) {
    process.stderr.write(
      "ANVIL agent security audit failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
}
