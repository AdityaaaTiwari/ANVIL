import { afterEach, describe, expect, it } from "vitest";
import { safeRm } from "./test-helpers.js";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";

let workspace = "";
let child: ChildProcessWithoutNullStreams | undefined;

afterEach(async () => {
  if (child && child.exitCode === null) {
    try {
      child.kill("SIGKILL");
    } catch {
      child.kill();
    }
  }
  child = undefined;
  if (workspace) await safeRm(workspace);
  workspace = "";
});

describe("ANVIL MCP stdio protocol integration", () => {
  it("lists tools, serves a read-only workspace call, and rejects traversal over JSON-RPC", async () => {
    workspace = await mkdtemp(path.join(os.tmpdir(), "anvil-mcp-protocol-"));
    await mkdir(path.join(workspace, "src"));
    await writeFile(path.join(workspace, "package.json"), JSON.stringify({ name: "mcp-fixture", scripts: {} }));
    await writeFile(path.join(workspace, "src", "index.ts"), "export const answer = 42;\n");
    await mkdir(path.join(workspace, ".anvil"));
    await writeFile(
      path.join(workspace, ".anvil", "permissions.json"),
      JSON.stringify({
        version: 1,
        mode: "restricted",
        allowedTools: ["list-files", "read-file", "search-code"],
      })
    );
    await writeFile(path.join(workspace, ".env"), "MCP_SENTINEL=must-not-be-listed\n");

    child = spawn(process.execPath, ["--import", "tsx", "src/mcp/server.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, ANVIL_WORKSPACE: workspace },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const pending = new Map<number, (message: any) => void>();
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      let message: any;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      if (typeof message.id === "number") {
        const resolve = pending.get(message.id);
        if (resolve) {
          pending.delete(message.id);
          resolve(message);
        }
      }
    });

    let nextId = 1;
    const request = (method: string, params: unknown = {}) => {
      const id = nextId++;
      return new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Timed out waiting for MCP response to ${method}`));
        }, 10_000);
        pending.set(id, (message) => {
          clearTimeout(timeout);
          resolve(message);
        });
        child!.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      });
    };
    const notify = (method: string, params: unknown = {}) => {
      child!.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
    };

    const initialized = await request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "anvil-mcp-integration-test", version: "1.0.0" },
    });
    expect(initialized.error).toBeUndefined();
    expect(initialized.result?.serverInfo?.name).toBe("anvil-engineering-workbench");
    notify("notifications/initialized");

    const listed = await request("tools/list");
    expect(listed.error).toBeUndefined();
    expect(listed.result.tools.length).toBeGreaterThanOrEqual(25);
    for (const tool of listed.result.tools as Array<{ name: string; annotations?: Record<string, unknown> }>) {
      expect(tool.annotations, `${tool.name} missing required MCP directory hints`).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
    }
    const toolNames = listed.result.tools.map((tool: { name: string }) => tool.name);
    expect(toolNames.some((name: string) => name.startsWith("forge_"))).toBe(false);
    expect(toolNames).toContain("anvil_list_files");
    expect(toolNames).toContain("anvil_create_review_plan");
    expect(toolNames).toContain("anvil_agent_intelligence");
    expect(toolNames).toContain("anvil_project_health");
    expect(toolNames).toContain("anvil_change_risk");
    expect(toolNames).toContain("anvil_remediation_plan");
    expect(toolNames).toContain("anvil_agent_optimization");
    expect(toolNames).toContain("anvil_project_memory");
    expect(toolNames).toContain("anvil_agent_security_audit");
    expect(toolNames).toContain("anvil_dependency_impact");
    expect(toolNames).toContain("anvil_binary_intelligence");
    expect(toolNames).toContain("anvil_supply_chain_audit");
    expect(toolNames).toContain("anvil_call_graph");
    expect(toolNames).toContain("anvil_jit_skills");
    expect(toolNames).toContain("anvil_doctor");
    expect(toolNames).toContain("anvil_clean_preview");

    const jitCall = await request("tools/call", {
      name: "anvil_jit_skills",
      arguments: { prompt: "Inspect binary provenance and verify supply chain hashes", maxTokens: 500 },
    });
    expect(jitCall.error).toBeUndefined();
    expect(jitCall.result?.isError).not.toBe(true);
    const jitText = jitCall.result.content.find((part: { type: string }) => part.type === "text")?.text ?? "";
    expect(jitText).toContain('"withinBudget": true');

    const supplyChainCall = await request("tools/call", {
      name: "anvil_supply_chain_audit",
      arguments: {},
    });
    expect(supplyChainCall.error).toBeUndefined();
    expect(supplyChainCall.result?.isError).not.toBe(true);
    const scText = supplyChainCall.result.content.find((part: { type: string }) => part.type === "text")?.text ?? "";
    expect(scText).toContain('"grade":');

    const agentIntel = await request("tools/call", {
      name: "anvil_agent_intelligence",
      arguments: {},
    });
    expect(agentIntel.error).toBeUndefined();
    expect(agentIntel.result?.isError).not.toBe(true);
    const agentIntelText = agentIntel.result.content.find((part: { type: string }) => part.type === "text")?.text ?? "";
    expect(agentIntelText).toContain('"status": "insufficient-data"');

    const listing = await request("tools/call", {
      name: "anvil_list_files",
      arguments: {},
    });
    expect(listing.error).toBeUndefined();
    expect(listing.result?.isError).not.toBe(true);
    const listingText = listing.result.content.find((part: { type: string }) => part.type === "text")?.text ?? "";
    expect(listingText).toContain('"name": "src"');
    expect(listingText).not.toContain(".env");
    expect(listingText).not.toContain("MCP_SENTINEL");

    const sourceListing = await request("tools/call", {
      name: "anvil_list_files",
      arguments: { relativePath: "src" },
    });
    expect(sourceListing.result?.isError).not.toBe(true);
    const sourceListingText =
      sourceListing.result.content.find((part: { type: string }) => part.type === "text")?.text ?? "";
    expect(sourceListingText).toContain("src/index.ts");

    const read = await request("tools/call", {
      name: "anvil_read_file",
      arguments: { relativePath: "src/index.ts" },
    });
    expect(read.result?.isError).not.toBe(true);
    const readText = read.result.content.find((part: { type: string }) => part.type === "text")?.text ?? "";
    expect(readText).toContain("export const answer = 42");

    const search = await request("tools/call", {
      name: "anvil_search_code",
      arguments: { query: "answer" },
    });
    expect(search.result?.isError).not.toBe(true);
    const searchText = search.result.content.find((part: { type: string }) => part.type === "text")?.text ?? "";
    expect(searchText).toContain("src/index.ts");
    expect(searchText).toContain("answer");

    const compactMap = await request("tools/call", {
      name: "anvil_map_architecture",
      arguments: {},
    });
    expect(compactMap.result?.isError).not.toBe(true);
    const compactMapText = compactMap.result.content.find((part: { type: string }) => part.type === "text")?.text ?? "";
    const parsedCompact = JSON.parse(compactMapText);
    expect(parsedCompact._meta).toBeDefined();
    expect(parsedCompact._meta.compact).toBe(true);
    expect(typeof parsedCompact._meta.characterCount).toBe("number");
    expect(typeof parsedCompact._meta.estimatedTokens).toBe("number");
    expect(parsedCompact.totalNodes).toBeDefined();

    const detailMap = await request("tools/call", {
      name: "anvil_map_architecture",
      arguments: { detail: true },
    });
    expect(detailMap.result?.isError).not.toBe(true);
    const detailMapText = detailMap.result.content.find((part: { type: string }) => part.type === "text")?.text ?? "";
    const parsedDetail = JSON.parse(detailMapText);
    expect(parsedDetail._meta).toBeDefined();
    expect(parsedDetail._meta.compact).toBe(false);
    expect(Array.isArray(parsedDetail.nodes)).toBe(true);

    const denied = await request("tools/call", {
      name: "anvil_list_files",
      arguments: { projectPath: "../outside" },
    });
    expect(denied.error).toBeUndefined();
    expect(denied.result?.isError).toBe(true);
    expect(denied.result.content[0].text).toMatch(/outside|workspace-relative/i);

    child!.stdin.end();
    lines.close();
  });
});
