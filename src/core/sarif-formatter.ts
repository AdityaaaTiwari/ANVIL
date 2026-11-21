import { readFileSync } from "node:fs";
import type { SecurityAuditReport } from "./security-scanner.js";
import type { CodeReviewReport } from "./code-review.js";
import type { NormalizedFinding } from "./policy-engine.js";

export interface SarifFormatOptions {
  securityReport?: SecurityAuditReport | undefined;
  reviewReport?: CodeReviewReport | undefined;
  activeFindings?: NormalizedFinding[] | undefined;
  suppressedFindings?: NormalizedFinding[] | undefined;
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
  return "1.1.0";
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
