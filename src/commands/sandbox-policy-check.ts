import { formatSandboxPolicyValidation, loadSandboxPolicy } from "../core/sandbox-policy.js";

export async function runSandboxPolicyCheck(_command: string, rest: string[]): Promise<void> {
  const policyPath = rest[0];
  if (!policyPath) {
    process.stderr.write("Usage: anvil sandbox-policy-check POLICY.json\n");
    process.exitCode = 1;
    return;
  }
  const result = await loadSandboxPolicy(policyPath);
  process.stdout.write(formatSandboxPolicyValidation(result) + "\n");
  if (!result.valid) process.exitCode = 1;
  return;
}
