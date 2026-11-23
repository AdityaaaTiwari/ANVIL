import path from "node:path";
import { verifyStagedPatch } from "../core/staged-verification.js";

export async function runPatchVerify(command: string, rest: string[]): Promise<void> {
  const pathIndex = rest.indexOf("--path");
  const target = path.resolve(pathIndex >= 0 ? (rest[pathIndex + 1] ?? ".") : ".");
  const installDependencies = rest.includes("--install-dependencies");
  const sandboxImageIndex = rest.indexOf("--sandbox-image");
  const sandboxImage = sandboxImageIndex >= 0 ? rest[sandboxImageIndex + 1] : undefined;
  const requireRootless = rest.includes("--require-rootless");
  const profileIndex = rest.indexOf("--profile");
  const securityProfile = profileIndex >= 0 ? rest[profileIndex + 1] : undefined;
  const policyIndex = rest.indexOf("--policy");
  const sandboxPolicyPath = policyIndex >= 0 ? rest[policyIndex + 1] : undefined;
  const argsWithoutPath = rest.filter(
    (arg, index) =>
      arg !== "--path" &&
      !(pathIndex >= 0 && index === pathIndex + 1) &&
      arg !== "--install-dependencies" &&
      arg !== "--sandbox-image" &&
      !(sandboxImageIndex >= 0 && index === sandboxImageIndex + 1) &&
      arg !== "--require-rootless" &&
      arg !== "--profile" &&
      !(profileIndex >= 0 && index === profileIndex + 1) &&
      arg !== "--policy" &&
      !(policyIndex >= 0 && index === policyIndex + 1)
  );
  const stageId = argsWithoutPath.find((arg) => !arg.startsWith("--"));
  const script = argsWithoutPath.find((arg, index) => !arg.startsWith("--") && index > 0);
  try {
    if (!stageId || !script)
      throw new Error(
        "Usage: anvil patch-verify PATCH_STAGE_ID SCRIPT [--install-dependencies] [--sandbox-image IMAGE@sha256:DIGEST] [--require-rootless] [--profile balanced|hardened|rootless-required] [--policy POLICY.json] [--path PROJECT]"
      );
    if (sandboxImageIndex >= 0 && !sandboxImage)
      throw new Error("--sandbox-image requires an image pinned by sha256 digest.");
    if (requireRootless && !sandboxImage)
      throw new Error("--require-rootless requires --sandbox-image container execution.");
    if (profileIndex >= 0 && !securityProfile) throw new Error("--profile requires a profile name.");
    if (securityProfile && !["balanced", "hardened", "rootless-required"].includes(securityProfile))
      throw new Error("Unknown sandbox security profile: " + securityProfile);
    if (securityProfile && !sandboxImage) throw new Error("--profile requires --sandbox-image container execution.");
    if (policyIndex >= 0 && (!sandboxPolicyPath || sandboxPolicyPath.startsWith("--")))
      throw new Error("--policy requires a policy file path.");
    if (sandboxPolicyPath && !sandboxImage) throw new Error("--policy requires --sandbox-image container execution.");
    const result = await verifyStagedPatch(target, stageId, script, {
      installDependencies,
      ...(sandboxImage ? { sandboxImage } : {}),
      ...(requireRootless ? { requireRootless } : {}),
      ...(securityProfile ? { securityProfile: securityProfile as "balanced" | "hardened" | "rootless-required" } : {}),
      ...(sandboxPolicyPath ? { sandboxPolicyPath } : {}),
    });
    process.stdout.write(
      "# ANVIL Staged Patch Verification\n\n" +
        "- **Stage:** `" +
        result.stageId +
        "`\n" +
        "- **Patch file:** `" +
        result.file +
        "`\n" +
        "- **Staged SHA-256:** `" +
        result.stagedSha256 +
        "`\n" +
        "- **Snapshot files:** `" +
        result.snapshotFileCount +
        "`\n" +
        "- **Snapshot bytes:** `" +
        result.snapshotBytes +
        "`\n" +
        (result.dependencyInstall
          ? "- **Dependencies:** **" +
            result.dependencyInstall.status.toUpperCase() +
            "** (`" +
            result.dependencyInstall.command +
            "`)\n"
          : "") +
        (sandboxImage
          ? "- **Execution:** **CONTAINER** (`" + sandboxImage + "`)\n"
          : "- **Execution:** **LOCAL HOST**\n") +
        "- **Verification:** **" +
        result.verification.status.toUpperCase() +
        "**\n" +
        "- **Duration:** `" +
        result.verification.durationMs +
        " ms`\n\n" +
        "## Output\n\n```\n" +
        (result.verification.output || "(No output captured.)") +
        "\n```\n\n" +
        "Temporary workspace was removed after verification. " +
        (sandboxImage
          ? "The container runtime and host kernel remain trusted."
          : "Project scripts ran on the local host; this is not an OS-level sandbox.") +
        "\n"
    );
    if (result.verification.status !== "passed") process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write("ANVIL staged verification failed: " + message + "\n");
    process.exitCode = 1;
  }
  return;
}
