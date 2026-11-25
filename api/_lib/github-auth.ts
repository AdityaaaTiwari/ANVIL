import { createHash, randomBytes } from "node:crypto";
import type { VercelRequest, VercelResponse } from "./vercel-types.js";
import { isValidInstallationId, parseInstallationRecord, redisCommand, type InstallationRecord } from "./github-app.js";

const STATE_TTL_SECONDS = 600;
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const COOKIE_NAME = "anvil_github_session";
const API_VERSION = "2022-11-28";

export interface SessionRepository {
  fullName: string;
  installationId: number;
  private: boolean;
}
export type OAuthState = { verifier: string; installationId: number | null };
export type AuthSession = {
  userId: number;
  login: string;
  installationIds: number[];
  repositories?: SessionRepository[];
  createdAt: number;
};

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}
export function stateKey(state: string): string {
  return `anvil:github:oauth-state:${state}`;
}
export function sessionKey(id: string): string {
  return `anvil:github:session:${id}`;
}
export function installationKey(id: number): string {
  return `anvil:github:installation:${id}`;
}
export function getCookie(req: VercelRequest, name: string): string | undefined {
  const raw = req.headers.cookie;
  const cookie = Array.isArray(raw) ? raw[0] : raw;
  if (!cookie) return undefined;
  for (const part of cookie.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
export function setSessionCookie(res: VercelResponse, id: string): void {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(id)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`
  );
}
export function clearSessionCookie(res: VercelResponse): void {
  const expired = "Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
  res.setHeader("Set-Cookie", [`${COOKIE_NAME}=; ${expired}`, `forge_github_session=; ${expired}`]);
}
export function isValidSessionRepository(value: unknown): value is SessionRepository {
  if (!value || typeof value !== "object") return false;
  const repo = value as Partial<SessionRepository>;
  return (
    typeof repo.fullName === "string" &&
    repo.fullName.includes("/") &&
    isValidInstallationId(repo.installationId) &&
    typeof repo.private === "boolean"
  );
}
export async function readSession(req: VercelRequest): Promise<AuthSession | undefined> {
  const id = getCookie(req, COOKIE_NAME) || getCookie(req, "forge_github_session");
  if (!id || !/^[A-Za-z0-9_-]{40,60}$/.test(id)) return undefined;
  const stored = await redisCommand<string | null>(["GET", sessionKey(id)]);
  if (!stored) return undefined;
  try {
    const value = JSON.parse(stored) as AuthSession;
    if (
      !Number.isSafeInteger(value.userId) ||
      value.userId <= 0 ||
      typeof value.login !== "string" ||
      !Array.isArray(value.installationIds) ||
      !value.installationIds.every(isValidInstallationId) ||
      (value.repositories !== undefined &&
        (!Array.isArray(value.repositories) || !value.repositories.every(isValidSessionRepository)))
    )
      return undefined;
    return value;
  } catch {
    return undefined;
  }
}
export async function createSession(session: AuthSession): Promise<string> {
  const id = randomToken();
  await redisCommand(["SET", sessionKey(id), JSON.stringify(session), "EX", SESSION_TTL_SECONDS]);
  return id;
}
export async function getVerifiedInstallations(ids: number[]): Promise<InstallationRecord[]> {
  const records: InstallationRecord[] = [];
  for (const id of ids.slice(0, 100)) {
    let raw = await redisCommand<string | null>(["GET", installationKey(id)]);
    if (!raw) {
      raw = await redisCommand<string | null>(["GET", `forge:github:installation:${id}`]);
    }
    const record = parseInstallationRecord(raw);
    if (
      record &&
      record.installationId === id &&
      record.appId === Number(process.env.GITHUB_APP_ID) &&
      !record.suspendedAt
    ) {
      records.push(record);
    }
  }
  return records;
}
export function getQuery(req: VercelRequest, key: string): string | undefined {
  const value = req.query?.[key];
  return typeof value === "string" ? value : undefined;
}
export function oauthConfig() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const appId = Number(process.env.GITHUB_APP_ID);
  const callbackUrl = process.env.GITHUB_CALLBACK_URL ?? "https://anvil-workbench.vercel.app/api/github/callback";
  if (!clientId || !clientSecret || !Number.isSafeInteger(appId) || appId <= 0) {
    throw new Error("GitHub OAuth configuration is incomplete (missing client ID, secret, or app ID)");
  }
  try {
    const parsed = new URL(callbackUrl);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
      throw new Error("GitHub OAuth callback URL must use HTTPS protocol in production");
    }
  } catch (err: unknown) {
    throw new Error(`Invalid GITHUB_CALLBACK_URL provided: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { clientId, clientSecret, appId, callbackUrl };
}
export async function githubApi<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": API_VERSION,
      "User-Agent": "ANVIL-Workbench",
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`GitHub API request failed: ${response.status}`);
  return (await response.json()) as T;
}
export function jsonError(res: VercelResponse, status: number, message: string) {
  return res.status(status).json({ error: message });
}
