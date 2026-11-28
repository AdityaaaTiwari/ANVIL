import { mkdir, mkdtemp, readdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startDashboard, type DashboardHandle } from "../src/core/dashboard-server.js";
import { listAppCandidates, safeUploadName } from "../src/core/dashboard/app-routes.js";
import { safeRm } from "./test-helpers.js";

let root = "";
let outside = "";
let dashboard: DashboardHandle | undefined;

afterEach(async () => {
  if (dashboard) await new Promise<void>((resolve) => dashboard!.server.close(() => resolve()));
  dashboard = undefined;
  if (root) await safeRm(root);
  if (outside) await safeRm(outside);
  root = "";
  outside = "";
});

const FAKE_AWS = "AKIA" + "QRSTUVWXYZ234567";
const WASM = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

async function start(): Promise<string> {
  dashboard = await startDashboard({ projectPath: root, port: 0 });
  const address = dashboard.server.address();
  if (!address || typeof address === "string") throw new Error("Dashboard did not bind a TCP port.");
  return `http://127.0.0.1:${address.port}`;
}

async function tempDir(name: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), `anvil-dash-app-${name}-`));
}

describe("dashboard app inspector routes", () => {
  it("lists app files in the workspace and skips node_modules", async () => {
    root = await tempDir("list");
    await mkdir(path.join(root, "build", "outputs"), { recursive: true });
    await mkdir(path.join(root, "node_modules", "pkg"), { recursive: true });
    await writeFile(path.join(root, "build", "outputs", "app.wasm"), WASM);
    await writeFile(path.join(root, "build", "outputs", "bundle.js.map"), "{}");
    await writeFile(path.join(root, "node_modules", "pkg", "addon.node"), "x");
    await writeFile(path.join(root, "README.md"), "hi");
    const candidates = await listAppCandidates(root);
    expect(candidates.map((c) => c.path)).toEqual(["build/outputs/app.wasm", "build/outputs/bundle.js.map"]);
  });

  it("inspects a workspace file by path without exposing absolute paths", async () => {
    root = await tempDir("inspect");
    await writeFile(path.join(root, "mod.wasm"), WASM);
    const base = await start();
    const list = await (await fetch(`${base}/api/app/candidates`)).json();
    expect(list.candidates).toEqual([{ path: "mod.wasm", sizeBytes: WASM.length }]);
    const response = await fetch(`${base}/api/app/inspect?path=mod.wasm`);
    const report = await response.json();
    expect(response.status).toBe(200);
    expect(report).toMatchObject({ file: "mod.wasm", kind: "wasm" });
    expect(JSON.stringify(report)).not.toContain(root);
  });

  it("refuses paths that leave the workspace, including through symlinks", async () => {
    root = await tempDir("escape");
    outside = await tempDir("outside");
    await writeFile(path.join(outside, "secret.wasm"), WASM);
    const base = await start();
    const traversal = await fetch(
      `${base}/api/app/inspect?path=${encodeURIComponent("../" + path.basename(outside) + "/secret.wasm")}`
    );
    expect(traversal.status).toBe(422);
    expect((await traversal.json()).error).toContain("inside the workspace");
    try {
      await symlink(path.join(outside, "secret.wasm"), path.join(root, "link.wasm"));
    } catch {
      return; // symlinks need extra rights on some Windows runners
    }
    const viaLink = await fetch(`${base}/api/app/inspect?path=link.wasm`);
    expect(viaLink.status).toBe(422);
  });

  it("inspects an uploaded file and deletes the temporary copy", async () => {
    root = await tempDir("upload");
    const base = await start();
    const before = new Set((await readdir(os.tmpdir())).filter((n) => n.startsWith("anvil-app-upload-")));
    const response = await fetch(`${base}/api/app/upload`, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-anvil-upload": "1",
        "x-anvil-filename": encodeURIComponent("../../evil dir/bundle.js"),
      },
      body: `const key = "${FAKE_AWS}";\n`,
    });
    const report = await response.json();
    expect(response.status).toBe(200);
    expect(report.file).toBe("bundle.js");
    expect(report.findings.map((f: { ruleId: string }) => f.ruleId)).toContain("ANVIL-APP-SECRET-AWS");
    expect(JSON.stringify(report)).not.toContain(FAKE_AWS);
    const after = (await readdir(os.tmpdir())).filter((n) => n.startsWith("anvil-app-upload-") && !before.has(n));
    expect(after).toEqual([]);
  });

  it("rejects cross-site or malformed uploads", async () => {
    root = await tempDir("reject");
    const base = await start();
    const send = (headers: Record<string, string>, body = "x") =>
      fetch(`${base}/api/app/upload`, { method: "POST", headers, body });
    const okHeaders = { "content-type": "application/octet-stream", "x-anvil-upload": "1" };
    expect((await send({ ...okHeaders, origin: "https://evil.example" })).status).toBe(403);
    expect((await send({ "content-type": "application/octet-stream" })).status).toBe(403);
    expect((await send({ ...okHeaders, "content-type": "text/plain" })).status).toBe(415);
    expect((await send(okHeaders, "")).status).toBe(400);
    const unknown = await send({ ...okHeaders, "x-anvil-filename": "notes.txt" }, "plain text");
    expect(unknown.status).toBe(422);
  });

  it("keeps only a safe base name from the filename header", () => {
    expect(safeUploadName("..%2F..%2Fetc%2Fpasswd")).toBe("passwd");
    expect(safeUploadName("C:\\Users\\me\\app release.apk")).toBe("app_release.apk");
    expect(safeUploadName(undefined)).toBe("upload.bin");
    expect(safeUploadName("%E0%A4")).toBe("_E0_A4");
  });

  it("adds the Inspect an App panel to the dashboard page", async () => {
    root = await tempDir("page");
    const base = await start();
    const html = await (await fetch(`${base}/`)).text();
    expect(html).toContain('id="appDropZone"');
    expect(html).toContain("/api/app/upload");
  });
});
