import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { SecurityAuditReport } from "./security-scanner.js";
import type { CodeReviewReport, InlineSuppressionRecord } from "./code-review.js";
import type { NormalizedFinding } from "./policy-engine.js";

export interface SarifFormatOptions {
  securityReport?: SecurityAuditReport | undefined;
  reviewReport?: CodeReviewReport | undefined;
  activeFindings?: NormalizedFinding[] | undefined;
  suppressedFindings?: NormalizedFinding[] | undefined;
  inlineSuppressions?: InlineSuppressionRecord[] | undefined;
  suppressedFingerprints?: Set<string> | undefined;
  filterSuppressed?: boolean | undefined;
  targetRoot?: string | undefined;
  version?: string | undefined;
}

interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  fullDescription?: { text: string };
  helpUri?: string;
  defaultConfiguration: {
    level: "error" | "warning" | "note";
  };
}

interface SarifResult {
  ruleId: string;
  level: "error" | "warning" | "note";
  message: { text: string };
  locations: Array<{
    physicalLocation: {
      artifactLocation: {
        uri: string;
        uriBaseId?: string;
      };
      region?: {
        startLine: number;
        startColumn?: number;
      };
    };
  }>;
  suppressions?: Array<{
    kind: "external" | "inSource";
    status?: "accepted" | "underReview" | "rejected";
    justification?: string;
  }>;
}

function resolvePackageVersion(): string {
  try {
    const pkgUrl = new URL("../../package.json", import.meta.url);
    const raw = readFileSync(pkgUrl, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.version === "string") return parsed.version;
  } catch {}
  return "1.4.0";
}

function mapSecuritySeverity(severity: string): "error" | "warning" | "note" {
  switch (severity) {
    case "critical":
    case "high":
      return "error";
    case "medium":
      return "warning";
    case "low":
    default:
      return "note";
  }
}

function mapReviewSeverity(severity: string): "error" | "warning" | "note" {
  switch (severity) {
    case "high":
      return "error";
    case "medium":
      return "warning";
    case "low":
    default:
      return "note";
  }
}

/**
 * Generates an OASIS SARIF v2.1.0 JSON report from ANVIL security and review findings.
 * GitHub natively supports uploading SARIF files to populate code scanning alerts in PRs.
 * Filtered by baseline so baselined findings do not create spurious code scanning alerts.
 */
export function generateSarif(options: SarifFormatOptions): string {
  const rulesMap = new Map<string, SarifRule>();
  const results: SarifResult[] = [];
  const version = options.version ?? resolvePackageVersion();
  const filterSuppressed = options.filterSuppressed ?? true;

  // Case 1: Active findings provided directly from GateEvaluation
  if (options.activeFindings) {
    for (const finding of options.activeFindings) {
      const level =
        finding.source === "security" ? mapSecuritySeverity(finding.severity) : mapReviewSeverity(finding.severity);
      if (!rulesMap.has(finding.id)) {
        rulesMap.set(finding.id, {
          id: finding.id,
          name: finding.source === "security" ? `Security_${finding.id}` : `Review_${finding.id}`,
          shortDescription: { text: finding.message },
          helpUri: "https://github.com/anvil-workbench/ANVIL/blob/main/docs/security-model.md",
          defaultConfiguration: { level },
        });
      }

      results.push({
        ruleId: finding.id,
        level,
        message: { text: finding.message },
        locations: [
          {
            physicalLocation: {
              artifactLocation: {
                uri: finding.file.replace(/\\/g, "/"),
                uriBaseId: "%SRCROOT%",
              },
              region: {
                startLine: finding.line && finding.line > 0 ? finding.line : 1,
                startColumn: 1,
              },
            },
          },
        ],
      });
    }

    // Include suppressed findings with standard SARIF suppression metadata if not filtered out
    if (!filterSuppressed && options.suppressedFindings) {
      for (const finding of options.suppressedFindings) {
        const level =
          finding.source === "security" ? mapSecuritySeverity(finding.severity) : mapReviewSeverity(finding.severity);
        results.push({
          ruleId: finding.id,
          level,
          message: { text: finding.message },
          suppressions: [
            {
              kind: "external",
              status: "accepted",
              justification: "Suppressed via ANVIL baseline",
            },
          ],
          locations: [
            {
              physicalLocation: {
                artifactLocation: {
                  uri: finding.file.replace(/\\/g, "/"),
                  uriBaseId: "%SRCROOT%",
                },
                region: {
                  startLine: finding.line && finding.line > 0 ? finding.line : 1,
                  startColumn: 1,
                },
              },
            },
          ],
        });
      }
    }

    // Include inline suppressions with standard SARIF inSource suppression metadata
    if (options.inlineSuppressions) {
      for (const s of options.inlineSuppressions) {
        const level = mapReviewSeverity(
          s.ruleId === "ANVIL-R001" ? "high" : s.ruleId === "ANVIL-R004" || s.ruleId === "ANVIL-R005" ? "low" : "medium"
        );
        if (!rulesMap.has(s.ruleId)) {
          rulesMap.set(s.ruleId, {
            id: s.ruleId,
            name: `Review_${s.ruleId}`,
            shortDescription: { text: `Rule ${s.ruleId} suppressed in source code` },
            helpUri: "https://github.com/anvil-workbench/ANVIL/blob/main/docs/security-model.md",
            defaultConfiguration: { level },
          });
        }
        results.push({
          ruleId: s.ruleId,
          level,
          message: {
            text: s.reason
              ? `Suppressed ${s.ruleId}: ${s.reason}`
              : `Suppressed ${s.ruleId} via ${s.type} in-source comment`,
          },
          suppressions: [
            {
              kind: "inSource",
              status: "accepted",
              justification: s.reason || `Suppressed in source via anvil-disable-${s.type}`,
            },
          ],
          locations: [
            {
              physicalLocation: {
                artifactLocation: {
                  uri: s.file.replace(/\\/g, "/"),
                  uriBaseId: "%SRCROOT%",
                },
                region: {
                  startLine: s.line && s.line > 0 ? s.line : 1,
                  startColumn: 1,
                },
              },
            },
          ],
        });
      }
    }
  } else {
    // Case 2: Raw security and review reports
    const suppressed = options.suppressedFingerprints ?? new Set<string>();

    if (options.securityReport) {
      for (const finding of options.securityReport.findings) {
        const normFile = finding.file.replace(/\\/g, "/");
        const fp = `security:${finding.rule}:${normFile}:${finding.line ?? 1}`;
        const isSuppressed = suppressed.has(fp);

        if (isSuppressed && filterSuppressed) continue;

        const level = mapSecuritySeverity(finding.severity);
        if (!rulesMap.has(finding.rule)) {
          rulesMap.set(finding.rule, {
            id: finding.rule,
            name: finding.category ? `Security_${finding.category}` : finding.rule,
            shortDescription: { text: finding.description || "Security finding" },
            helpUri: "https://github.com/anvil-workbench/ANVIL/blob/main/docs/security-model.md",
            defaultConfiguration: { level },
          });
        }

        const result: SarifResult = {
          ruleId: finding.rule,
          level,
          message: {
            text: `${finding.description}${finding.remediation ? ` Remediation: ${finding.remediation}` : ""}`,
          },
          locations: [
            {
              physicalLocation: {
                artifactLocation: {
                  uri: normFile,
                  uriBaseId: "%SRCROOT%",
                },
                region: {
                  startLine: finding.line && finding.line > 0 ? finding.line : 1,
                  startColumn: 1,
                },
              },
            },
          ],
        };

        if (isSuppressed) {
          result.suppressions = [
            {
              kind: "external",
              status: "accepted",
              justification: "Suppressed via ANVIL baseline",
            },
          ];
        }

        results.push(result);
      }
    }

    if (options.reviewReport) {
      for (const finding of options.reviewReport.findings) {
        const normFile = finding.file.replace(/\\/g, "/");
        const fp = `review:${finding.ruleId}:${normFile}:${finding.line}`;
        const isSuppressed = suppressed.has(fp);

        if (isSuppressed && filterSuppressed) continue;

        const level = mapReviewSeverity(finding.severity);
        if (!rulesMap.has(finding.ruleId)) {
          rulesMap.set(finding.ruleId, {
            id: finding.ruleId,
            name: finding.title.replace(/[^A-Za-z0-9_]/g, "_"),
            shortDescription: { text: finding.title },
            fullDescription: { text: finding.recommendation },
            helpUri: "https://github.com/anvil-workbench/ANVIL/blob/main/docs/security-model.md",
            defaultConfiguration: { level },
          });
        }

        const result: SarifResult = {
          ruleId: finding.ruleId,
          level,
          message: {
            text: `${finding.title}: ${finding.recommendation}`,
          },
          locations: [
            {
              physicalLocation: {
                artifactLocation: {
                  uri: normFile,
                  uriBaseId: "%SRCROOT%",
                },
                region: {
                  startLine: finding.line && finding.line > 0 ? finding.line : 1,
                  startColumn: 1,
                },
              },
            },
          ],
        };

        if (isSuppressed) {
          result.suppressions = [
            {
              kind: "external",
              status: "accepted",
              justification: "Suppressed via ANVIL baseline",
            },
          ];
        }

        results.push(result);
      }
    }

    const inlineList = options.inlineSuppressions ?? options.reviewReport?.inlineSuppressions;
    if (inlineList) {
      for (const s of inlineList) {
        const level = mapReviewSeverity(
          s.ruleId === "ANVIL-R001" ? "high" : s.ruleId === "ANVIL-R004" || s.ruleId === "ANVIL-R005" ? "low" : "medium"
        );
        if (!rulesMap.has(s.ruleId)) {
          rulesMap.set(s.ruleId, {
            id: s.ruleId,
            name: `Review_${s.ruleId}`,
            shortDescription: { text: `Rule ${s.ruleId} suppressed in source code` },
            helpUri: "https://github.com/anvil-workbench/ANVIL/blob/main/docs/security-model.md",
            defaultConfiguration: { level },
          });
        }
        results.push({
          ruleId: s.ruleId,
          level,
          message: {
            text: s.reason
              ? `Suppressed ${s.ruleId}: ${s.reason}`
              : `Suppressed ${s.ruleId} via ${s.type} in-source comment`,
          },
          suppressions: [
            {
              kind: "inSource",
              status: "accepted",
              justification: s.reason || `Suppressed in source via anvil-disable-${s.type}`,
            },
          ],
          locations: [
            {
              physicalLocation: {
                artifactLocation: {
                  uri: s.file.replace(/\\/g, "/"),
                  uriBaseId: "%SRCROOT%",
                },
                region: {
                  startLine: s.line && s.line > 0 ? s.line : 1,
                  startColumn: 1,
                },
              },
            },
          ],
        });
      }
    }
  }

  const sarifLog = {
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "ANVIL",
            version,
            informationUri: "https://github.com/anvil-workbench/ANVIL",
            rules: Array.from(rulesMap.values()),
          },
        },
        results,
      },
    ],
  };

  return JSON.stringify(sarifLog, null, 2);
}

/**
 * Imports an external OASIS SARIF v2.1.0 report (e.g. from Semgrep, CodeQL, Snyk, or AgentShield)
 * and normalizes its findings into ANVIL NormalizedFinding records for unified policy gating.
 */
export async function importExternalSarif(filePath: string): Promise<NormalizedFinding[]> {
  const fullPath = path.resolve(filePath);
  let raw: string;
  try {
    raw = await readFile(fullPath, "utf-8");
  } catch (err) {
    throw new Error(
      `Failed to read external SARIF file at ${filePath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  let sarif: {
    runs?: Array<{
      tool?: { driver?: { name?: string } };
      results?: Array<{
        ruleId?: string;
        level?: string;
        message?: { text?: string };
        locations?: Array<{
          physicalLocation?: {
            artifactLocation?: { uri?: string };
            region?: { startLine?: number; snippet?: { text?: string } };
          };
        }>;
      }>;
    }>;
  };

  try {
    sarif = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Failed to parse external SARIF JSON at ${filePath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const findings: NormalizedFinding[] = [];
  const runs = Array.isArray(sarif.runs) ? sarif.runs : [];

  for (const run of runs) {
    const rawDriver = run.tool?.driver?.name ? String(run.tool.driver.name).toLowerCase() : "external";
    const toolName = rawDriver.replace(/[^a-z0-9_-]/g, "");
    const results = Array.isArray(run.results) ? run.results : [];

    for (const result of results) {
      const ruleId = typeof result.ruleId === "string" && result.ruleId.trim() ? result.ruleId : "SARIF-EXTERNAL";
      const level = result.level ?? "warning";
      let severity: "critical" | "high" | "medium" | "low" = "medium";
      if (level === "error") {
        severity = /secret|credential|token|privilege|injection/i.test(ruleId) ? "critical" : "high";
      } else if (level === "warning") {
        severity = "medium";
      } else {
        severity = "low";
      }

      const loc = result.locations?.[0]?.physicalLocation;
      const fileUri = loc?.artifactLocation?.uri ?? "unknown";
      const normFile = fileUri.replace(/^file:\/\/\/?/, "").replace(/\\/g, "/");
      const line = loc?.region?.startLine && loc.region.startLine > 0 ? loc.region.startLine : 1;
      const message = result.message?.text ?? `External finding from ${toolName}: ${ruleId}`;
      const snippet = loc?.region?.snippet?.text;
      const snippetHash = snippet ? createHash("sha256").update(snippet.trim()).digest("hex").slice(0, 16) : undefined;
      const fp = snippetHash
        ? `${toolName}:${ruleId}:${normFile}:${snippetHash}`
        : `${toolName}:${ruleId}:${normFile}:L${line}`;
      const legacyFp = `${toolName}:${ruleId}:${normFile}:${line}`;

      findings.push({
        id: ruleId,
        source: "review",
        category: /secret|credential|token/i.test(ruleId) ? "secret" : "external-analysis",
        severity,
        confidence: "high",
        file: normFile,
        line,
        message,
        snippet,
        snippetHash,
        fingerprint: fp,
        legacyFingerprint: legacyFp,
      });
    }
  }

  return findings;
}
