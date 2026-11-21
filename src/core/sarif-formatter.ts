import type { SecurityAuditReport, SecurityFinding } from "./security-scanner.js";
import type { CodeReviewReport, ReviewFinding } from "./code-review.js";

export interface SarifFormatOptions {
  securityReport?: SecurityAuditReport;
  reviewReport?: CodeReviewReport;
  targetRoot?: string;
  version?: string;
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
 */
export function generateSarif(options: SarifFormatOptions): string {
  const rulesMap = new Map<string, SarifRule>();
  const results: SarifResult[] = [];

  if (options.securityReport) {
    for (const finding of options.securityReport.findings) {
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

      results.push({
        ruleId: finding.rule,
        level,
        message: {
          text: `${finding.description}${finding.remediation ? ` Remediation: ${finding.remediation}` : ""}`,
        },
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

  if (options.reviewReport) {
    for (const finding of options.reviewReport.findings) {
      const level = mapReviewSeverity(finding.severity);
      if (!rulesMap.has(finding.ruleId)) {
        rulesMap.set(finding.ruleId, {
          id: finding.ruleId,
          name: finding.title.replace(/[^A-Za-z0-9_]/g, "_"),
          shortDescription: { text: finding.title },
          fullDescription: { text: finding.recommendation },
          helpUri: "https://github.com/anvil-workbench/ANVIL/blob/main/docs/ci-gate-and-sarif.md",
          defaultConfiguration: { level },
        });
      }

      results.push({
        ruleId: finding.ruleId,
        level,
        message: {
          text: `${finding.title}: ${finding.recommendation}`,
        },
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

  const sarifLog = {
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "ANVIL",
            version: options.version ?? "1.0.9",
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
