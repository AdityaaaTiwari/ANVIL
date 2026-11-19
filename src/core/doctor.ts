import { execFile } from "node:child_process";
import { lstat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface DoctorCheck {
  name: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}

export interface DoctorReport {
  overallStatus: "healthy" | "degraded" | "critical";
  summary: { ok: number; warn: number; fail: number };
  checks: DoctorCheck[];
  checkedAt: string;
}

async function checkNodeVersion(): Promise<DoctorCheck> {
  const version = process.versions.node;
  const major = parseInt(version.split(".")[0] ?? "0", 10);
  if (major >= 22) {
    return {
      name: "Node.js runtime",
      status: "ok",
      detail: `v${version} (supported, >= 22 required)`,
    };
  }
  if (major >= 18) {
    return {
      name: "Node.js runtime",
      status: "warn",
      detail: `v${version} (v22+ recommended for full feature support)`,
    };
  }
  return {
    name: "Node.js runtime",
    status: "fail",
    detail: `v${version} is unsupported (v22+ required)`,
  };
}

async function checkGit(): Promise<DoctorCheck> {
  try {
    const { stdout } = await execFileAsync("git", ["--version"], { timeout: 3000 });
    return {
      name: "Git CLI",
      status: "ok",
      detail: stdout.trim(),
    };
  } catch {
    return {
      name: "Git CLI",
      status: "fail",
      detail: "Git executable not found in PATH. Required for change intelligence.",
    };
  }
}

async function checkDocker(): Promise<DoctorCheck> {
  try {
    await execFileAsync("docker", ["info"], { timeout: 3000 });
    return {
      name: "Docker daemon",
      status: "ok",
      detail: "Container runtime is running and responsive.",
    };
  } catch {
    return {
      name: "Docker daemon",
      status: "warn",
      detail: "Docker daemon is not running or not installed. Container sandbox will fallback to local execution.",
    };
  }
}

async function checkNpm(): Promise<DoctorCheck> {
  const binary = process.platform === "win32" ? "npm.cmd" : "npm";
  try {
    const { stdout } = await execFileAsync(binary, ["-v"], { timeout: 3000 });
    return {
      name: "npm CLI",
      status: "ok",
      detail: `v${stdout.trim()}`,
    };
  } catch {
    return {
      name: "npm CLI",
      status: "warn",
      detail: "npm binary not found in PATH or took too long to respond.",
    };
  }
}

function checkApiKey(name: string, envVar: string): DoctorCheck {
  const value = process.env[envVar]?.trim();
  if (value && value.length > 0) {
    return {
      name,
      status: "ok",
      detail: `Configured via ${envVar} environment variable.`,
    };
  }
  return {
    name,
    status: "warn",
    detail: `${envVar} is not set. Provider runs using this model will require credentials.`,
  };
}

export async function runDoctorChecks(projectPath?: string): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];

  // Core Runtime
  checks.push(await checkNodeVersion());
  checks.push(await checkGit());
  checks.push(await checkNpm());
  checks.push(await checkDocker());

  // Provider Credentials
  checks.push(checkApiKey("OpenAI provider", "OPENAI_API_KEY"));
  checks.push(checkApiKey("Anthropic provider", "ANTHROPIC_API_KEY"));
  const geminiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (geminiKey) {
    checks.push({
      name: "Google Gemini provider",
      status: "ok",
      detail: "Configured via GEMINI_API_KEY / GOOGLE_API_KEY environment variable.",
    });
  } else {
    checks.push({
      name: "Google Gemini provider",
      status: "warn",
      detail: "GEMINI_API_KEY is not set. Gemini provider runs will require credentials.",
    });
  }

  // Workspace checks (optional)
  if (projectPath) {
    const resolved = path.resolve(projectPath);
    try {
      const stats = await lstat(resolved);
      if (stats.isDirectory()) {
        checks.push({
          name: "Project workspace",
          status: "ok",
          detail: `Accessible directory: ${resolved}`,
        });

        // Check .forge
        try {
          const forgeStat = await lstat(path.join(resolved, ".forge"));
          if (forgeStat.isDirectory()) {
            checks.push({
              name: "FORGE configuration",
              status: "ok",
              detail: ".forge directory detected.",
            });
          } else {
            checks.push({
              name: "FORGE configuration",
              status: "warn",
              detail: ".forge path exists but is not a directory.",
            });
          }
        } catch {
          checks.push({
            name: "FORGE configuration",
            status: "warn",
            detail: "No .forge directory found. Run 'forge init' to configure this project.",
          });
        }

        // Check dist
        try {
          const pkgStat = await lstat(path.join(resolved, "package.json"));
          if (pkgStat.isFile()) {
            try {
              const distStat = await lstat(path.join(resolved, "dist"));
              if (distStat.isDirectory()) {
                checks.push({
                  name: "Build artifacts",
                  status: "ok",
                  detail: "Compiled output directory (dist/) found.",
                });
              } else {
                checks.push({
                  name: "Build artifacts",
                  status: "warn",
                  detail: "dist/ exists but is not a directory.",
                });
              }
            } catch {
              checks.push({
                name: "Build artifacts",
                status: "warn",
                detail: "dist/ directory missing. Run 'npm run build' before packaging.",
              });
            }
          }
        } catch {
          // not a node project, skip
        }
      } else {
        checks.push({
          name: "Project workspace",
          status: "fail",
          detail: `Path is not a directory: ${resolved}`,
        });
      }
    } catch {
      checks.push({
        name: "Project workspace",
        status: "fail",
        detail: `Directory not found or unreadable: ${resolved}`,
      });
    }
  }

  const summary = {
    ok: checks.filter(c => c.status === "ok").length,
    warn: checks.filter(c => c.status === "warn").length,
    fail: checks.filter(c => c.status === "fail").length,
  };

  let overallStatus: DoctorReport["overallStatus"] = "healthy";
  if (summary.fail > 0) {
    overallStatus = "critical";
  } else if (summary.warn > 0) {
    overallStatus = "degraded";
  }

  return {
    overallStatus,
    summary,
    checks,
    checkedAt: new Date().toISOString(),
  };
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push("ANVIL / FORGE Doctor — System Health Check");
  lines.push("====================================");

  for (const check of report.checks) {
    const badge = check.status === "ok" ? "[OK]  " : check.status === "warn" ? "[WARN]" : "[FAIL]";
    lines.push(`  ${badge} ${check.name.padEnd(24)} ${check.detail}`);
  }

  lines.push("------------------------------------");
  const overall = report.overallStatus.toUpperCase();
  lines.push(`Overall Status: ${overall} (${report.summary.ok} OK, ${report.summary.warn} WARN, ${report.summary.fail} FAIL)`);

  return lines.join("\n");
}
