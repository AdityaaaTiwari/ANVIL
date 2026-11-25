import path from "node:path";
import {
  captureAgentConfigVersion,
  compareAgentConfigVersions,
  formatAgentConfigVersion,
  listAgentConfigVersions,
  loadAgentConfigVersion,
} from "../core/agent-config-versioning.js";

export async function runAgentConfig(_command: string, rest: string[]): Promise<void> {
  const action = rest[0] ?? "list";
  const pathIndex = rest.indexOf("--path");
  const target = path.resolve(pathIndex >= 0 ? (rest[pathIndex + 1] ?? ".") : ".");
  const ids = rest
    .slice(1)
    .filter(
      (arg, index, all) =>
        !arg.startsWith("--") &&
        all[index - 1] !== "--path" &&
        all[index - 1] !== "--note" &&
        all[index - 1] !== "--reviewer"
    );
  const option = (name: string) => {
    const index = rest.indexOf(name);
    return index >= 0 ? rest[index + 1] : undefined;
  };
  try {
    if (action === "snapshot") {
      const version = await captureAgentConfigVersion(target, {
        note: option("--note") ?? "",
        createdBy: option("--author") ?? "local-user",
      });
      process.stdout.write(formatAgentConfigVersion(version) + "\n");
    } else if (action === "list") {
      const versions = await listAgentConfigVersions(target);
      process.stdout.write(
        versions.length
          ? versions
              .map(
                (item) =>
                  item.id + "  " + item.status.padEnd(9) + "  " + item.createdAt + "  " + item.files.length + " files"
              )
              .join("\n") + "\n"
          : "No agent configuration snapshots found. Run anvil agent-config snapshot first.\n"
      );
    } else if (action === "show") {
      const id = ids[0];
      if (!id) throw new Error("Usage: anvil agent-config show CONFIG_ID --path PROJECT");
      process.stdout.write(formatAgentConfigVersion(await loadAgentConfigVersion(target, id)) + "\n");
    } else if (action === "diff") {
      if (ids.length < 2) throw new Error("Usage: anvil agent-config diff BEFORE_ID AFTER_ID --path PROJECT");
      const [before, after] = await Promise.all([
        loadAgentConfigVersion(target, ids[0]!),
        loadAgentConfigVersion(target, ids[1]!),
      ]);
      const diff = compareAgentConfigVersions(before, after);
      process.stdout.write(
        [
          "Agent configuration diff",
          "Added: " + (diff.added.join(", ") || "none"),
          "Changed: " + (diff.changed.join(", ") || "none"),
          "Removed: " + (diff.removed.join(", ") || "none"),
          "Unchanged: " + diff.unchanged.length,
        ].join("\n") + "\n"
      );
    } else if (action === "approve") {
      throw new Error(
        "Direct snapshot approval is disabled. Use anvil agent-release prepare with a release-ready benchmark matrix, then anvil agent-release approve RELEASE_ID --reviewer NAME."
      );
    } else throw new Error("Unknown action. Use snapshot, list, show or diff.");
  } catch (error) {
    process.stderr.write(
      "ANVIL agent configuration command failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
