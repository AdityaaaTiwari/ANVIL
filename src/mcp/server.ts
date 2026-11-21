#!/usr/bin/env node
import { realpath } from "node:fs/promises";
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
function result(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function failure(error: unknown) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: error instanceof Error ? error.message : "FORGE tool failed." }],
  };
}

async function auditReadOnlyMcpTool<T>(tool: string, operation: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    const value = await operation();
    process.stderr.write(
      JSON.stringify({
        type: "forge-tool-audit",
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
        type: "forge-tool-audit",
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
  version: "1.1.1",
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
      "Read-only inventory of a project: languages, frameworks, package managers, scripts, dependencies and detected warnings. Does not execute project code.",
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
      return result(await auditReadOnlyMcpTool("anvil_inspect_project", () => inspectProject(root)));
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
      "Read-only map of source files, internal imports, entry points and external packages. Does not execute project code.",
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
      return result(await auditReadOnlyMcpTool("anvil_map_architecture", () => mapArchitecture(root)));
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
      "Search source identifiers and text in a project. Secret-like filenames, hidden directories, dependencies and generated output are excluded by the underlying scanner.",
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
              process.stderr.write(JSON.stringify({ type: "forge-tool-audit", ...event }) + String.fromCharCode(10));
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
      "Read-only directory listing for supported source and documentation files. Hidden paths, secrets, dependencies, generated folders and symlinks are excluded. Results are bounded to 200 entries.",
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
              process.stderr.write(JSON.stringify({ type: "forge-tool-audit", ...event }) + String.fromCharCode(10));
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
      "Read a supported text/source file inside the selected project. Rejects traversal, symlinks, secret-like filenames, binary content and files larger than 128 KiB. Read-only; does not modify files.",
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
              process.stderr.write(JSON.stringify({ type: "forge-tool-audit", ...event }) + String.fromCharCode(10));
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
      "Run FORGE's static, heuristic project-quality checks and return evidence-backed findings. Does not inspect secret contents, execute project code, or query vulnerability databases.",
    inputSchema: z.object({ projectPath: z.string().optional() }),
  },
  async ({ projectPath }) => {
    try {
      const root = await resolveWorkspace(projectPath);
      return result(await auditReadOnlyMcpTool("anvil_quality_audit", () => auditProject(root)));
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
      "Read-only analysis of working-tree changes, static downstream impact, suggested test targets and heuristic change risk. Runs Git inspection commands only; it does not modify the repository or execute project scripts.",
    inputSchema: z.object({
      projectPath: z.string().optional(),
      base: z.string().min(1).max(120).optional(),
    }),
  },
  async ({ projectPath, base }) => {
    try {
      const root = await resolveWorkspace(projectPath);
      return result(
        await auditReadOnlyMcpTool("anvil_git_intelligence", () => analyzeGitChanges(root, base ?? "HEAD"))
      );
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
      "List built-in FORGE specialist roles and project-local .forge/agents definitions. Agent markdown is treated as untrusted project content.",
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
          "Workspace-relative directory containing the .forge/benchmark-matrices folder. Defaults to the configured workspace root."
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
      "Analyze working-tree changed files, blast radius, structural complexity hotspots, and candidate test targets.",
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
      return result(await auditReadOnlyMcpTool("anvil_change_risk", () => analyzeChangeIntelligence(root)));
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
      "Deep scan repository for hardcoded secrets, API keys, sensitive tokens, and dangerous script patterns.",
    inputSchema: z.object({ projectPath: z.string().optional() }),
  },
  async ({ projectPath }) => {
    try {
      const root = await resolveWorkspace(projectPath);
      const { scanProjectSecurity } = await import("../core/security-scanner.js");
      return result(await auditReadOnlyMcpTool("anvil_security_audit", () => scanProjectSecurity(root)));
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
        "Perform a safe, read-only dry-run scan to identify junk files, cache files, build artifacts, temporary downloads, and unreferenced orphan source modules.",
      inputSchema: z.object({
        projectPath: z
          .string()
          .optional()
          .describe("Workspace-relative directory. Defaults to the configured workspace root."),
        includeOrphans: z
          .boolean()
          .optional()
          .describe("Scan and flag unreferenced source files across TypeScript, Python, Rust, Go, Java, and C/C++."),
      }),
    },
    async ({ projectPath, includeOrphans }) => {
      try {
        const root = await resolveWorkspace(projectPath);
        return result(
          await auditReadOnlyMcpTool(name, () =>
            cleanProject(root, { apply: false, checkOrphans: includeOrphans ?? true })
          )
        );
      } catch (error) {
        return failure(error);
      }
    }
  );
}

const transport = new StdioServerTransport();
await server.connect(transport);
