import { getSandboxSecurityProfile } from "../core/sandbox-security-profiles.js";
import { detectDockerRootless } from "../core/container-sandbox.js";
import { createSandboxComplianceReport, formatSandboxComplianceReport } from "../core/sandbox-compliance.js";
import { runSandboxProbe } from "./shared.js";

export async function runSandboxCompliance(_command: string, rest: string[]): Promise<void> {
  const profileName = rest[0] ?? "balanced";
  const image = rest[1] ?? "";
  try {
    const profile = getSandboxSecurityProfile(profileName);
    const imageDigestPinned = /^.+@sha256:[a-f0-9]{64}$/.test(image);
    let runtimeAvailable = false;
    let rootless: boolean | null = null;
    try {
      const [version, security] = await Promise.all([
        runSandboxProbe(["--version"]),
        runSandboxProbe(["info", "--format", "{{json .SecurityOptions}}"]),
      ]);
      runtimeAvailable = Boolean(version.trim());
      rootless = detectDockerRootless(security);
    } catch {
      runtimeAvailable = false;
    }
    const report = createSandboxComplianceReport(profile, {
      available: runtimeAvailable,
      rootless,
      imageDigestPinned,
    });
    process.stdout.write(formatSandboxComplianceReport(report) + "\n");
    if (report.status === "non-compliant") process.exitCode = 1;
  } catch (error) {
    process.stderr.write(
      "ANVIL sandbox compliance failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
