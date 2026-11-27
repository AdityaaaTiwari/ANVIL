/**
 * Finds embedded credentials and network endpoints in app text and bytecode
 * (JS bundles, JSON, HTML, Android dex). Secrets are always masked in output.
 */

export type AppSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface AppFinding {
  ruleId: string;
  severity: AppSeverity;
  file: string;
  message: string;
  remediation: string;
}

const SECRET_RULES: Array<{ id: string; severity: AppSeverity; label: string; regex: RegExp }> = [
  { id: "ANVIL-APP-SECRET-AWS", severity: "critical", label: "AWS access key", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  {
    id: "ANVIL-APP-SECRET-STRIPE",
    severity: "critical",
    label: "Stripe live secret key",
    regex: /\b(?:sk|rk)_live_[0-9a-zA-Z]{20,}\b/g,
  },
  {
    id: "ANVIL-APP-SECRET-GITHUB",
    severity: "critical",
    label: "GitHub token",
    regex: /\b(?:ghp|gho|ghs|ghu)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{50,}\b/g,
  },
  {
    id: "ANVIL-APP-SECRET-OPENAI",
    severity: "critical",
    label: "OpenAI or Anthropic API key",
    regex: /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{32,}\b/g,
  },
  {
    id: "ANVIL-APP-SECRET-SLACK",
    severity: "high",
    label: "Slack token",
    regex: /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/g,
  },
  {
    id: "ANVIL-APP-SECRET-PRIVATE-KEY",
    severity: "critical",
    label: "private key",
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    id: "ANVIL-APP-SECRET-GOOGLE",
    severity: "medium",
    label: "Google API key (often public by design in mobile apps; check its restrictions)",
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
  },
];

const URL_PATTERN = /\b(?:https?|wss?):\/\/([a-z0-9.-]{1,253})/gi;
const LABEL = /^[a-z0-9-]{1,63}$/;

function isHostName(host: string): boolean {
  if (!host || host.length > 253) return false;
  const labels = host.split(".");
  return (
    labels.length >= 2 && labels.every((label) => LABEL.test(label) && !label.startsWith("-") && !label.endsWith("-"))
  );
}

function trimDots(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === ".") end -= 1;
  return value.slice(0, end);
}
const IGNORED_HOSTS =
  /(^|\.)(w3\.org|schemas\.android\.com|apache\.org|xml\.org|xmlpull\.org|ns\.adobe\.com|purl\.org|example\.(com|org)|localhost)$/i;

export function maskSecret(value: string): string {
  return value.length <= 8 ? "****" : `${value.slice(0, 4)}…${value.slice(-2)} (${value.length} chars)`;
}

export interface TextScanResult {
  findings: AppFinding[];
  hosts: Map<string, number>;
  insecureHttpHosts: Set<string>;
}

export function newTextScan(): TextScanResult {
  return { findings: [], hosts: new Map(), insecureHttpHosts: new Set() };
}

/** Scans one file's text into `result`. Each secret value is reported once per file. */
export function scanText(file: string, text: string, result: TextScanResult): void {
  for (const rule of SECRET_RULES) {
    const seen = new Set<string>();
    for (const match of text.matchAll(rule.regex)) {
      const value = match[0];
      if (seen.has(value) || seen.size >= 5) continue;
      seen.add(value);
      result.findings.push({
        ruleId: rule.id,
        severity: rule.severity,
        file,
        message: `Embedded ${rule.label}: ${rule.id.endsWith("PRIVATE-KEY") ? "key block" : maskSecret(value)}`,
        remediation:
          "Anything shipped in an app can be extracted. Revoke this credential and move the call behind your own server.",
      });
    }
  }
  for (const match of text.matchAll(URL_PATTERN)) {
    const host = trimDots((match[1] ?? "").toLowerCase());
    if (!isHostName(host) || IGNORED_HOSTS.test(host)) continue;
    result.hosts.set(host, (result.hosts.get(host) ?? 0) + 1);
    if (/^http:\/\//i.test(match[0]) && !/^(10|127|192\.168)\./.test(host)) result.insecureHttpHosts.add(host);
  }
}

/** True for files worth scanning as text inside an app package. */
export function isScannableText(name: string): boolean {
  return /\.(m?js|cjs|jsx|ts|json|html?|xml|plist|properties|txt|env|cfg|conf|ini|ya?ml|dex)$/i.test(name);
}
