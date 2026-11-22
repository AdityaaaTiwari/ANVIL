import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

describe("README and package version/tool synchronization", () => {
  it("synchronizes README install tags with package.json version", async () => {
    const pkgRaw = await readFile(path.resolve("package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw);
    const expectedTag = `v${pkg.version}`;

    const readme = await readFile(path.resolve("README.md"), "utf8");

    // Must not contain outdated #v1.0.7 install tags
    expect(readme).not.toContain("ANVIL.git#v1.0.7");
    expect(readme).not.toContain("anvil-workbench/ANVIL@v1.0.7");

    // Must contain current version tag in install guides
    expect(readme).toContain(`ANVIL.git#${expectedTag}`);
  });

  it("synchronizes action.yml default version with package.json version", async () => {
    const pkgRaw = await readFile(path.resolve("package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw);
    const expectedTag = `v${pkg.version}`;

    const actionRaw = await readFile(path.resolve("action.yml"), "utf8");
    expect(actionRaw).toContain(`default: ${expectedTag}`);
  });

  it("synchronizes CHANGELOG.md and public/index.html with package.json version", async () => {
    const pkgRaw = await readFile(path.resolve("package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw);

    const changelog = await readFile(path.resolve("CHANGELOG.md"), "utf8");
    expect(changelog).toContain(`## ${pkg.version}`);

    const indexHtml = await readFile(path.resolve("public/index.html"), "utf8");
    expect(indexHtml).toContain(`v${pkg.version}`);
  });

  it("ensures MCP tools documented in README match lowercase anvil_ naming convention", async () => {
    const readme = await readFile(path.resolve("README.md"), "utf8");

    // Must not contain uppercase ANVIL_ tool names
    expect(readme).not.toContain("`ANVIL_inspect_project`");
    expect(readme).not.toContain("`ANVIL_map_architecture`");

    // Must contain canonical lowercase anvil_ tool names
    expect(readme).toContain("`anvil_inspect_project`");
    expect(readme).toContain("`anvil_map_architecture`");
    expect(readme).toContain("`anvil_quality_audit`");
    expect(readme).toContain("`anvil_security_audit`");
  });

  it("avoids legally sensitive clean-room claims while maintaining attribution", async () => {
    const readme = await readFile(path.resolve("README.md"), "utf8");

    expect(readme).not.toContain("clean-room");
    expect(readme).toContain("independent, original implementation");
    expect(readme).toContain("MIT license");
  });

  it("ensures release.yml validates action.yml default version against package version", async () => {
    const releaseRaw = await readFile(path.resolve(".github/workflows/release.yml"), "utf8");
    expect(releaseRaw).toContain("ACTION_DEFAULT=");
    expect(releaseRaw).toContain("action.yml default version");
  });

  it("ensures MCP server dynamically resolves version from package.json without hardcoded version strings", async () => {
    const serverRaw = await readFile(path.resolve("src/mcp/server.ts"), "utf8");
    expect(serverRaw).toContain("resolveVersion()");
    expect(serverRaw).not.toMatch(/version:\s*"(?:1\.0\.\d+|1\.1\.\d+)"/);
  });
});
