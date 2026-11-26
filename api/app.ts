import path from "node:path";
import type { VercelRequest, VercelResponse } from "./_lib/vercel-types.js";
import { getQuery, getVerifiedInstallations, jsonError, readSession } from "./_lib/github-auth.js";
import { readRepoBadge, recordRepoEvent, redisCommand, saveRepoBadge } from "./_lib/github-app.js";
import { remoteShield } from "../src/github/app-handlers.js";
import { renderVerificationBadgeSvg, type BadgeMetric } from "../src/github/badge.js";
import { GitHubClient } from "../src/github/github-client.js";
import {
  buildRepoOverview,
  parseRepoFullName,
  runDashboardAction,
  type DashboardEvent,
} from "../src/github/dashboard-service.js";

/**
 * Hosted dashboard API (one function to stay within plan limits).
 *   GET  /api/app?op=badge&name=owner/repo  public SVG verification badge (public repos only)
 *   GET  /api/app?op=session                signed-in user, installations and accessible repositories
 *   GET  /api/app?op=repo&name=owner/repo   live overview: profile, setup status, Shield, open PR risk, history
 *   POST /api/app?op=action                 { name, action: "analyze" | "repair" } → setup pull request
 */

export const config = { api: { bodyParser: false } };

const ANVIL_VERSION = "1.5.0";

function isOriginAllowed(origin: string | string[] | undefined, host: string | string[] | undefined): boolean {
  if (!origin) return true;
  const o = Array.isArray(origin) ? origin[0] : origin;
  if (!o) return true;
  if (process.env.APP_URL && o === process.env.APP_URL) return true;
  if (host) {
    const h = Array.isArray(host) ? host[0] : host;
    if (h && (o === `https://${h}` || o === `http://${h}`)) return true;
  }
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(o) || /^http:\/\/localhost(:\d+)?$/.test(o)) return true;
  return false;
}

async function readJson(req: VercelRequest): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > 16 * 1024) throw new Error("Request body too large");
    chunks.push(part);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function history(fullName: string): Promise<DashboardEvent[]> {
  try {
    const items = await redisCommand<string[]>(["LRANGE", `anvil:repo:${fullName.toLowerCase()}:events`, 0, 24]);
    return (items ?? []).flatMap((item) => {
      try {
        return [JSON.parse(item) as DashboardEvent];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

async function clientFor(installationId: number, repo: string): Promise<GitHubClient> {
  const appId = Number(process.env.GITHUB_APP_ID);
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!Number.isSafeInteger(appId) || appId <= 0 || !privateKey)
    throw new Error("GitHub App credentials are not configured");
  return GitHubClient.forInstallation({ appId, privateKey, installationId, repositories: [repo] });
}

function parseBadgeMetric(raw: string | undefined): BadgeMetric {
  if (raw === "shield" || raw === "readiness" || raw === "pr" || raw === "verified") return raw;
  return "verified";
}

async function serveBadge(req: VercelRequest, res: VercelResponse) {
  const target = parseRepoFullName(getQuery(req, "name"));
  if (!target) return jsonError(res, 400, "Use name=owner/repo");
  const fullName = `${target.owner}/${target.repo}`;
  const metric = parseBadgeMetric(getQuery(req, "metric"));
  const label = getQuery(req, "label");

  let record = await readRepoBadge(fullName);
  let state: "not-installed" | "private" | "unavailable" | undefined;

  if (record?.isPrivate) {
    state = "private";
  } else if (!record) {
    const appId = Number(process.env.GITHUB_APP_ID);
    const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
    if (Number.isSafeInteger(appId) && appId > 0 && privateKey) {
      try {
        const installation = await GitHubClient.getRepoInstallation({
          appId,
          privateKey,
          owner: target.owner,
          repo: target.repo,
        });
        if (!installation) {
          state = "not-installed";
        } else {
          const client = await GitHubClient.forInstallation({
            appId,
            privateKey,
            installationId: installation.id,
            repositories: [target.repo],
          });
          const repoInfo = await client.getRepository(target.owner, target.repo);
          if (repoInfo.private) {
            record = { fullName, isPrivate: true, updatedAt: new Date().toISOString() };
            state = "private";
            await saveRepoBadge(record, 600);
          } else {
            const shield = await remoteShield(client, target.owner, target.repo, repoInfo.default_branch);
            record = {
              fullName,
              isPrivate: false,
              shieldScore: shield.score,
              shieldGrade: shield.grade,
              updatedAt: new Date().toISOString(),
            };
            await saveRepoBadge(record, 600);
          }
        }
      } catch {
        state = "unavailable";
      }
    } else {
      state = "unavailable";
    }
  }

  const svg = renderVerificationBadgeSvg({ label, record, state, metric });
  const cacheable = Boolean(record && !record.isPrivate);
  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
  res.setHeader(
    "Cache-Control",
    cacheable ? "public, max-age=300, s-maxage=300, stale-while-revalidate=600" : "no-store"
  );
  const out = res.status(200);
  return out.send ? out.send(svg) : out.json({ svg });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const op = getQuery(req, "op");
  try {
    if (op === "badge" && req.method === "GET") {
      return await serveBadge(req, res);
    }
    const session = await readSession(req);
    if (!session) return jsonError(res, 401, "Sign in with GitHub to continue");

    if (op === "session" && req.method === "GET") {
      const installations = await getVerifiedInstallations(session.installationIds);
      const active = new Set(installations.map((item) => item.installationId));
      return res.status(200).json({
        user: { login: session.login },
        installations: installations.map((item) => ({
          id: item.installationId,
          account: item.account.login,
          type: item.account.type,
          selection: item.repositorySelection,
        })),
        repositories: (session.repositories ?? []).filter((item) => active.has(item.installationId)),
        reauthRequired: session.repositories === undefined,
      });
    }

    const target = op === "repo" ? parseRepoFullName(getQuery(req, "name")) : undefined;
    if (op === "repo" && req.method === "GET") {
      if (!target) return jsonError(res, 400, "Use name=owner/repo");
      const allowed = (session.repositories ?? []).find(
        (item) => item.fullName.toLowerCase() === `${target.owner}/${target.repo}`.toLowerCase()
      );
      if (!allowed) return jsonError(res, 404, "Repository not found in your ANVIL installations");
      const client = await clientFor(allowed.installationId, target.repo);
      const overview = await buildRepoOverview(
        { client, anvilVersion: ANVIL_VERSION, catalogRoot: path.join(process.cwd(), "catalog") },
        target.owner,
        target.repo,
        await history(allowed.fullName)
      );
      await saveRepoBadge({
        fullName: overview.repository.fullName,
        isPrivate: overview.repository.private,
        shieldScore: overview.shield.score,
        shieldGrade: overview.shield.grade,
        ...(overview.scorecard
          ? { readinessPercent: overview.scorecard.percent, readinessGrade: overview.scorecard.grade }
          : {}),
      });
      return res.status(200).json(overview);
    }

    if (op === "action" && req.method === "POST") {
      const origin = req.headers.origin;
      const host = req.headers.host;
      if (!isOriginAllowed(origin, host)) return jsonError(res, 403, "Cross-origin request rejected");
      const body = (await readJson(req)) as { name?: unknown; action?: unknown };
      const repoTarget = parseRepoFullName(body.name);
      if (!repoTarget || (body.action !== "analyze" && body.action !== "repair"))
        return jsonError(res, 400, "Use { name: owner/repo, action: analyze | repair }");
      const allowed = (session.repositories ?? []).find(
        (item) => item.fullName.toLowerCase() === `${repoTarget.owner}/${repoTarget.repo}`.toLowerCase()
      );
      if (!allowed) return jsonError(res, 404, "Repository not found in your ANVIL installations");
      const client = await clientFor(allowed.installationId, repoTarget.repo);
      const result = await runDashboardAction(
        { client, anvilVersion: ANVIL_VERSION, catalogRoot: path.join(process.cwd(), "catalog") },
        repoTarget.owner,
        repoTarget.repo,
        body.action,
        session.login
      );
      const event: DashboardEvent = {
        at: new Date().toISOString(),
        event: "dashboard",
        action: body.action,
        detail: result.upToDate ? "up to date" : `${result.created} new, ${result.updated} updated`,
        ...(result.url ? { url: result.url } : {}),
      };
      await recordRepoEvent(allowed.fullName, event);
      return res.status(200).json(result);
    }

    res.setHeader("Allow", "GET, POST");
    return jsonError(res, 405, "Unsupported operation");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return jsonError(res, /write access/.test(message) ? 403 : 502, message.slice(0, 200));
  }
}
