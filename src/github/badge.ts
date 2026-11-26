import type { RepoProfile } from "./repo-analysis.js";

/**
 * Deterministic, SVG-safe README verification badge renderer for public repositories.
 * Private repositories never expose scores, grades, or repository metadata publicly.
 */

export type BadgeMetric = "verified" | "shield" | "readiness" | "pr";

export interface RepoBadgeRecord {
  fullName: string;
  isPrivate: boolean;
  shieldScore?: number;
  shieldGrade?: string;
  readinessPercent?: number;
  readinessGrade?: string;
  lastPrNumber?: number;
  lastPrConclusion?: "success" | "neutral" | "failure";
  lastPrRiskScore?: number;
  lastPrRiskLevel?: string;
  profile?: Pick<RepoProfile, "packageManager">;
  updatedAt: string;
}

export function badgeKey(fullName: string): string {
  return `anvil:repo:${fullName.toLowerCase()}:badge`;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sanitizeLabel(label: string | undefined): string {
  if (!label) return "ANVIL";
  const cleaned = label
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .slice(0, 32);
  return cleaned || "ANVIL";
}

function estimateTextWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    if ("ilIj1.,:|!' ".includes(ch)) width += 4.2;
    else if ("mwMW@#%&".includes(ch)) width += 9.2;
    else if (/[A-Z]/.test(ch)) width += 7.4;
    else width += 6.4;
  }
  return Math.max(24, Math.ceil(width));
}

function scoreColor(score: number): string {
  if (score >= 85) return "#10b981";
  if (score >= 65) return "#f59e0b";
  return "#ef4444";
}

function resolveBadgeContent(options: {
  record?: RepoBadgeRecord | undefined;
  state?: "not-installed" | "private" | "unavailable" | undefined;
  metric?: BadgeMetric | undefined;
}): { value: string; color: string } {
  if (options.state === "private" || options.record?.isPrivate) {
    return { value: "private repo", color: "#64748b" };
  }
  if (options.state === "not-installed") {
    return { value: "app not installed", color: "#64748b" };
  }
  if (options.state === "unavailable" || !options.record) {
    return { value: "ready · run /anvil audit", color: "#475569" };
  }
  const r = options.record;
  const metric = options.metric ?? "verified";
  if (metric === "readiness" && typeof r.readinessPercent === "number") {
    const grade = r.readinessGrade ? ` (${r.readinessGrade})` : "";
    return { value: `readiness ${r.readinessPercent}%${grade}`, color: scoreColor(r.readinessPercent) };
  }
  if (metric === "pr" && r.lastPrConclusion) {
    const color =
      r.lastPrConclusion === "success" ? "#10b981" : r.lastPrConclusion === "neutral" ? "#f59e0b" : "#ef4444";
    const label = r.lastPrRiskLevel ? `PR #${r.lastPrNumber ?? ""} · ${r.lastPrRiskLevel} risk` : r.lastPrConclusion;
    return { value: label.trim(), color };
  }
  if (typeof r.shieldScore === "number") {
    const grade = r.shieldGrade ? ` · ${r.shieldGrade}` : "";
    const readiness =
      metric === "verified" && typeof r.readinessPercent === "number" ? ` · ready ${r.readinessPercent}%` : "";
    return { value: `Shield ${r.shieldScore}/100${grade}${readiness}`, color: scoreColor(r.shieldScore) };
  }
  if (typeof r.readinessPercent === "number") {
    const grade = r.readinessGrade ? ` (${r.readinessGrade})` : "";
    return { value: `readiness ${r.readinessPercent}%${grade}`, color: scoreColor(r.readinessPercent) };
  }
  return { value: "active · verified", color: "#10b981" };
}

export function renderVerificationBadgeSvg(options: {
  label?: string | undefined;
  record?: RepoBadgeRecord | undefined;
  state?: "not-installed" | "private" | "unavailable" | undefined;
  metric?: BadgeMetric | undefined;
}): string {
  const label = sanitizeLabel(options.label);
  const { value, color } = resolveBadgeContent(options);
  const safeLabel = escapeXml(label);
  const safeValue = escapeXml(value);
  const labelWidth = estimateTextWidth(label) + 14;
  const valueWidth = estimateTextWidth(value) + 14;
  const totalWidth = labelWidth + valueWidth;
  const labelX = Math.round(labelWidth * 5);
  const valueX = Math.round((labelWidth + valueWidth / 2) * 10);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${safeLabel}: ${safeValue}">`,
    `<title>${safeLabel}: ${safeValue}</title>`,
    `<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>`,
    `<clipPath id="r"><rect width="${totalWidth}" height="20" rx="3" fill="#fff"/></clipPath>`,
    `<g clip-path="url(#r)">`,
    `<rect width="${labelWidth}" height="20" fill="#1e2028"/>`,
    `<rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>`,
    `<rect width="${totalWidth}" height="20" fill="url(#s)"/>`,
    `</g>`,
    `<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">`,
    `<text aria-hidden="true" x="${labelX}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${(labelWidth - 10) * 10}">${safeLabel}</text>`,
    `<text x="${labelX}" y="140" transform="scale(.1)" fill="#fff" textLength="${(labelWidth - 10) * 10}">${safeLabel}</text>`,
    `<text aria-hidden="true" x="${valueX}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${(valueWidth - 10) * 10}">${safeValue}</text>`,
    `<text x="${valueX}" y="140" transform="scale(.1)" fill="#fff" textLength="${(valueWidth - 10) * 10}">${safeValue}</text>`,
    `</g>`,
    `</svg>`,
  ].join("");
}
