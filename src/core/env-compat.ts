/**
 * Environment variable lookup helper for ANVIL.
 */

/**
 * Reads a non-empty `ANVIL_*` environment variable, returning `defaultValue` when unset or empty.
 */
export function getAnvilEnv(anvilKey: string, defaultValue?: string): string | undefined {
  const anvilVal = process.env[anvilKey];
  if (anvilVal !== undefined && anvilVal !== "") {
    return anvilVal;
  }
  return defaultValue;
}
