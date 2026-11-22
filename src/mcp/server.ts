#!/usr/bin/env node
import { realpath } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { inspectProject } from "../core/project-inspector.js";
import { mapArchitecture } from "../core/architecture-map.js";
import { executeWorkspaceAgentTool } from "../core/workspace-tool-broker.js";
import { createWorkspaceResolver } from "./workspace-path.js";
import { loadPermissionPolicy } from "../core/permission-policy.js";
import { auditProject } from "../core/quality-audit.js";
import { analyzeGitChanges } from "../core/git-intelligence.js";
import { loadAgentRegistry } from "../core/agent-registry.js";
import { createReviewPlan } from "../core/review-planner.js";
import {
  buildAgentEvaluationIntelligence,
  formatAgentEvaluationIntelligence,
} from "../core/agent-evaluation-intelligence.js";
import { listBenchmarkMatrices } from "../core/benchmark-matrix.js";
import { generateProjectHealth } from "../core/project-health.js";
import { analyzeChangeIntelligence } from "../core/change-intelligence.js";
import { generateRemediationPlan } from "../core/remediation-planner.js";
import { buildAgentOptimizationPlan } from "../core/agent-optimization.js";
import { listProjectMemory, buildProjectMemoryContext } from "../core/project-memory.js";
import { auditAgentConfiguration } from "../core/agent-security-audit.js";
import { analyzeDependencyImpact } from "../core/dependency-impact.js";
import { runDoctorChecks } from "../core/doctor.js";
import { cleanProject } from "../core/project-cleaner.js";

const WORKSPACE_ROOT = await realpath(process.env.ANVIL_WORKSPACE ?? process.env.FORGE_WORKSPACE ?? process.cwd());

const resolveWorkspace = createWorkspaceResolver(WORKSPACE_ROOT);

function resolveVersion(): string {
  try {
    const pkgUrl = new URL("../../package.json", import.meta.url);
    const raw = readFileSync(pkgUrl, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.version === "string") return parsed.version;
  } catch {}
  return "0.0.0-unknown";
}

function result(data: unknown, meta?: { compact?: boolean; hint?: string }) {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const raw = JSON.stringify(data);
    const characterCount = raw.length;
    const estimatedTokens = Math.ceil(characterCount / 4);
    const enriched = {
      _meta: {
        characterCount,
        estimatedTokens,
        ...(meta?.compact !== undefined ? { compact: meta.compact } : {}),
        ...(meta?.hint ? { hint: meta.hint } : {}),
      },
      ...(data as Record<string, unknown>),
    };
    return { content: [{ type: "text" as const, text: JSON.stringify(enriched, null, 2) }] };
  }
  const raw = JSON.stringify(data, null, 2);
  const characterCount = raw.length;
  const estimatedTokens = Math.ceil(characterCount / 4);
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            _meta: {
              characterCount,
              estimatedTokens,
              ...(meta?.compact !== undefined ? { compact: meta.compact } : {}),
              ...(meta?.hint ? { hint: meta.hint } : {}),
            },
            data,
          },
          null,
          2
        ),
      },
    ],
  };
}

function failure(error: unknown) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: error instanceof Error ? error.message : "ANVIL tool failed." }],
  };
}

async function auditReadOnlyMcpTool<T>(tool: string, operation: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    const value = await operation();
    process.stderr.write(
      JSON.stringify({
        type: "anvil-tool-audit",
        tool,
        allowed: true,
        outcome: "success",
        at: new Date().toISOString(),
        durationMs: Date.now() - started,
        summary: "Read-only MCP operation completed.",
      }) + String.fromCharCode(10)
    );
    return value;
  } catch (error) {
    process.stderr.write(
      JSON.stringify({
        type: "anvil-tool-audit",
        tool,
        allowed: true,
        outcome: "error",
        at: new Date().toISOString(),
        durationMs: Date.now() - started,
        summary: "Read-only MCP operation failed.",
      }) + String.fromCharCode(10)
    );
    throw error;
  }
}

const server = new McpServer({
  name: "anvil-engineering-workbench",
  version: resolveVersion(),
});

function registerToolWithAlias<T extends z.ZodRawShape>(
  name: string,
  config: {
    title?: string;
    description?: string;
    inputSchema?: z.ZodObject<T>;
  },
  handler: (args: z.infer<z.ZodObject<T>>) => Promise<any>
) {
  const anvilName = name.startsWith("anvil_") ? name : name.replace(/^forge_/, "anvil_");
  const forgeName = name.startsWith("forge_") ? name : name.replace(/^anvil_/, "forge_");
  (server.registerTool as any)(anvilName, config, handler);
  (server.registerTool as any)(forgeName, config, handler);
}

registerToolWithAlias(
  "anvil_inspect_project",
  {
    title: "Inspect project",
    description:
      "Inspect project structure, languages, frameworks, package managers, scripts, and dependencies. Call this first when onboarding to an unfamiliar codebase or checking project stack before running builds or migrations. Does NOT execute project code. Returns compact summary by default; pass detail: true for full manifests.",
    inputSchema: z.object({
      projectPath: z
        .string()
        .optional()
        .describe("Workspace-relative directory. Defaults to the configured workspace root."),
      detail: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "When false (default), returns an executive summary (~500 chars) saving model tokens. Pass true for full dependency manifests and complete script listings."
        ),
    }),
  },
  async ({ projectPath, detail }) => {
    try {
      const root = await resolveWorkspace(projectPath);
      const report = await auditReadOnlyMcpTool("anvil_inspect_project", () => inspectProject(root));
      if (!detail) {
        const summary = {
          root: report.root,
          languages: report.summary.languages,
          filesScanned: report.summary.filesScanned,
          packageManagers: report.packageManagers,
          frameworks: report.frameworks,
          dependencies: report.dependencies,
          scripts: Object.keys(report.scripts),
          importantFiles: report.importantFiles,
          warnings: report.warnings,
        };
        return result(summary, {
          compact: true,
          hint: "Pass detail: true to view full dependency manifests and detailed script definitions.",
        });
      }
      return result(report, { compact: false });
    } catch (error) {
      return failure(error);
    }
  }
);

registerToolWithAlias(
  "anvil_map_architecture",
  {
    title: "Map architecture",
    description:
      "Map project architecture, entry points, module relationships, and external dependencies. Call this BEFORE modifying core architecture, planning refactors, or tracing imports across files instead of manually reading 20+ files. Does NOT execute project code. Returns compact summary by default; pass detail: true for full graph.",
    inputSchema: z.object({
      projectPath: z
        .string()
        .optional()
        .describe("Workspace-relative directory. Defaults to the configured workspace root."),
      detail: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "When false (default), returns high-level module graph summary (~600 chars). Pass true for every node and edge in the project graph."
        ),
    }),
  },
  async ({ projectPath, detail }) => {
    try {
      const root = await resolveWorkspace(projectPath);
      const map = await auditReadOnlyMcpTool("anvil_map_architecture", () => mapArchitecture(root));
      if (!detail) {
        const summary = {
          root: map.root,
          scannedFiles: map.scannedFiles,
          entryPoints: map.entryPoints,
          totalNodes: map.nodes.length,
          totalEdges: map.edges.length,
          externalPackages: map.externalPackages.slice(0, 15),
          sampleModules: map.nodes.slice(0, 10).map((n) => ({ file: n.file, role: n.role, lines: n.lines })),
          warnings: map.warnings,
        };
        return result(summary, {
          compact: true,
          hint: "Pass detail: true to view all file nodes, internal imports, and complete dependency graph.",
        });
      }
      return result(map, { compact: false });
    } catch (error) {
      return failure(error);
    }
  }
);

registerToolWithAlias(
  "anvil_search_code",
  {
    title: "Search code",
    description:
      "Search identifiers, function names, and text in project source code within workspace security boundaries (excludes .env, secrets, node_modules, generated code). Call this for targeted symbol lookups instead of broad recursive greps.",
    inputSchema: z.object({
      query: z.string().min(2).max(120),
      projectPath: z
        .string()
        .optional()
        .describe("Workspace-relative directory. Defaults to the configured workspace root."),
      limit: z.number().int().min(1).max(100).optional(),
    }),
  },
  async ({ query, projectPath, limit }) => {
    try {
      const root = await resolveWorkspace(projectPath);
      const policy = await loadPermissionPolicy(root);
      return result(
        await executeWorkspaceAgentTool(
          root,
          policy,
          "search-code",
          { query, limit: Math.min(limit ?? 10, 20) },
          {
            onAudit: (event) => {
              process.stderr.write(JSON.stringify({ type: "anvil-tool-audit", ...event }) + String.fromCharCode(10));
            },
          }
        )
      );
    } catch (error) {
      return failure(error);
    }
  }
);

registerToolWithAlias(
  "anvil_list_files",
  {
    title: "List workspace files",
    description:
      "Read-only directory listing for supported source and config files (bounded to 200 entries; excludes .git, node_modules, secrets, symlinks). Call this to explore directory structure safely.",
    inputSchema: z.object({
      projectPath: z
        .string()
        .optional()
        .describe("Workspace-relative project directory. Defaults to the configured workspace root."),
      relativePath: z.string().max(500).optional().describe("Directory path relative to the selected project root."),
    }),
  },
  async ({ projectPath, relativePath }) => {
    try {
      const root = await resolveWorkspace(projectPath);
      const policy = await loadPermissionPolicy(root);
      return result(
        await executeWorkspaceAgentTool(
          root,
          policy,
          "list-files",
          { relativePath: relativePath ?? "" },
          {
            onAudit: (event) => {
              process.stderr.write(JSON.stringify({ type: "anvil-tool-audit", ...event }) + String.fromCharCode(10));
            },
          }
        )
      );
    } catch (error) {
      return failure(error);
    }
  }
);

registerToolWithAlias(
  "anvil_read_file",
  {
    title: "Read workspace file",
    description:
      "Read a supported text/source file with security guardrails (rejects files >128 KiB, traversal, secrets, binary). Read-only; does not modify files.",
    inputSchema: z.object({
      projectPath: z
        .string()
        .optional()
        .describe("Workspace-relative project directory. Defaults to the configured workspace root."),
      relativePath: z.string().min(1).max(500).describe("File path relative to the selected project root."),
    }),
  },
  async ({ projectPath, relativePath }) => {
    try {
      const root = await resolveWorkspace(projectPath);
      const policy = await loadPermissionPolicy(root);
      return result(
        await executeWorkspaceAgentTool(
          root,
          policy,
          "read-file",
          { relativePath },
          {
            onAudit: (event) => {
              process.stderr.write(JSON.stringify({ type: "anvil-tool-audit", ...event }) + String.fromCharCode(10));
            },
          }
        )
      );
    } catch (error) {
      return failure(error);
    }
  }
);

registerToolWithAlias(
  "anvil_quality_audit",
  {
    title: "Audit project quality",
    description:
      "Fast, local static quality audit across manifests, test structure, security patterns, and workflow health. Call this before submitting code to catch missing tests, package issues, and configuration bugs without LLM tokens. Returns compact summary by default; pass detail: true for all findings.",
    inputSchema: z.object({
      projectPath: z
        .string()
        .optional()
        .describe("Workspace-relative directory. Defaults to the configured workspace root."),
      detail: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "When false (default), returns score, grade, and top critical/high findings (~500 chars). Pass true for all findings across all severities."
        ),
    }),
  },
  async ({ projectPath, detail }) => {
    try {
      const root = await resolveWorkspace(projectPath);
      const audit = await auditReadOnlyMcpTool("anvil_quality_audit", () => auditProject(root));
      if (!detail) {
        const severityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
        for (const f of audit.findings) {
          severityCounts[f.severity] = (severityCounts[f.severity] ?? 0) + 1;
        }
        const summary = {
          root: audit.root,
          score: audit.score,
          grade: audit.grade,
          coverage: audit.coverage,
          metrics: audit.metrics,
          severityCounts,
          topFindings: audit.findings.filter((f) => f.severity === "critical" || f.severity === "high").slice(0, 5),
          totalFindings: audit.findings.length,
          limitations: audit.limitations,
        };
        return result(summary, {
          compact: true,
          hint: "Pass detail: true to view all findings across medium, low, and info severities.",
        });
      }
      return result(audit, { compact: false });
    } catch (error) {
      return failure(error);
    }
  }
);

registerToolWithAlias(
  "anvil_git_intelligence",
  {
    title: "Analyze Git changes",
    description:
      "Inspect working-tree git diff, uncommitted changes, affected modules, and heuristic commit risk. Call this to check what has changed in the working copy and which tests should be run. Returns compact summary by default; pass detail: true for full blast radius.",
    inputSchema: z.object({
      projectPath: z
        .string()
        .optional()
        .describe("Workspace-relative directory. Defaults to the configured workspace root."),
      base: z.string().min(1).max(120).optional().describe("Base git revision (defaults to 'HEAD')."),
      detail: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "When false (default), returns change counts, risk level, and suggested test targets. Pass true for per-file impact and complete diff breakdown."
        ),
    }),
  },
  async ({ projectPath, base, detail }) => {
    try {
      const root = await resolveWorkspace(projectPath);
      const report = await auditReadOnlyMcpTool("anvil_git_intelligence", () =>
        analyzeGitChanges(root, base ?? "HEAD")
      );
      if (!detail) {
        const summary = {
          root: report.root,
          branch: report.branch,
          base: report.base,
          changedFilesCount: report.changes.length,
          changes: report.changes.slice(0, 15),
          risk: report.risk,
          suggestedTests: report.suggestedTests,
          topImpact: report.impact.slice(0, 10),
          warnings: report.warnings,
        };
        return result(summary, {
          compact: true,
          hint: "Pass detail: true to view all changed files and full impact blast radius.",
        });
      }
      return result(report, { compact: false });
    } catch (error) {
      return failure(error);
    }
  }
);

registerToolWithAlias(
  "anvil_list_agents",
  {
    title: "List specialist agents",
    description:
      "List specialist engineering roles (architecture, reviewer, security, tester, debugger, release) and project-local .anvil/agents definitions. Call this to inspect available specialist personas.",
    inputSchema: z.object({ projectPath: z.string().optional() }),
  },
  async ({ projectPath }) => {
    try {
      const root = await resolveWorkspace(projectPath);
      const agents = await auditReadOnlyMcpTool("anvil_list_agents", () => loadAgentRegistry(root));
      return result(agents.map(({ id, name, description, source }) => ({ id, name, description, source })));
    } catch (error) {
      return failure(error);
    }
  }
);

registerToolWithAlias(
  "anvil_create_review_plan",
  {
    title: "Create engineering review plan",
    description:
      "Create a dependency-aware engineering workflow with architecture, planning, code review, security, performance, debugging, testing, documentation, delivery and release-readiness specialist tasks. This creates a draft only; it does not call an AI provider, modify files, or execute commands.",
    inputSchema: z.object({ goal: z.string().min(5).max(2000) }),
  },
  async ({ goal }) => {
    try {
      return result(createReviewPlan(goal));
    } catch (error) {
      return failure(error);
    }
  }
);

registerToolWithAlias(
  "anvil_agent_intelligence",
  {
    title: "Agent evaluation intelligence",
    description: [
      "Read-only analysis of agent effectiveness across local benchmark history.",
      "Returns per-agent scorecards with score trends, case-level metrics, repeated criterion failure signals, improvement areas, and evidence-backed recommendations.",
      "Use this before editing agent prompts, skills, or configuration to understand what the data says about the agent's current strengths and weaknesses.",
      "Does not execute agents, modify files, or call any AI provider.",
    ].join(" "),
    inputSchema: z.object({
      projectPath: z
        .string()
        .optional()
        .describe(
          "Workspace-relative directory containing the .anvil/benchmark-matrices folder. Defaults to the configured workspace root."
        ),
      suiteId: z.string().optional().describe("Filter to a specific evaluation suite ID. Omit to include all suites."),
      candidateId: z
        .string()
        .optional()
        .describe("Filter to a specific benchmark candidate ID. Omit to include all candidates."),
      limit: z
        .number()
        .int()
        .min(2)
        .max(50)
        .optional()
        .describe(
          "Maximum number of historical runs to analyze (2–50, default 10). Higher values reveal longer-term trends."
        ),
      format: z
        .enum(["json", "text"])
        .optional()
        .describe(
          "Output format. 'json' returns the structured AgentEvaluationIntelligence object; 'text' returns the human-readable formatted report. Defaults to 'json'."
        ),
    }),
  },
  async ({ projectPath, suiteId, candidateId, limit, format }) => {
    try {
      const root = await resolveWorkspace(projectPath);
      return result(
        await auditReadOnlyMcpTool("anvil_agent_intelligence", async () => {
          const history = await listBenchmarkMatrices(root);
          const report = buildAgentEvaluationIntelligence(history, {
            ...(suiteId ? { suiteId } : {}),
            ...(candidateId ? { candidateId } : {}),
            ...(limit !== undefined ? { limit } : {}),
          });
          if (format === "text") {
            return { text: formatAgentEvaluationIntelligence(report) };
          }
          return report;
        })
      );
    } catch (error) {
      return failure(error);
    }
  }
);

registerToolWithAlias(
  "anvil_project_health",
  {
    title: "Project health snapshot",
    description:
      "Generate a unified project health score (0–100), grade (A–F), and evidence-backed breakdowns across languages, tooling, architecture, and static quality.",
    inputSchema: z.object({
      projectPath: z
        .string()
        .optional()
        .describe("Workspace-relative directory. Defaults to the configured workspace root."),
    }),
  },
  async ({ projectPath }) => {
    try {
      const root = await resolveWorkspace(projectPath);
      return result(await auditReadOnlyMcpTool("anvil_project_health", () => generateProjectHealth(root)));
    } catch (error) {
      return failure(error);
    }
  }
);

registerToolWithAlias(
  "anvil_change_risk",
  {
    title: "Change risk intelligence",
    description:
      "Analyze blast radius, downstream dependency impact, structural complexity, and suggested test targets for current git changes. Call this BEFORE committing or creating PRs to identify breaking changes and ensure adequate test coverage. Returns compact summary by default; pass detail: true for complete breakdown.",
    inputSchema: z.object({
      projectPath: z
        .string()
        .optional()
        .describe("Workspace-relative directory. Defaults to the configured workspace root."),
      detail: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "When false (default), returns overall risk score, level, and top high-risk files. Pass true for all changed files and test candidates."
        ),
    }),
  },
  async ({ projectPath, detail }) => {
    try {
      const root = await resolveWorkspace(projectPath);
      const report = await auditReadOnlyMcpTool("anvil_change_risk", () => analyzeChangeIntelligence(root));
      if (!detail) {
        const summary = {
          root: report.root,
          branch: report.branch,
          base: report.base,
          summary: report.summary,
          overallRisk: report.overallRisk,
          topHighRiskChanges: report.changes.filter((c) => c.level === "high" || c.level === "elevated").slice(0, 5),
          warnings: report.warnings,
        };
        return result(summary, {
          compact: true,
          hint: "Pass detail: true to view all changed files, structural scores, and candidate test targets.",
        });
      }
      return result(report, { compact: false });
    } catch (error) {
      return failure(error);
    }
  }
);

registerToolWithAlias(
  "anvil_remediation_plan",
  {
    title: "Dependency remediation plan",
    description:
      "Generate an advisory remediation plan for vulnerable and outdated dependencies with human approval guardrails.",
    inputSchema: z.object({
      projectPath: z
        .string()
        .optional()
        .describe("Workspace-relative directory. Defaults to the configured workspace root."),
    }),
  },
  async ({ projectPath }) => {
    try {
      const root = await resolveWorkspace(projectPath);
      return result(await auditReadOnlyMcpTool("anvil_remediation_plan", () => generateRemediationPlan(root, {})));
    } catch (error) {
      return failure(error);
    }
  }
);

registerToolWithAlias(
  "anvil_agent_optimization",
  {
    title: "Agent optimization recommendations",
    description:
      "Analyze historical benchmark matrices to generate advisory suggestions and checklists for tuning agent prompts and skills.",
    inputSchema: z.object({
      projectPath: z
        .string()
        .optional()
        .describe("Workspace-relative directory. Defaults to the configured workspace root."),
    }),
  },
  async ({ projectPath }) => {
    try {
      const root = await resolveWorkspace(projectPath);
      return result(
        await auditReadOnlyMcpTool("anvil_agent_optimization", async () => {
          const matrices = await listBenchmarkMatrices(root);
          return buildAgentOptimizationPlan(matrices);
        })
      );
    } catch (error) {
      return failure(error);
    }
  }
);

registerToolWithAlias(
  "anvil_project_memory",
  {
    title: "Read project memory",
    description:
      "Read-only access to saved project decisions, architecture notes, constraints, and preferences within a token budget. Does not reveal secrets or modify memory.",
    inputSchema: z.object({
      projectPath: z
        .string()
        .optional()
        .describe("Workspace-relative directory. Defaults to the configured workspace root."),
      query: z.string().optional().describe("Optional query or task goal to retrieve relevant contextual notes."),
      maxTokens: z
        .number()
        .int()
        .min(100)
        .max(8000)
        .optional()
        .describe("Token budget for retrieved memory context (default 1200)."),
    }),
  },
  async ({ projectPath, query, maxTokens }) => {
    try {
      const root = await resolveWorkspace(projectPath);
      return result(
        await auditReadOnlyMcpTool("anvil_project_memory", async () => {
          if (query) {
            return { context: await buildProjectMemoryContext(root, query, maxTokens ?? 1200) };
          }
          return { entries: await listProjectMemory(root) };
        })
      );
    } catch (error) {
      return failure(error);
    }
  }
);

registerToolWithAlias(
  "anvil_agent_security_audit",
  {
    title: "Audit agent security configuration",
    description:
      "Audit workspace agent instructions, skills, lifecycle hooks, and permission policies for secret leakage, prompt injection risks, and excessive permissions.",
    inputSchema: z.object({
      projectPath: z
        .string()
        .optional()
        .describe("Workspace-relative directory. Defaults to the configured workspace root."),
    }),
  },
  async ({ projectPath }) => {
    try {
      const root = await resolveWorkspace(projectPath);
      return result(await auditReadOnlyMcpTool("anvil_agent_security_audit", () => auditAgentConfiguration(root)));
    } catch (error) {
      return failure(error);
    }
  }
);

registerToolWithAlias(
  "anvil_dependency_impact",
  {
    title: "Analyze dependency impact",
    description:
      "Analyze dependency manifest changes, undeclared package imports, and transitive file impact against a git base revision.",
    inputSchema: z.object({
      projectPath: z
        .string()
        .optional()
        .describe("Workspace-relative directory. Defaults to the configured workspace root."),
      base: z.string().min(1).max(120).optional().describe("Base git revision (defaults to 'HEAD')."),
    }),
  },
  async ({ projectPath, base }) => {
    try {
      const root = await resolveWorkspace(projectPath);
      return result(
        await auditReadOnlyMcpTool("anvil_dependency_impact", () => analyzeDependencyImpact(root, base ?? "HEAD"))
      );
    } catch (error) {
      return failure(error);
    }
  }
);

registerToolWithAlias(
  "anvil_security_audit",
  {
    title: "Audit repository security & secrets",
    description:
      "Deep scan repository for hardcoded secrets, API keys, sensitive tokens, and dangerous script patterns. Call this BEFORE pushing code or making public releases to guarantee no credentials leak. Returns compact summary by default; pass detail: true for snippets and evidence.",
    inputSchema: z.object({
      projectPath: z
        .string()
        .optional()
        .describe("Workspace-relative directory. Defaults to the configured workspace root."),
      detail: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "When false (default), returns scan summary and critical/high secrets. Pass true for all findings and code snippets."
        ),
    }),
  },
  async ({ projectPath, detail }) => {
    try {
      const root = await resolveWorkspace(projectPath);
      const { scanProjectSecurity } = await import("../core/security-scanner.js");
      const report = await auditReadOnlyMcpTool("anvil_security_audit", () => scanProjectSecurity(root));
      if (!detail) {
        const summary = {
          scannedFiles: report.scannedFiles,
          durationMs: report.durationMs,
          summary: report.summary,
          passed: report.passed,
          topFindings: report.findings.filter((f) => f.severity === "critical" || f.severity === "high").slice(0, 5),
        };
        return result(summary, {
          compact: true,
          hint: "Pass detail: true to view all security findings, line numbers, and snippet evidence.",
        });
      }
      return result(report, { compact: false });
    } catch (error) {
      return failure(error);
    }
  }
);

for (const name of ["forge_doctor", "anvil_doctor"] as const) {
  server.registerTool(
    name,
    {
      title: "Run diagnostic system and workspace health checks",
      description:
        "Run comprehensive diagnostic checks on Node.js runtime, Git CLI, Docker daemon, provider credentials, and workspace configuration.",
      inputSchema: z.object({
        projectPath: z
          .string()
          .optional()
          .describe("Workspace-relative directory. Defaults to the configured workspace root."),
      }),
    },
    async ({ projectPath }) => {
      try {
        const root = await resolveWorkspace(projectPath);
        return result(await auditReadOnlyMcpTool(name, () => runDoctorChecks(root)));
      } catch (error) {
        return failure(error);
      }
    }
  );
}

for (const name of ["forge_clean_preview", "anvil_clean_preview"] as const) {
  server.registerTool(
    name,
    {
      title: "Preview workspace cleanup and dead code",
      description:
        "Perform a safe, read-only dry-run scan to identify junk files, cache files, build artifacts, temporary downloads, and unreferenced orphan source modules. Call this before releases or repo cleanup. Returns compact summary by default; pass detail: true for itemized list.",
      inputSchema: z.object({
        projectPath: z
          .string()
          .optional()
          .describe("Workspace-relative directory. Defaults to the configured workspace root."),
        includeOrphans: z
          .boolean()
          .optional()
          .describe("Scan and flag unreferenced source files across TypeScript, Python, Rust, Go, Java, and C/C++."),
        detail: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "When false (default), returns reclaimable byte counts and category totals. Pass true for itemized list of every removable file."
          ),
      }),
    },
    async ({ projectPath, includeOrphans, detail }) => {
      try {
        const root = await resolveWorkspace(projectPath);
        const preview = await auditReadOnlyMcpTool(name, () =>
          cleanProject(root, { apply: false, checkOrphans: includeOrphans ?? true })
        );
        if (!detail) {
          const summary = {
            root: preview.root,
            dryRun: preview.dryRun,
            stats: preview.stats,
            orphanFilesCount: preview.orphanFiles.length,
            junkCategories: preview.junkItems.reduce(
              (acc, item) => {
                acc[item.category] = (acc[item.category] ?? 0) + 1;
                return acc;
              },
              {} as Record<string, number>
            ),
            warnings: preview.warnings,
          };
          return result(summary, {
            compact: true,
            hint: "Pass detail: true to view the complete list of files identified for cleanup.",
          });
        }
        return result(preview, { compact: false });
      } catch (error) {
        return failure(error);
      }
    }
  );
}

const transport = new StdioServerTransport();
await server.connect(transport);
