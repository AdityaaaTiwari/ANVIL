/**
 * Universal harness installer barrel. Renders the ANVIL catalog and MCP server
 * config into supported agent harnesses while tracking hashes safely.
 */
export * from "./harness-installer/types.js";
export { buildInstallPlan } from "./harness-installer/renderers.js";
export {
  applyFileTransaction,
  extractManagedBlock,
  recoverFileTransaction,
  withBlock,
} from "./harness-installer/transactions.js";
export {
  doctorHarness,
  formatDoctorReport,
  formatInstallResult,
  formatUninstallResult,
  installHarness,
  loadInstallState,
  uninstallHarness,
  type DoctorEntry,
  type DoctorReport,
  type DoctorStatus,
  type UninstallResult,
} from "./harness-installer/lifecycle.js";
export {
  AGENT_INSTRUCTIONS,
  applyHarnessPlan,
  formatHarnessPlan,
  hookCommand,
  planHarnessInstall,
} from "./harness-installer/mcp-planner.js";
