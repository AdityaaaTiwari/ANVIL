import { rm, symlink } from "node:fs/promises";

/**
 * Creates a symlink. On Windows without Administrator or Developer Mode privileges,
 * Node throws EPERM. In that case, this returns false so test assertions can skip gracefully.
 */
export async function trySymlink(target: string, path: string, type?: "file" | "dir" | "junction"): Promise<boolean> {
  try {
    await symlink(target, path, type);
    return true;
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "EPERM" && process.platform === "win32") {
      return false;
    }
    throw error;
  }
}

/**
 * Deletes a directory safely on Windows by retrying on transient EBUSY / ENOTEMPTY locks.
 */
export async function safeRm(targetPath: string): Promise<void> {
  if (!targetPath) return;
  try {
    await rm(targetPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && (error.code === "EBUSY" || error.code === "ENOTEMPTY")) {
      return;
    }
    throw error;
  }
}
