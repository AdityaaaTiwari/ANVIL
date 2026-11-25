import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sendJson } from "./dashboard/http-helpers.js";
import { renderDashboardPage } from "./dashboard/page.js";
import { handleDashboardGet } from "./dashboard/routes-get.js";
import { handleDashboardPost } from "./dashboard/routes-post.js";
import { attachDashboardHeartbeat, broadcastEvent } from "./dashboard/sse.js";

const FALLBACK_DASHBOARD_VERSION = "v1.4.0";

function resolveDashboardVersion(): string {
  const candidates = [
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../package.json"),
    path.resolve(process.cwd(), "package.json"),
  ];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(candidate, "utf8")) as { name?: string; version?: string };
      if (parsed.version && (!parsed.name || parsed.name.includes("anvil"))) {
        return parsed.version.startsWith("v") ? parsed.version : `v${parsed.version}`;
      }
    } catch {
      // Try next package manifest location.
    }
  }
  return FALLBACK_DASHBOARD_VERSION;
}

export { broadcastEvent };

export interface DashboardOptions {
  projectPath: string;
  port?: number;
}

export interface DashboardHandle {
  server: Server;
  url: string;
}

export async function startDashboard(options: DashboardOptions): Promise<DashboardHandle> {
  const host = "127.0.0.1";
  const port = options.port ?? 4173;
  const projectPath = options.projectPath;
  const version = resolveDashboardVersion();
  const pageHtml = renderDashboardPage(version);

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", `http://${host}:${port}`);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:"
    );
    response.setHeader("Cache-Control", "no-store");

    try {
      // The dashboard is loopback-only. Reject arbitrary Host headers so a
      // DNS-rebinding page cannot reach local APIs with a matching attacker Origin.
      const localPort = request.socket.localPort;
      const allowedHosts = new Set([`${host}:${localPort}`, `localhost:${localPort}`, `[::1]:${localPort}`]);
      if (!request.headers.host || !allowedHosts.has(request.headers.host)) {
        sendJson(response, 421, { error: "Unexpected Host header." });
        return;
      }
      if (request.method !== "GET" && request.method !== "POST") {
        sendJson(response, 405, { error: "Method not allowed." });
        return;
      }
      if (request.method === "POST") {
        await handleDashboardPost(request, response, requestUrl, projectPath);
        return;
      }
      const handled = await handleDashboardGet(request, response, requestUrl, projectPath, pageHtml, version);
      if (!handled) {
        sendJson(response, 404, { error: "Not found." });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected dashboard error.";
      sendJson(response, 500, { error: message });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  attachDashboardHeartbeat(server);

  return { server, url: `http://${host}:${port}` };
}
