import { readdir, readFile, stat, appendFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export type SecuritySeverity = "critical" | "high" | "medium" | "low";
export type SecurityCategory = "secret" | "script" | "dependency" | "file";

export interface SecurityFinding {
  id: string;
  severity: SecuritySeverity;
  category: SecurityCategory;
  file: string;
  line?: number | undefined;
  rule: string;
  description: string;
  snippet?: string | undefined;
  secretHash?: string | undefined;
  remediation: string;
}

export interface SecurityAuditReport {
  scannedFiles: number;
  durationMs: number;
  findings: SecurityFinding[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
  };
  passed: boolean;
}

export interface SecurityScanOptions {
  customIgnore?: string[] | undefined;
  maxFiles?: number | undefined;
  includeTests?: boolean | undefined;
}

const DEFAULT_IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".nuxt",
  ".cache",
  ".turbo",
  ".anvil-snapshots",
  ".forge-snapshots",
]);

const SECRET_PATTERNS: Array<{
  rule: string;
  regex: RegExp;
  severity: SecuritySeverity;
  description: string;
  remediation: string;
}> = [
  {
    rule: "openai-api-key",
    regex: /(?:sk-[a-zA-Z0-9]{20,}|sk-proj-[a-zA-Z0-9_-]{20,})/,
    severity: "critical",
    description: "Hardcoded OpenAI API key detected.",
    remediation:
      "Move the key to an environment variable (e.g. process.env.OPENAI_API_KEY) and revoke the exposed key.",
  },
  {
    rule: "anthropic-api-key",
    regex: /sk-ant-[a-zA-Z0-9_-]{20,}/,
    severity: "critical",
    description: "Hardcoded Anthropic API key detected.",
    remediation:
      "Move the key to an environment variable (e.g. process.env.ANTHROPIC_API_KEY) and rotate it immediately.",
  },
  {
    rule: "github-pat",
    regex: /(?:ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{50,})/,
    severity: "critical",
    description: "Exposed GitHub Personal Access Token detected.",
    remediation: "Revoke this token in GitHub settings and use GitHub Actions secrets or environment variables.",
  },
  {
    rule: "aws-access-key",
    regex: /\bAKIA[0-9A-Z]{16}\b/,
    severity: "critical",
    description: "AWS Access Key ID exposed in code.",
    remediation: "Rotate IAM user credentials and use AWS IAM roles or environment variables.",
  },
  {
    rule: "google-api-key",
    regex: /\bAIza[0-9A-Za-z\\-_]{35}\b/,
    severity: "high",
    description: "Google / Gemini API Key exposed in source code.",
    remediation: "Restrict API key permissions in Google Cloud Console and pass via environment variables.",
  },
  {
    rule: "slack-token",
    regex: /\bxox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}\b/,
    severity: "high",
    description: "Slack API / Bot token detected.",
    remediation: "Rotate the token in Slack App settings and supply it via secure configuration.",
  },
  {
    rule: "private-cryptographic-key",
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
    severity: "critical",
    description: "Private cryptographic key embedded in repository file.",
    remediation: "Remove the private key from the repository, add to .gitignore, and regenerate new key pairs.",
  },
];

const DANGEROUS_SCRIPT_PATTERNS: Array<{
  rule: string;
  regex: RegExp;
  severity: SecuritySeverity;
  description: string;
  remediation: string;
}> = [
  {
    rule: "curl-pipe-bash",
    regex: /(?:curl|wget)\s+[^|;]+\|\s*(?:bash|sh|zsh)\b/,
    severity: "high",
    description: "Remote script piped directly to shell interpreter without integrity check.",
    remediation: "Download script, verify SHA256 checksum or GPG signature, then execute.",
  },
  {
    rule: "eval-code-execution",
    regex: /\beval\s*\(\s*(?:\$|process\.env|request|params|req\.)/i,
    severity: "high",
    description: "Dynamic " + "eval() execution on potentially untrusted input.",
    remediation: "Avoid " + "eval(); parse input using structured JSON or a safe expression parser.",
  },
  {
    rule: "unsafe-rm-wildcard",
    regex: /rm\s+-rf\s+(?:\/|\.\*|\*)\s*$/,
    severity: "critical",
    description: "Unbounded destructive rimraf command detected in script.",
    remediation: "Specify explicit relative paths with boundary validation before deleting files.",
  },
];

function maskSecret(text: string): string {
  if (text.length <= 8) return "********";
  return text.slice(0, 4) + "..." + text.slice(-4);
}

export async function scanProjectSecurity(
  projectPath: string,
  options: SecurityScanOptions = {}
): Promise<SecurityAuditReport> {
  const root = path.resolve(projectPath);
  const startTime = Date.now();
  const findings: SecurityFinding[] = [];
  let scannedFiles = 0;
  const maxFiles = options.maxFiles ?? 2000;

  let gitignoreContent = "";
  try {
    gitignoreContent = await readFile(path.join(root, ".gitignore"), "utf8");
  } catch {
    gitignoreContent = "";
  }

  const isGitignored = (fileName: string) => {
    return gitignoreContent.split("\n").some((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return false;
      return (
        trimmed === fileName ||
        trimmed === `*${path.extname(fileName)}` ||
        fileName.startsWith(trimmed.replace(/\*$/, ""))
      );
    });
  };

  async function walk(dir: string): Promise<void> {
    if (scannedFiles >= maxFiles) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (scannedFiles >= maxFiles) break;
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(root, fullPath).replace(/\\/g, "/");

      if (entry.isDirectory()) {
        if (DEFAULT_IGNORED_DIRS.has(entry.name)) continue;
        if (
          !options.includeTests &&
          (entry.name === "tests" || entry.name === "test" || entry.name === "__tests__" || entry.name === "fixtures")
        )
          continue;
        if (options.customIgnore?.includes(entry.name)) continue;
        await walk(fullPath);
      } else if (entry.isFile()) {
        if (!options.includeTests && /\.(test|spec)\.[jt]sx?$/.test(entry.name)) continue;
        scannedFiles++;

        if (
          entry.name === ".env" ||
          (entry.name.startsWith(".env.") && !entry.name.endsWith(".example") && !entry.name.endsWith(".sample"))
        ) {
          if (!isGitignored(entry.name)) {
            findings.push({
              id: `sec-file-${relativePath}`,
              severity: "high",
              category: "file",
              file: relativePath,
              rule: "exposed-env-file",
              description: `Environment configuration file "${entry.name}" is present but not excluded in .gitignore.`,
              remediation: "Add .env and .env.* to your .gitignore to prevent secret leakage in version control.",
            });
          }
        }

        if (/\.(pem|key|p12|pfx)$/i.test(entry.name)) {
          if (!isGitignored(entry.name)) {
            findings.push({
              id: `sec-file-${relativePath}`,
              severity: "critical",
              category: "file",
              file: relativePath,
              rule: "exposed-key-file",
              description: `Cryptographic key / certificate file "${entry.name}" found in repository.`,
              remediation: "Store private keys in a secure secret manager, not in the project working tree.",
            });
          }
        }

        if (/\.(ts|tsx|js|jsx|mjs|cjs|json|yaml|yml|toml|md|sh|bash|ps1|py|rb|php|env)$/i.test(entry.name)) {
          try {
            const stats = await stat(fullPath);
            if (stats.size > 500000) continue;

            const content = await readFile(fullPath, "utf8");
            const lines = content.split("\n");

            if (entry.name === "package.json") {
              try {
                const pkg = JSON.parse(content) as Record<string, unknown>;
                const allDeps = {
                  ...((pkg.dependencies as Record<string, string>) || {}),
                  ...((pkg.devDependencies as Record<string, string>) || {}),
                };
                for (const [dep, spec] of Object.entries(allDeps)) {
                  if (typeof spec === "string" && spec.startsWith("http://")) {
                    findings.push({
                      id: `sec-dep-${dep}`,
                      severity: "high",
                      category: "dependency",
                      file: relativePath,
                      rule: "insecure-http-dependency",
                      description: `Dependency "${dep}" is loaded over unencrypted HTTP protocol (${spec}).`,
                      remediation: "Upgrade dependency specifier to use HTTPS or npm registry version.",
                    });
                  }
                }
              } catch {}
            }

            for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
              const line = lines[lineIndex]!;

              for (const pattern of SECRET_PATTERNS) {
                const match = line.match(pattern.regex);
                if (match) {
                  const rawMatch = match[0];
                  if (
                    rawMatch.includes("1234567890abcdef") ||
                    rawMatch.includes("EXAMPLE") ||
                    rawMatch.includes("placeholder")
                  ) {
                    continue;
                  }
                  const rawSecret = rawMatch.trim();
                  const secretHash = createHash("sha256").update(rawSecret).digest("hex").slice(0, 16);
                  findings.push({
                    id: `sec-secret-${relativePath}-${lineIndex + 1}`,
                    severity: pattern.severity,
                    category: "secret",
                    file: relativePath,
                    line: lineIndex + 1,
                    rule: pattern.rule,
                    description: pattern.description,
                    snippet: maskSecret(rawMatch),
                    secretHash,
                    remediation: pattern.remediation,
                  });
                }
              }

              // Only scan executable code, scripts and manifests for dangerous execution patterns (skip documentation files)
              const isDocFile = /\.(md|mdx|txt|rst|adoc)$/i.test(relativePath);
              if (!isDocFile) {
                for (const pattern of DANGEROUS_SCRIPT_PATTERNS) {
                  const match = line.match(pattern.regex);
                  if (match) {
                    findings.push({
                      id: `sec-script-${relativePath}-${lineIndex + 1}`,
                      severity: pattern.severity,
                      category: "script",
                      file: relativePath,
                      line: lineIndex + 1,
                      rule: pattern.rule,
                      description: pattern.description,
                      snippet: match[0].trim().slice(0, 60),
                      remediation: pattern.remediation,
                    });
                  }
                }
              }
            }
          } catch {}
        }
      }
    }
  }

  await walk(root);

  const summary = {
    critical: findings.filter((f) => f.severity === "critical").length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
    total: findings.length,
  };

  return {
    scannedFiles,
    durationMs: Date.now() - startTime,
    findings,
    summary,
    passed: summary.critical === 0 && summary.high === 0,
  };
}

export async function applySecurityFixes(
  projectPath: string,
  findings: SecurityFinding[]
): Promise<{ fixedCount: number; details: string[] }> {
  const root = path.resolve(projectPath);
  const details: string[] = [];
  let fixedCount = 0;

  const envFilesToIgnore = new Set<string>();
  for (const f of findings) {
    if (f.rule === "exposed-env-file" || f.rule === "exposed-key-file") {
      envFilesToIgnore.add(".env");
      envFilesToIgnore.add(".env.*");
      envFilesToIgnore.add("*.pem");
      envFilesToIgnore.add("*.key");
    }
  }

  if (envFilesToIgnore.size > 0) {
    const gitignorePath = path.join(root, ".gitignore");
    let existing = "";
    try {
      existing = await readFile(gitignorePath, "utf8");
    } catch {
      existing = "";
    }

    const toAppend: string[] = [];
    for (const pattern of envFilesToIgnore) {
      if (!existing.includes(pattern)) {
        toAppend.push(pattern);
      }
    }

    if (toAppend.length > 0) {
      const content = `\n# ANVIL Security Exclusions\n${toAppend.join("\n")}\n`;
      await appendFile(gitignorePath, content, "utf8");
      details.push(`Added security exclusions to .gitignore: ${toAppend.join(", ")}`);
      fixedCount += toAppend.length;
    }
  }

  return { fixedCount, details };
}

export function formatSecurityReport(report: SecurityAuditReport): string {
  const lines: string[] = [];
  lines.push("ANVIL Repository Security & Secret Audit");
  lines.push("=======================================");
  lines.push(`Scanned ${report.scannedFiles} files in ${report.durationMs}ms.\n`);

  if (report.findings.length === 0) {
    lines.push("✓ Clean pass: No hardcoded secrets, dangerous script patterns, or exposed credentials found.\n");
    return lines.join("\n");
  }

  lines.push(
    `Audit Summary: ${report.summary.total} findings (${report.summary.critical} critical, ${report.summary.high} high, ${report.summary.medium} medium, ${report.summary.low} low)`
  );
  lines.push(
    report.passed
      ? "Status: PASSED (No critical or high severity issues)\n"
      : "Status: ACTION REQUIRED (Critical or high severity findings)\n"
  );

  for (const f of report.findings) {
    const sevTag = `[${f.severity.toUpperCase()}]`;
    const location = f.line ? `${f.file}:${f.line}` : f.file;
    lines.push(`${sevTag.padEnd(11)} ${location} - ${f.description}`);
    if (f.snippet) {
      lines.push(`            Snippet: ${f.snippet}`);
    }
    lines.push(`            Remediation: ${f.remediation}\n`);
  }

  return lines.join("\n");
}
