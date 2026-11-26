import path from "node:path";
import type { VercelRequest, VercelResponse } from "../_lib/vercel-types.js";
import {
  installationRecord,
  parseInstallationRecord,
  isValidInstallationId,
  recordRepoEvent,
  redisCommand,
  saveRepoBadge,
  verifyGitHubSignature,
  type GitHubInstallation,
} from "../_lib/github-app.js";
import { handleGitHubEvent } from "../../src/github/app-handlers.js";
import { parseRepoFullName } from "../../src/github/dashboard-service.js";
import { GitHubClient } from "../../src/github/github-client.js";

const ANVIL_VERSION = "1.5.0";

export const config = { api: { bodyParser: false } };

async function readRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > 1024 * 1024) throw new Error("Payload too large");
    chunks.push(part);
  }
  return Buffer.concat(chunks);
}

const key = (id: number) => `anvil:github:installation:${id}`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  const appId = Number(process.env.GITHUB_APP_ID);
  if (!secret || !Number.isSafeInteger(appId) || appId <= 0) {
    return res.status(503).json({ error: "GitHub App webhook is not configured" });
  }

  let rawBody: Buffer;
  try {
    rawBody = await readRawBody(req);
  } catch {
    return res.status(413).json({ error: "Webhook payload is too large or unreadable" });
  }

  const signature = req.headers["x-hub-signature-256"];
  if (!verifyGitHubSignature(rawBody, Array.isArray(signature) ? signature[0] : signature, secret)) {
    return res.status(401).json({ error: "Invalid webhook signature" });
  }

  let payload: {
    action?: string;
    installation?: GitHubInstallation;
    repository?: { full_name?: string; private?: boolean };
  };
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "Invalid JSON payload" });
  }

  const event = req.headers["x-github-event"];
  if (typeof event !== "string") return res.status(400).json({ error: "Missing event header" });

  if (event === "issue_comment" || event === "pull_request") {
    const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
    const installationId = payload.installation?.id;
    const repoTarget = parseRepoFullName(payload.repository?.full_name);
    if (!privateKey || !isValidInstallationId(installationId) || !repoTarget) {
      return res.status(200).json({ received: true, ignored: true });
    }
    try {
      const client = await GitHubClient.forInstallation({
        appId,
        privateKey,
        installationId,
        repositories: [repoTarget.repo],
      });
      const result = await handleGitHubEvent(
        { client, anvilVersion: ANVIL_VERSION, catalogRoot: path.join(process.cwd(), "catalog") },
        event,
        payload
      );
      if (result.handled) {
        const fullName = `${repoTarget.owner}/${repoTarget.repo}`;
        await recordRepoEvent(fullName, {
          at: new Date().toISOString(),
          event,
          action: result.action,
          ...(result.detail ? { detail: result.detail } : {}),
          ...(result.url ? { url: result.url } : {}),
        });
        if (result.verification) {
          await saveRepoBadge({
            fullName,
            isPrivate: Boolean(payload.repository?.private),
            shieldScore: result.verification.shieldScore,
            shieldGrade: result.verification.shieldGrade,
            ...(typeof result.verification.prNumber === "number" ? { lastPrNumber: result.verification.prNumber } : {}),
            ...(result.verification.conclusion ? { lastPrConclusion: result.verification.conclusion } : {}),
            ...(typeof result.verification.riskScore === "number"
              ? { lastPrRiskScore: result.verification.riskScore }
              : {}),
            ...(result.verification.riskLevel ? { lastPrRiskLevel: result.verification.riskLevel } : {}),
          });
        }
      }
      return res.status(200).json({ received: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to process webhook event";
      return res.status(502).json({ error: message.slice(0, 200) });
    }
  }

  if (event !== "installation" && event !== "installation_repositories") {
    return res.status(200).json({ received: true, ignored: true });
  }

  const installation = payload.installation;
  if (!installation || !isValidInstallationId(installation.id)) {
    return res.status(400).json({ error: "Invalid installation payload" });
  }
  if (installation.app_id !== appId) {
    return res.status(403).json({ error: "Webhook belongs to a different GitHub App or has no App ID" });
  }

  try {
    const recordKey = key(installation.id);
    if (event === "installation" && payload.action === "deleted") {
      await redisCommand(["DEL", recordKey]);
      return res.status(200).json({ received: true, deleted: true });
    }

    const stored = await redisCommand<string | null>(["GET", recordKey]);
    const previous = parseInstallationRecord(stored);
    const record = installationRecord({ ...installation, app_id: installation.app_id ?? appId }, previous ?? undefined);
    if (record.appId !== appId) {
      return res.status(403).json({ error: "Installation App ID mismatch" });
    }
    await redisCommand(["SET", recordKey, JSON.stringify(record)]);
    return res.status(200).json({ received: true, stored: true });
  } catch {
    return res.status(500).json({ error: "Could not persist installation event" });
  }
}
