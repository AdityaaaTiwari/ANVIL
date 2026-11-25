import { execFile } from "node:child_process";
import { lstat, mkdir, writeFile } from "node:fs/promises";
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

export interface DoctorFixResult {
  root: string;
  repaired: string[];
  warnings: string[];
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

        // Check .anvil / .forge
        let configFound = false;
        try {
          const anvilStat = await lstat(path.join(resolved, ".anvil"));
          if (anvilStat.isDirectory()) configFound = true;
        } catch {}
        try {
          const forgeStat = await lstat(path.join(resolved, ".forge"));
          if (forgeStat.isDirectory()) configFound = true;
        } catch {}

        if (configFound) {
          checks.push({
            name: "ANVIL configuration",
            status: "ok",
            detail: ".anvil (or legacy .forge) directory detected.",
          });
        } else {
          checks.push({
            name: "ANVIL configuration",
            status: "warn",
            detail: "No .anvil directory found. Run 'anvil init' or 'anvil doctor --fix' to configure this project.",
          });
        }

        // Check dist in node projects
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
    ok: checks.filter((c) => c.status === "ok").length,
    warn: checks.filter((c) => c.status === "warn").length,
    fail: checks.filter((c) => c.status === "fail").length,
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

export async function fixDoctorIssues(projectPath?: string): Promise<DoctorFixResult> {
  const root = path.resolve(projectPath ?? ".");
  const repaired: string[] = [];
  const warnings: string[] = [];

  // 1. Scaffold .anvil workspace directories if missing
  const anvilDir = path.join(root, ".anvil");
  const forgeDir = path.join(root, ".forge");
  try {
    let hasAnvil = false;
    try {
      hasAnvil = (await lstat(anvilDir)).isDirectory();
    } catch {}
    let hasForge = false;
    try {
      hasForge = (await lstat(forgeDir)).isDirectory();
    } catch {}

    if (!hasAnvil && !hasForge) {
      await mkdir(path.join(anvilDir, "agents"), { recursive: true });
      await mkdir(path.join(anvilDir, "skills"), { recursive: true });
      await mkdir(path.join(anvilDir, "workflows"), { recursive: true });
      repaired.push(
        "Scaffolded .anvil/ workspace configuration directories (.anvil/agents, .anvil/skills, .anvil/workflows)."
      );
    }
  } catch (err: any) {
    warnings.push(`Could not initialize .anvil directory: ${err?.message || String(err)}`);
  }

  // 2. Scaffold .gitignore if missing
  const gitignorePath = path.join(root, ".gitignore");
  try {
    let gitignoreExists = false;
    try {
      gitignoreExists = (await lstat(gitignorePath)).isFile();
    } catch {}
    if (!gitignoreExists) {
      const standardGitignore = `# OS Clutter
.DS_Store
Thumbs.db
desktop.ini

# Environment and secrets
.env
.env.*
!.env.example

# Logs and debug
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# Node
node_modules/
dist/
coverage/

# Python
__pycache__/
*.py[cod]
*$py.class
.pytest_cache/
.venv/
env/

# Rust / C
target/
*.o
*.obj

# ANVIL local state
.anvil/
.forge/
`;
      await writeFile(gitignorePath, standardGitignore, "utf8");
      repaired.push("Created comprehensive multi-language .gitignore file.");
    }
  } catch (err: any) {
    warnings.push(`Could not create .gitignore: ${err?.message || String(err)}`);
  }

  // 3. Scaffold .env.example if missing
  const envExamplePath = path.join(root, ".env.example");
  try {
    let envExampleExists = false;
    try {
      envExampleExists = (await lstat(envExamplePath)).isFile();
    } catch {}
    if (!envExampleExists) {
      const template = `# ANVIL AI Provider Credentials (Example template)
# Copy to .env and configure your local keys

OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
`;
      await writeFile(envExamplePath, template, "utf8");
      repaired.push("Scaffolded safe .env.example template for AI provider credentials.");
    }
  } catch (err: any) {
    warnings.push(`Could not create .env.example: ${err?.message || String(err)}`);
  }

  // 4. Git repository initialization if git CLI is present but .git is missing
  const gitDir = path.join(root, ".git");
  try {
    let isGitRepo = false;
    try {
      isGitRepo = (await lstat(gitDir)).isDirectory();
    } catch {}
    if (!isGitRepo) {
      try {
        await execFileAsync("git", ["init"], { cwd: root, timeout: 5000 });
        repaired.push("Initialized fresh Git repository (git init).");
      } catch (err: any) {
        warnings.push(`Could not run git init: ${err?.message || String(err)}`);
      }
    }
  } catch {}

  // 5. Build project if package.json exists and dist/ is missing
  try {
    const pkgPath = path.join(root, "package.json");
    const distPath = path.join(root, "dist");
    let hasPkg = false;
    try {
      hasPkg = (await lstat(pkgPath)).isFile();
    } catch {}
    let hasDist = false;
    try {
      hasDist = (await lstat(distPath)).isDirectory();
    } catch {}

    if (hasPkg && !hasDist) {
      try {
        const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
        await execFileAsync(npmCmd, ["run", "build"], { cwd: root, timeout: 30000 });
        repaired.push("Compiled build artifacts (npm run build -> dist/).");
      } catch (err: any) {
        warnings.push(`Could not auto-compile dist/: ${err?.message || String(err)}`);
      }
    }
  } catch {}

  return { root, repaired, warnings };
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push("ANVIL Doctor — System Health Check");
  lines.push("====================================");

  for (const check of report.checks) {
    const badge = check.status === "ok" ? "[OK]  " : check.status === "warn" ? "[WARN]" : "[FAIL]";
    lines.push(`  ${badge} ${check.name.padEnd(24)} ${check.detail}`);
  }

  lines.push("------------------------------------");
  const overall = report.overallStatus.toUpperCase();
  lines.push(
    `Overall Status: ${overall} (${report.summary.ok} OK, ${report.summary.warn} WARN, ${report.summary.fail} FAIL)`
  );

  return lines.join("\n");
}
