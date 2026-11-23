import path from "node:path";
import {
  addProjectMemory,
  buildProjectMemoryContext,
  listProjectMemory,
  removeProjectMemory,
  type ProjectMemoryKind,
} from "../core/project-memory.js";

export async function runMemory(_command: string, rest: string[]): Promise<void> {
  const [action = "list", ...memoryArgs] = rest;
  const option = (name: string) => {
    const index = memoryArgs.indexOf(name);
    return index >= 0 ? memoryArgs[index + 1] : undefined;
  };
  const skipValues = new Set<number>();
  for (let i = 0; i < memoryArgs.length; i++) {
    if (memoryArgs[i]?.startsWith("--")) skipValues.add(i + 1);
  }
  const positional = memoryArgs.filter((arg, i) => !arg.startsWith("--") && !skipValues.has(i));
  const targetPath = positional.find((arg) => !arg.startsWith("mem-")) ?? ".";
  const target = path.resolve(targetPath);
  try {
    if (action === "list") {
      const entries = await listProjectMemory(target);
      process.stdout.write(
        entries.length
          ? entries.map((entry) => `${entry.id} [${entry.kind}] ${entry.content}`).join("\n") + "\n"
          : "No project memory entries.\n"
      );
    } else if (action === "add") {
      const kind = option("--kind") as ProjectMemoryKind | undefined;
      const content = option("--content");
      const allowed: ProjectMemoryKind[] = ["decision", "architecture", "constraint", "preference", "fact"];
      if (!kind || !allowed.includes(kind) || !content)
        throw new Error(
          "Usage: anvil memory add [path] --kind decision|architecture|constraint|preference|fact --content TEXT [--tags a,b]"
        );
      const tags = option("--tags")?.split(",") ?? [];
      const entry = await addProjectMemory(target, { kind, content, tags });
      process.stdout.write(`Saved ${entry.id} to project memory\n`);
    } else if (action === "remove") {
      const id = memoryArgs.find((arg) => arg.startsWith("mem-"));
      if (!id) throw new Error("Usage: anvil memory remove [path] mem-ID");
      const removed = await removeProjectMemory(target, id);
      process.stdout.write(removed ? `Removed ${id}.\n` : `Memory entry ${id} was not found.\n`);
    } else if (action === "context") {
      const query = option("--query") ?? "";
      const context = await buildProjectMemoryContext(target, query);
      process.stdout.write(context.text || "No relevant project memory.\n");
    } else {
      throw new Error("Memory actions: add, list, remove, context.");
    }
  } catch (error) {
    process.stderr.write(
      "ANVIL memory command failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
