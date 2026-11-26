import { createHmac, timingSafeEqual } from "node:crypto";
import { badgeKey, type RepoBadgeRecord } from "../../src/github/badge.js";

export type GitHubInstallation = {
  id: number;
  app_id?: number;
  account?: { id?: number; login?: string; type?: string } | null;
  target_type?: string;
  repository_selection?: string;
  suspended_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type InstallationRecord = {
  installationId: number;
  appId: number;
  account: { id: number | null; login: string | null; type: string | null };
  targetType: string | null;
  repositorySelection: string | null;
  suspendedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export function verifyGitHubSignature(
  rawBody: string | Buffer,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = Buffer.from("sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex"));
  const supplied = Buffer.from(signature);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function isValidInstallationId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

export function parseInstallationRecord(value: string | null): InstallationRecord | undefined {
  if (value === null) return undefined;

  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid stored installation record");
  }

  const record = parsed as Partial<InstallationRecord>;
  if (
    !isValidInstallationId(record.installationId) ||
    !isValidInstallationId(record.appId) ||
    !record.account ||
    typeof record.account !== "object"
  ) {
    throw new Error("Invalid stored installation record");
  }

  return record as InstallationRecord;
}

export function installationRecord(
  installation: GitHubInstallation,
  previous?: InstallationRecord
): InstallationRecord {
  const account = installation.account;
  return {
    installationId: installation.id,
    appId: installation.app_id ?? previous?.appId ?? 0,
    account: {
      id: account?.id ?? previous?.account.id ?? null,
      login: account?.login ?? previous?.account.login ?? null,
      type: account?.type ?? previous?.account.type ?? null,
    },
    targetType: installation.target_type ?? previous?.targetType ?? null,
    repositorySelection: installation.repository_selection ?? previous?.repositorySelection ?? null,
    suspendedAt: installation.suspended_at === undefined ? (previous?.suspendedAt ?? null) : installation.suspended_at,
    createdAt: installation.created_at ?? previous?.createdAt ?? null,
    updatedAt: installation.updated_at ?? previous?.updatedAt ?? null,
  };
}

function redisConfig() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Redis REST configuration is missing");
  return { url: url.replace(/\/$/, ""), token };
}

export async function redisCommand<T = unknown>(command: unknown[]): Promise<T> {
  const { url, token } = redisConfig();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Redis request failed: ${response.status}`);
  const payload = (await response.json()) as { result?: T; error?: string };
  if (payload.error) throw new Error(payload.error);
  return payload.result as T;
}

export async function recordRepoEvent(
  fullName: string,
  event: { at: string; event: string; action: string; detail?: string; url?: string }
): Promise<void> {
  const key = `anvil:repo:${fullName.toLowerCase()}:events`;
  await redisCommand(["LPUSH", key, JSON.stringify(event)]).catch(() => undefined);
  await redisCommand(["LTRIM", key, 0, 49]).catch(() => undefined);
}

export async function readRepoBadge(fullName: string): Promise<RepoBadgeRecord | undefined> {
  try {
    const raw = await redisCommand<string | null>(["GET", badgeKey(fullName)]);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<RepoBadgeRecord>;
    if (!parsed || typeof parsed !== "object" || typeof parsed.fullName !== "string") return undefined;
    return {
      fullName: parsed.fullName,
      isPrivate: Boolean(parsed.isPrivate),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      ...(typeof parsed.shieldScore === "number" ? { shieldScore: parsed.shieldScore } : {}),
      ...(typeof parsed.shieldGrade === "string" ? { shieldGrade: parsed.shieldGrade } : {}),
      ...(typeof parsed.readinessPercent === "number" ? { readinessPercent: parsed.readinessPercent } : {}),
      ...(typeof parsed.readinessGrade === "string" ? { readinessGrade: parsed.readinessGrade } : {}),
      ...(typeof parsed.lastPrNumber === "number" ? { lastPrNumber: parsed.lastPrNumber } : {}),
      ...(parsed.lastPrConclusion ? { lastPrConclusion: parsed.lastPrConclusion } : {}),
      ...(typeof parsed.lastPrRiskScore === "number" ? { lastPrRiskScore: parsed.lastPrRiskScore } : {}),
      ...(typeof parsed.lastPrRiskLevel === "string" ? { lastPrRiskLevel: parsed.lastPrRiskLevel } : {}),
    };
  } catch {
    return undefined;
  }
}

export async function saveRepoBadge(
  update: Omit<Partial<RepoBadgeRecord>, "updatedAt"> & { fullName: string; isPrivate: boolean },
  ttlSeconds = 30 * 24 * 60 * 60
): Promise<void> {
  const existing = await readRepoBadge(update.fullName);
  const merged: RepoBadgeRecord = update.isPrivate
    ? { fullName: update.fullName, isPrivate: true, updatedAt: new Date().toISOString() }
    : {
        ...(existing && !existing.isPrivate ? existing : {}),
        ...update,
        isPrivate: false,
        updatedAt: new Date().toISOString(),
      };
  await redisCommand(["SET", badgeKey(update.fullName), JSON.stringify(merged), "EX", ttlSeconds]).catch(
    () => undefined
  );
}
