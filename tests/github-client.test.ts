import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  describePrivateKey,
  GitHubApiError,
  GitHubClient,
  normalizePrivateKey,
  type FetchLike,
} from "../src/github/github-client.js";

function makeRsaPair() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return privateKey.export({ type: "pkcs1", format: "pem" }).toString();
}

function mockFetch(
  handler: (
    method: string,
    pathWithQuery: string,
    init: { headers?: Record<string, string>; body?: string }
  ) => { ok: boolean; status: number; json?: () => Promise<unknown>; text?: () => Promise<string> }
): FetchLike {
  return async (url, init) => {
    const method = init?.method ?? "GET";
    const pathWithQuery = url.replace("https://api.github.com", "");
    const res = handler(method, pathWithQuery, {
      headers: init?.headers,
      body: init?.body,
    });
    return {
      ok: res.ok,
      status: res.status,
      json: res.json ?? (async () => ({})),
      text: res.text ?? (async () => ""),
    };
  };
}

describe("private key diagnostics and normalization", () => {
  it("describes missing, valid, encrypted, and malformed keys safely", () => {
    expect(describePrivateKey(undefined)).toEqual({ present: false });
    expect(describePrivateKey("   ")).toMatchObject({ present: true, parseOk: false });

    const pem = makeRsaPair();
    const valid = describePrivateKey(pem);
    expect(valid).toMatchObject({ present: true, parseOk: true, keyType: "rsa", looksLikeFingerprint: false });

    const fingerprintInput = describePrivateKey("SHA256:fakefingerprintvalue");
    expect(fingerprintInput).toMatchObject({ present: true, looksLikeFingerprint: true, parseOk: false });

    const encryptedHeader = ["-----BEGIN", " ENCRYPTED PRIVATE KEY-----"].join("");
    const encryptedFooter = ["-----END", " ENCRYPTED PRIVATE KEY-----"].join("");
    const encrypted = describePrivateKey(`${encryptedHeader}\nZmFrZQ==\n${encryptedFooter}`);
    expect(encrypted).toMatchObject({ present: true, encrypted: true, parseOk: false });

    expect(normalizePrivateKey("  not-a-pem  ")).toBe("not-a-pem");
    expect(describePrivateKey("not-a-pem")).toMatchObject({ present: true, parseOk: false });
  });
});

describe("GitHubClient", () => {
  it("looks up repository installation IDs and mints installation clients without repositories filter", async () => {
    const pem = makeRsaPair();
    const seen: string[] = [];
    const client = await GitHubClient.forInstallation({
      appId: 42,
      privateKey: pem,
      installationId: 100,
      fetchImpl: mockFetch((method, url) => {
        seen.push(`${method} ${url}`);
        if (method === "POST" && url === "/app/installations/100/access_tokens") {
          return { ok: true, status: 201, json: async () => ({ token: "ghs_test" }) };
        }
        return { ok: false, status: 404, json: async () => ({ message: "Not Found" }) };
      }),
    });

    expect(seen).toEqual(["POST /app/installations/100/access_tokens"]);

    await expect(
      GitHubClient.getRepoInstallation({
        appId: 42,
        privateKey: pem,
        owner: "acme",
        repo: "app",
        fetchImpl: mockFetch(() => ({ ok: true, status: 200, json: async () => ({ id: 77 }) })),
      })
    ).resolves.toMatchObject({ id: 77 });

    await expect(
      GitHubClient.getRepoInstallation({
        appId: 42,
        privateKey: pem,
        owner: "acme",
        repo: "app",
        fetchImpl: mockFetch(() => ({ ok: false, status: 404, json: async () => ({ message: "Missing" }) })),
      })
    ).resolves.toBeUndefined();

    await expect(
      GitHubClient.getRepoInstallation({
        appId: 42,
        privateKey: pem,
        owner: "acme",
        repo: "app",
        fetchImpl: mockFetch(() => ({ ok: false, status: 500, json: async () => ({ message: "Server Error" }) })),
      })
    ).rejects.toBeInstanceOf(GitHubApiError);

    await expect(
      GitHubClient.forInstallation({
        appId: 42,
        privateKey: pem,
        installationId: 100,
        fetchImpl: mockFetch(() => ({ ok: true, status: 200, json: async () => ({}) })),
      })
    ).rejects.toThrow();

    expect(client).toBeInstanceOf(GitHubClient);
  });

  it("handles 204 responses and non-JSON error bodies in request()", async () => {
    const client = new GitHubClient(
      "tok",
      mockFetch((method) => {
        if (method === "DELETE") return { ok: true, status: 204 };
        return {
          ok: false,
          status: 502,
          json: async () => {
            throw new SyntaxError("Unexpected token");
          },
          text: async () => "Bad Gateway from proxy",
        };
      })
    );

    await expect(client.request("DELETE", "/repos/acme/app/issues/1")).resolves.toBeUndefined();
    await expect(client.request("GET", "/repos/acme/app")).rejects.toThrow(/502|Bad Gateway/);
  });

  it("preserves slashes in branch names for getBranchSha and supports tree/content/commit APIs", async () => {
    const requestedUrls: string[] = [];
    const client = new GitHubClient(
      "tok",
      mockFetch((method, url) => {
        requestedUrls.push(`${method} ${url}`);
        if (url === "/repos/acme/app") {
          return { ok: true, status: 200, json: async () => ({ default_branch: "main", name: "app" }) };
        }
        if (url === "/repos/acme/app/git/ref/heads/feature/auth%20v2") {
          return { ok: true, status: 200, json: async () => ({ object: { sha: "sha-feature" } }) };
        }
        if (url === "/repos/acme/app/git/trees/sha-feature?recursive=1") {
          return { ok: true, status: 200, json: async () => ({ tree: [{ path: "README.md", type: "blob" }] }) };
        }
        if (url === "/repos/acme/app/contents/docs/read%20me.md?ref=main") {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              type: "file",
              encoding: "base64",
              content: Buffer.from("hello world", "utf8").toString("base64"),
            }),
          };
        }
        if (url === "/repos/acme/app/contents/dir?ref=main") {
          return { ok: true, status: 200, json: async () => [{ type: "file" }] };
        }
        if (url === "/repos/acme/app/contents/missing.md?ref=main") {
          return { ok: false, status: 404, json: async () => ({ message: "Not Found" }) };
        }
        if (url === "/repos/acme/app/contents/err.md?ref=main") {
          return { ok: false, status: 500, json: async () => ({ message: "Boom" }) };
        }
        if (url.startsWith("/repos/acme/app/commits")) {
          return {
            ok: true,
            status: 200,
            json: async () => [{ sha: "c1", commit: { message: "feat: init" } }],
          };
        }
        return { ok: false, status: 404, json: async () => ({ message: "Not Found" }) };
      })
    );

    const repo = await client.getRepository("acme", "app");
    expect(repo.default_branch).toBe("main");

    // Slash-containing branch names must keep `/` unencoded instead of `%2F`.
    const sha = await client.getBranchSha("acme", "app", "feature/auth v2");
    expect(sha).toBe("sha-feature");
    expect(requestedUrls).toContain("GET /repos/acme/app/git/ref/heads/feature/auth%20v2");

    const tree = await client.getTree("acme", "app", "sha-feature", true);
    expect(tree.entries).toHaveLength(1);

    await expect(client.getFileText("acme", "app", "docs/read me.md", "main")).resolves.toBe("hello world");
    await expect(client.getFileText("acme", "app", "dir", "main")).resolves.toBeUndefined();
    await expect(client.getFileText("acme", "app", "missing.md", "main")).resolves.toBeUndefined();
    await expect(client.getFileText("acme", "app", "err.md", "main")).rejects.toBeInstanceOf(GitHubApiError);

    const commits = await client.listCommits("acme", "app", "main", 250);
    expect(commits).toHaveLength(1);
    expect(requestedUrls).toContain("GET /repos/acme/app/commits?sha=main&per_page=100");
  });

  it("paginates PR files, handles collaborator/comment/check-run endpoints, and updates existing 422 branch refs without %2F", async () => {
    const calls: Array<{ method: string; url: string; body?: unknown }> = [];
    const client = new GitHubClient(
      "tok",
      mockFetch((method, url, init) => {
        const body = init.body ? JSON.parse(init.body) : undefined;
        calls.push({ method, url, body });

        if (method === "GET" && url === "/repos/acme/app/pulls/12/files?per_page=100&page=1") {
          const page1 = Array.from({ length: 100 }, (_, i) => ({
            filename: `src/f${i}.ts`,
            status: "modified",
            additions: 1,
            deletions: 0,
          }));
          return { ok: true, status: 200, json: async () => page1 };
        }
        if (method === "GET" && url === "/repos/acme/app/pulls/12/files?per_page=100&page=2") {
          return {
            ok: true,
            status: 200,
            json: async () => [{ filename: "src/last.ts", status: "added", additions: 2, deletions: 0 }],
          };
        }
        if (method === "GET" && url === "/repos/acme/app/pulls/12") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ number: 12, head: { sha: "h1", ref: "feat/x" }, base: { ref: "main" } }),
          };
        }
        if (method === "GET" && url === "/repos/acme/app/collaborators/alice/permission") {
          return { ok: true, status: 200, json: async () => ({ permission: "write" }) };
        }
        if (method === "GET" && url.startsWith("/repos/acme/app/issues/12/comments")) {
          return { ok: true, status: 200, json: async () => [{ id: 5, body: "old" }] };
        }
        if (method === "POST" && url === "/repos/acme/app/issues/12/comments") {
          return {
            ok: true,
            status: 201,
            json: async () => ({ html_url: "https://github.com/acme/app/pull/12#issuecomment-1" }),
          };
        }
        if (method === "PATCH" && url === "/repos/acme/app/issues/comments/5") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ html_url: "https://github.com/acme/app/pull/12#issuecomment-5" }),
          };
        }
        if (method === "POST" && url === "/repos/acme/app/check-runs") {
          return { ok: true, status: 201, json: async () => ({ html_url: "https://github.com/acme/app/runs/99" }) };
        }

        // openPullRequestWithFiles hitting 422 on existing branch + 422 on existing open PR
        if (method === "GET" && url === "/repos/acme/app/git/ref/heads/main") {
          return { ok: true, status: 200, json: async () => ({ object: { sha: "base-sha" } }) };
        }
        if (method === "GET" && url === "/repos/acme/app/git/commits/base-sha") {
          return { ok: true, status: 200, json: async () => ({ tree: { sha: "base-tree" } }) };
        }
        if (method === "POST" && url === "/repos/acme/app/git/trees") {
          return { ok: true, status: 201, json: async () => ({ sha: "tree-2" }) };
        }
        if (method === "POST" && url === "/repos/acme/app/git/commits") {
          return { ok: true, status: 201, json: async () => ({ sha: "commit-2" }) };
        }
        if (method === "POST" && url === "/repos/acme/app/git/refs") {
          return { ok: false, status: 422, json: async () => ({ message: "Reference already exists" }) };
        }
        if (method === "PATCH" && url === "/repos/acme/app/git/refs/heads/anvil/setup") {
          return { ok: true, status: 200, json: async () => ({ ref: "refs/heads/anvil/setup" }) };
        }
        if (method === "POST" && url === "/repos/acme/app/pulls") {
          return { ok: false, status: 422, json: async () => ({ message: "A pull request already exists" }) };
        }
        if (method === "GET" && url === "/repos/acme/app/pulls?head=acme%3Aanvil%2Fsetup&state=open") {
          return {
            ok: true,
            status: 200,
            json: async () => [{ html_url: "https://github.com/acme/app/pull/7", number: 7 }],
          };
        }
        return { ok: false, status: 404, json: async () => ({ message: "Unexpected " + method + " " + url }) };
      })
    );

    const files = await client.listPullFiles("acme", "app", 12, 3);
    expect(files).toHaveLength(101);
    const cappedFiles = await client.listPullFiles("acme", "app", 12, 1);
    expect(cappedFiles).toHaveLength(100);

    await expect(client.getPull("acme", "app", 12)).resolves.toMatchObject({ number: 12 });
    await expect(client.getCollaboratorPermission("acme", "app", "alice")).resolves.toBe("write");
    await expect(client.listIssueComments("acme", "app", 12)).resolves.toHaveLength(1);

    const commentRes = await client.createIssueComment("acme", "app", 12, "x".repeat(66_000));
    expect(commentRes.html_url).toContain("issuecomment-1");
    const commentCall = calls.find((c) => c.method === "POST" && c.url.endsWith("/issues/12/comments"));
    expect((commentCall?.body as { body: string }).body).toHaveLength(65_000);

    const updatedComment = await client.updateIssueComment("acme", "app", 5, "updated");
    expect(updatedComment.html_url).toContain("issuecomment-5");

    const checkRun = await client.createCheckRun("acme", "app", {
      name: "ANVIL",
      head_sha: "h1",
      status: "completed",
      conclusion: "success",
      output: { title: "Clean", summary: "OK", annotations: [] },
    });
    expect(checkRun.html_url).toContain("/runs/99");

    const reusedPull = await client.openPullRequestWithFiles({
      owner: "acme",
      repo: "app",
      baseBranch: "main",
      branch: "anvil/setup",
      title: "Setup ANVIL",
      body: "Body",
      message: "chore: anvil setup",
      files: [{ path: "AGENTS.md", content: "# Agents\n" }],
    });
    expect(reusedPull).toEqual({ html_url: "https://github.com/acme/app/pull/7", number: 7 });
    expect(calls.some((c) => c.method === "PATCH" && c.url === "/repos/acme/app/git/refs/heads/anvil/setup")).toBe(
      true
    );
  });
});
