/**
 * Environment variable compatibility and deprecation helper for ANVIL.
 *
 * Prioritizes modern ANVIL_* prefixes while gracefully supporting legacy FORGE_*
 * fallbacks with a one-time runtime deprecation warning.
 */

const warnedDeprecatedKeys = new Set<string>();

/**
 * Reads an environment variable with priority given to ANVIL_*, falling back to FORGE_*.
 * Logs a deprecation warning if only the FORGE_* variable is present.
 */
export function getAnvilEnv(
  anvilKey: string,
  forgeKey?: string,
  defaultValue?: string
): string | undefined {
  const anvilVal = process.env[anvilKey];
  if (anvilVal !== undefined && anvilVal !== "") {
    return anvilVal;
  }

  if (forgeKey) {
    const forgeVal = process.env[forgeKey];
    if (forgeVal !== undefined && forgeVal !== "") {
      if (!warnedDeprecatedKeys.has(forgeKey)) {
        warnedDeprecatedKeys.add(forgeKey);
        // Suppress warning during testing or JSON output to avoid breaking JSON parsers
        if (!process.argv.includes("--json") && process.env.NODE_ENV !== "test") {
          console.warn(
            `[ANVIL Deprecation] Environment variable '${forgeKey}' is deprecated and will be removed in ANVIL v2.0. Please use '${anvilKey}' instead.`
          );
        }
      }
      return forgeVal;
    }
  }

  return defaultValue;
}
