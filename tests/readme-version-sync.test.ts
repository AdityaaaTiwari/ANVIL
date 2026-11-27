import { describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

describe("README and package version/tool synchronization", () => {
  it("synchronizes README install tags with package.json version", async () => {
    const pkgRaw = await readFile(path.resolve("package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw);
    const expectedTag = `v${pkg.version}`;

    const readme = await readFile(path.resolve("README.md"), "utf8");

    // Must not contain outdated #v1.0.7 install tags
    expect(readme).not.toContain("ANVIL.git#v1.0.7");
    expect(readme).not.toContain("AdityaaaTiwari/ANVIL@v1.0.7");

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

  it("avoids legally sensitive clean-room claims while maintaining license and notice attribution", async () => {
    const readme = await readFile(path.resolve("README.md"), "utf8");
    const license = await readFile(path.resolve("LICENSE"), "utf8");
    const notice = await readFile(path.resolve("NOTICE"), "utf8");
    const ack = await readFile(path.resolve("ACKNOWLEDGEMENTS.md"), "utf8");

    // Must not contain defensive clean-room claims
    expect(readme).not.toContain("clean-room");
    expect(readme).not.toContain("No Upstream License Baggage");
    expect(readme).toContain("MIT License");

    // License names ANVIL's copyright holder; NOTICE keeps the required
    // MIT notice for third-party code; acknowledgements point to it.
    expect(license).toContain("Aditya Tiwari (ANVIL)");
    expect(notice).toContain("Permission is hereby granted, free of charge");
    expect(ack).toContain("[NOTICE](NOTICE)");
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

  it("ensures dashboard-server synchronizes displayed version with package.json version", async () => {
    const pkgRaw = await readFile(path.resolve("package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw);

    const dashboardRaw = await readFile(path.resolve("src/core/dashboard-server.ts"), "utf8");
    expect(dashboardRaw).not.toContain("v1.0.7");
    expect(dashboardRaw).toContain(`v${pkg.version}`);
  });

  it("ensures the MCP server has no hardcoded semver literal fallback", async () => {
    const serverRaw = await readFile(path.resolve("src/mcp/server.ts"), "utf8");
    expect(serverRaw).not.toMatch(/return\s+"\d+\.\d+\.\d+"/);
  });

  it("synchronizes server.json and .well-known/mcp/server.json with package.json version", async () => {
    const pkg = JSON.parse(await readFile(path.resolve("package.json"), "utf8"));
    const rootManifestRaw = await readFile(path.resolve("server.json"), "utf8");
    const wellKnownRaw = await readFile(path.resolve(".well-known/mcp/server.json"), "utf8");
    expect(JSON.parse(rootManifestRaw).version).toBe(pkg.version);
    expect(JSON.parse(wellKnownRaw).version).toBe(pkg.version);
    expect(wellKnownRaw).toBe(rootManifestRaw);
  });

  it("keeps llms.txt and public/llms.txt identical", async () => {
    const rootCopy = await readFile(path.resolve("llms.txt"), "utf8");
    const publicCopy = await readFile(path.resolve("public/llms.txt"), "utf8");
    expect(publicCopy).toBe(rootCopy);
  });

  it("lists the current minor release line as supported in SECURITY.md", async () => {
    const pkg = JSON.parse(await readFile(path.resolve("package.json"), "utf8"));
    const [major, minor] = String(pkg.version).split(".");
    const security = await readFile(path.resolve("SECURITY.md"), "utf8");
    const row = security.split("\n").find((line) => line.startsWith(`| ${major}.${minor}.x`));
    expect(row, `SECURITY.md has no row for ${major}.${minor}.x`).toBeDefined();
    expect(row).toContain("Yes");
  });

  it("pins every third-party GitHub Action to a full commit SHA", async () => {
    const dir = path.resolve(".github/workflows");
    const files = (await readdir(dir)).filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"));
    const unpinned: string[] = [];
    for (const name of files) {
      const raw = await readFile(path.join(dir, name), "utf8");
      for (const match of raw.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)) {
        const ref = match[1];
        if (ref.startsWith("./")) continue;
        if (!/@[0-9a-f]{40}$/.test(ref)) unpinned.push(`${name}: ${ref}`);
      }
    }
    expect(unpinned).toEqual([]);
  });

  it("validates server.json aligns with MCP registry schema and workbench repository", async () => {
    const raw = await readFile(path.resolve("server.json"), "utf8");
    const manifest = JSON.parse(raw);
    expect(manifest.homepage).toBe("https://github.com/AdityaaaTiwari/ANVIL");
    expect(manifest.repository.url).toBe("https://github.com/AdityaaaTiwari/ANVIL.git");
    expect(manifest.license).toBe("MIT");
    expect(manifest.author.email).toBeUndefined();
    expect(Array.isArray(manifest.packages)).toBe(true);
    expect(manifest.packages[0]).toMatchObject({
      registry: "npm",
      package: "anvil-engineering-workbench",
      version: manifest.version,
    });
  });
});
