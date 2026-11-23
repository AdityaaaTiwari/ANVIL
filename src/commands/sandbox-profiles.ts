import { getSandboxSecurityProfile, listSandboxSecurityProfiles } from "../core/sandbox-security-profiles.js";

export async function runSandboxProfiles(_command: string, rest: string[]): Promise<void> {
  const selected = rest[0];
  try {
    const profiles = selected ? [getSandboxSecurityProfile(selected)] : listSandboxSecurityProfiles();
    for (const profile of profiles) {
      process.stdout.write(
        [
          profile.name + " — " + profile.description,
          "  network=" +
            profile.network +
            ", readOnlyRoot=" +
            profile.readOnlyRoot +
            ", dropAllCapabilities=" +
            profile.dropAllCapabilities +
            ", noNewPrivileges=" +
            profile.noNewPrivileges,
          "  memory=" +
            profile.maxMemory +
            ", cpus=" +
            profile.maxCpus +
            ", processes=" +
            profile.maxProcesses +
            ", requireRootless=" +
            profile.requireRootless,
          "",
        ].join("\n")
      );
    }
  } catch (error) {
    process.stderr.write(
      "ANVIL sandbox profiles failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
