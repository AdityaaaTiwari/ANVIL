import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { formatArchitectureMap, mapArchitecture } from "../src/core/architecture-map.js";

describe("mapArchitecture", () => {
  let root = "";
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    root = "";
  });

  it("excludes source files inside hidden and private configuration directories", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "anvil-map-private-"));
    await mkdir(path.join(root, "src"), { recursive: true });
    await mkdir(path.join(root, ".anvil", "agents"), { recursive: true });
    await mkdir(path.join(root, ".ssh"), { recursive: true });
    await writeFile(path.join(root, "src", "main.ts"), "export const visible = true;");
    await writeFile(path.join(root, ".anvil", "agents", "private.ts"), "export const privateAgent = true;");
    await writeFile(path.join(root, ".ssh", "helper.ts"), "export const privateHelper = true;");

    const result = await mapArchitecture(root);
    expect(result.nodes.map((node) => node.file)).toEqual(["src/main.ts"]);
    expect(JSON.stringify(result)).not.toContain("privateAgent");
    expect(JSON.stringify(result)).not.toContain("privateHelper");
  });

  it("maps relative imports and identifies likely entry points", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "anvil-map-"));
    await mkdir(path.join(root, "src", "lib"), { recursive: true });
    await writeFile(path.join(root, "src", "main.ts"), 'import { add } from "./lib/math";\nconsole.log(add(1, 2));');
    await writeFile(path.join(root, "src", "lib", "math.ts"), "export const add = (a: number, b: number) => a + b;");
    await writeFile(path.join(root, "package.json"), JSON.stringify({ dependencies: {} }));

    const result = await mapArchitecture(root);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toContainEqual({ from: "src/main.ts", to: "src/lib/math.ts", kind: "internal" });
    expect(result.entryPoints).toContain("src/main.ts");
    expect(formatArchitectureMap(result)).toContain("# ANVIL Architecture Map");
  });

  it("maps multi-language architectures (Python, Rust, C/C++)", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "anvil-map-multilang-"));
    await mkdir(path.join(root, "app"), { recursive: true });
    await mkdir(path.join(root, "rust_src"), { recursive: true });
    await mkdir(path.join(root, "c_src"), { recursive: true });

    // Python files
    await writeFile(path.join(root, "app", "main.py"), "from .service import process\nprint(process())");
    await writeFile(path.join(root, "app", "service.py"), "def process(): return 42");

    // Rust files
    await writeFile(path.join(root, "rust_src", "main.rs"), "mod helper;\nfn main() {}");
    await writeFile(path.join(root, "rust_src", "helper.rs"), "pub fn help() {}");

    // C files
    await writeFile(path.join(root, "c_src", "main.c"), '#include "header.h"\nint main() { return 0; }');
    await writeFile(path.join(root, "c_src", "header.h"), "void helper(void);");

    const result = await mapArchitecture(root);
    expect(result.nodes.length).toBe(6);

    // Verify Python relationship
    expect(result.edges).toContainEqual({ from: "app/main.py", to: "app/service.py", kind: "internal" });

    // Verify Rust relationship
    expect(result.edges).toContainEqual({ from: "rust_src/main.rs", to: "rust_src/helper.rs", kind: "internal" });

    // Verify C relationship
    expect(result.edges).toContainEqual({ from: "c_src/main.c", to: "c_src/header.h", kind: "internal" });

    // Verify entry points
    expect(result.entryPoints).toContain("app/main.py");
    expect(result.entryPoints).toContain("rust_src/main.rs");
    expect(result.entryPoints).toContain("c_src/main.c");
  });
});
