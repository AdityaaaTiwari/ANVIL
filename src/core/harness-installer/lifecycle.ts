import { realpath } from "node:fs/promises";
import path from "node:path";
import { INSTALL_PROFILES, type HarnessCatalog, type InstallProfile } from "../harness-catalog.js";
import {
  addClaudeHooks,
  claudeHookEntries,
  readSettingsFile,
  removeClaudeHooks,
  statusLineCommand,
} from "../harness-hooks.js";
import {
  NATIVE_HOOK_FILES,
  NATIVE_HOOK_HARNESSES,
  addNativeHooks,
  nativeHookCommandsPresent,
  nativeHookEntries,
  removeNativeHooks,
} from "../hook-adapters.js";
import { buildInstallPlan } from "./renderers.js";
import {
  applyDurableFileTransaction,
  assertRelativeSafe,
  extractManagedBlock,
  pruneEmptyParents,
  readIfExists,
  recoverFileTransaction,
  resolveInside,
  withBlock,
  withoutBlock,
  type FileTransactionOperation,
} from "./transactions.js";
import {
  CLAUDE_SETTINGS_PATH,
  HARNESS_TARGETS,
  INSTALL_STATE_PATH,
  LEGACY_STATE_SCHEMA_VERSION,
  STATE_SCHEMA_VERSION,
  sha256,
  type FileAction,
  type HarnessTarget,
  type InstallChange,
  type InstallOptions,
  type InstallResult,
  type InstallState,
  type InstallStateBlock,
  type InstallStateFile,
  type InstallStateNativeHooks,
  type InstallStateSettings,
} from "./types.js";

export async function loadInstallState(projectPath: string): Promise<InstallState | undefined> {
  const root = await realpath(path.resolve(projectPath));
  const statePathLabel = INSTALL_STATE_PATH;
  const raw = await readIfExists(await resolveInside(root, INSTALL_STATE_PATH));
  if (raw === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      statePathLabel +
        " is not valid JSON. The file was left untouched; restore a valid backup before running install or uninstall."
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(statePathLabel + " must contain a JSON object. The file was left untouched.");
  }
  const candidate = parsed as Record<string, unknown>;
  const version = candidate.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version)) {
    throw new Error(statePathLabel + " is missing a valid schemaVersion. The file was left untouched.");
  }
  if (version > STATE_SCHEMA_VERSION) {
    throw new Error(
      statePathLabel +
        " uses schema version " +
        version +
        ", but this ANVIL CLI supports up to " +
        STATE_SCHEMA_VERSION +
        ". Upgrade ANVIL before modifying or uninstalling this installation; the state file was left untouched."
    );
  }
  if (version !== LEGACY_STATE_SCHEMA_VERSION && version !== STATE_SCHEMA_VERSION) {
    throw new Error(
      statePathLabel +
        " uses unsupported schema version " +
        version +
        ". No migration is available; the file was left untouched."
    );
  }
  const state = candidate as unknown as InstallState;
  const recordedVersion = state.anvilVersion;
  if (
    typeof recordedVersion !== "string" ||
    typeof state.installedAt !== "string" ||
    typeof state.profile !== "string" ||
    !INSTALL_PROFILES.includes(state.profile) ||
    !Array.isArray(state.targets) ||
    !Array.isArray(state.languages) ||
    !state.languages.every((value) => typeof value === "string") ||
    !Array.isArray(state.files) ||
    !Array.isArray(state.blocks)
  ) {
    throw new Error(statePathLabel + " has an invalid state structure. The file was left untouched.");
  }
  for (const target of state.targets) {
    if (typeof target !== "string" || !HARNESS_TARGETS.includes(target as HarnessTarget)) {
      throw new Error(statePathLabel + " contains an unsupported harness target. The file was left untouched.");
    }
  }
  for (const entry of [...state.files, ...state.blocks]) {
    if (
      !entry ||
      typeof entry.path !== "string" ||
      typeof entry.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/i.test(entry.sha256) ||
      !Array.isArray(entry.targets) ||
      !entry.targets.every((target) => typeof target === "string" && HARNESS_TARGETS.includes(target as HarnessTarget))
    ) {
      throw new Error(statePathLabel + " contains an invalid file or block entry. The file was left untouched.");
    }
    assertRelativeSafe(entry.path);
  }
  if (state.settings !== undefined) {
    const settings = state.settings as Partial<InstallStateSettings>;
    if (
      !settings ||
      typeof settings.path !== "string" ||
      !Array.isArray(settings.commands) ||
      !settings.commands.every((command) => typeof command === "string") ||
      !Array.isArray(settings.addedDeny) ||
      !settings.addedDeny.every((rule) => typeof rule === "string") ||
      typeof settings.createdFile !== "boolean"
    ) {
      throw new Error(statePathLabel + " has an invalid settings entry. The file was left untouched.");
    }
    assertRelativeSafe(settings.path);
  }
  if (
    state.extras !== undefined &&
    (!Array.isArray(state.extras) ||
      !state.extras.every(
        (extra) => typeof extra === "string" && /^(?:agent|skill|command|rule):[a-z0-9][a-z0-9/-]{0,80}$/.test(extra)
      ))
  ) {
    throw new Error(statePathLabel + " has an invalid extras list. The file was left untouched.");
  }
  if (state.nativeHooks !== undefined) {
    if (
      !Array.isArray(state.nativeHooks) ||
      !state.nativeHooks.every(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          (NATIVE_HOOK_HARNESSES as readonly string[]).includes((entry as InstallStateNativeHooks).target) &&
          (entry as InstallStateNativeHooks).path === NATIVE_HOOK_FILES[(entry as InstallStateNativeHooks).target] &&
          Array.isArray((entry as InstallStateNativeHooks).commands) &&
          (entry as InstallStateNativeHooks).commands.every((command) => typeof command === "string") &&
          typeof (entry as InstallStateNativeHooks).createdFile === "boolean"
      )
    ) {
      throw new Error(statePathLabel + " has an invalid nativeHooks entry. The file was left untouched.");
    }
  }
  const normalized: InstallState = {
    ...state,
    anvilVersion: recordedVersion,
    schemaVersion: version === LEGACY_STATE_SCHEMA_VERSION ? STATE_SCHEMA_VERSION : version,
  };
  return normalized;
}

export async function installHarness(options: InstallOptions): Promise<InstallResult> {
  const root = await realpath(path.resolve(options.projectPath));
  await recoverFileTransaction(root);
  const plan = await buildInstallPlan({ ...options, projectPath: root });
  const previous = await loadInstallState(root);
  const previousFiles = new Map((previous?.files ?? []).map((entry) => [entry.path, entry]));
  const previousBlocks = new Map((previous?.blocks ?? []).map((entry) => [entry.path, entry]));
  const dryRun = Boolean(options.dryRun);
  const changes: InstallChange[] = [];
  const stateFiles: InstallStateFile[] = [];
  const stateBlocks: InstallStateBlock[] = [];
  const writes: FileTransactionOperation[] = [];

  for (const file of plan.files) {
    const absolute = await resolveInside(root, file.path);
    const current = await readIfExists(absolute);
    const hash = sha256(file.content);
    const owned = previousFiles.get(file.path);
    const record: InstallStateFile = {
      path: file.path,
      sha256: hash,
      targets: file.targets,
      ...(file.item ? { item: file.item } : {}),
    };
    if (current === undefined) {
      changes.push({ path: file.path, action: "create" });
    } else if (current === file.content) {
      changes.push({ path: file.path, action: "unchanged" });
      stateFiles.push(record);
      continue;
    } else if (owned && sha256(current) === owned.sha256) {
      changes.push({ path: file.path, action: "update" });
    } else if (options.force) {
      changes.push({
        path: file.path,
        action: "overwrite",
        detail: owned ? "local edits replaced (--force)" : "existing file replaced (--force)",
      });
    } else {
      changes.push({
        path: file.path,
        action: "conflict",
        detail: owned
          ? "modified since ANVIL installed it; kept (use --force to replace)"
          : "file exists and is not managed by ANVIL; kept (use --force to replace)",
      });
      if (owned) stateFiles.push(owned);
      continue;
    }
    stateFiles.push(record);
    writes.push({ path: absolute, content: file.content });
  }

  const planned = new Set(plan.files.map((file) => file.path));
  for (const [stalePath, entry] of previousFiles) {
    if (planned.has(stalePath)) continue;
    const absolute = await resolveInside(root, stalePath);
    const current = await readIfExists(absolute);
    if (current === undefined) continue;
    if (sha256(current) === entry.sha256) {
      changes.push({ path: stalePath, action: "remove", detail: "no longer selected" });
      writes.push({ path: absolute, content: null });
    } else {
      changes.push({
        path: stalePath,
        action: "keep-modified",
        detail: "no longer selected but locally modified; kept",
      });
    }
  }

  for (const block of plan.blocks) {
    const absolute = await resolveInside(root, block.path);
    const current = await readIfExists(absolute);
    const owned = previousBlocks.get(block.path);
    const existingBlock = current === undefined ? undefined : extractManagedBlock(current)?.block;
    const record: InstallStateBlock = {
      path: block.path,
      sha256: sha256(block.content),
      targets: block.targets,
      createdFile: owned?.createdFile ?? current === undefined,
    };
    if (existingBlock === block.content) {
      changes.push({ path: block.path, action: "unchanged", detail: "managed block" });
    } else if (existingBlock !== undefined && owned && sha256(existingBlock) !== owned.sha256 && !options.force) {
      changes.push({
        path: block.path,
        action: "conflict",
        detail: "managed block edited by hand; kept (use --force to replace)",
      });
      stateBlocks.push(owned);
      continue;
    } else {
      changes.push({ path: block.path, action: current === undefined ? "create" : "update", detail: "managed block" });
      writes.push({ path: absolute, content: withBlock(current, block.content) });
    }
    stateBlocks.push(record);
  }
  const plannedBlocks = new Set(plan.blocks.map((block) => block.path));
  for (const [stalePath, entry] of previousBlocks) {
    if (plannedBlocks.has(stalePath)) continue;
    const absolute = await resolveInside(root, stalePath);
    const current = await readIfExists(absolute);
    if (current === undefined) continue;
    changes.push({ path: stalePath, action: "remove", detail: "managed block no longer selected" });
    const remaining = withoutBlock(current);
    writes.push({ path: absolute, content: !remaining && entry.createdFile ? null : remaining });
  }

  let stateSettings: InstallStateSettings | undefined;
  const wantHooks = Boolean(options.hooks) && plan.targets.includes("claude");
  if (wantHooks || previous?.settings) {
    const absolute = await resolveInside(root, CLAUDE_SETTINGS_PATH);
    let current: Awaited<ReturnType<typeof readSettingsFile>> | undefined;
    try {
      current = await readSettingsFile(absolute);
    } catch (error) {
      changes.push({
        path: CLAUDE_SETTINGS_PATH,
        action: "conflict",
        detail: `cannot merge hooks: ${error instanceof Error ? error.message : String(error)}`,
      });
      if (previous?.settings) stateSettings = previous.settings;
    }
    if (current) {
      const previousCommands = previous?.settings?.commands ?? [];
      if (wantHooks) {
        const entries = claudeHookEntries(options.hookCommand);
        const statusCommand = statusLineCommand(options.hookCommand);
        const wantStatusLine = options.statusLine ?? previousCommands.some((command) => / statusline$/.test(command));
        const base = removeClaudeHooks(current.settings, previousCommands);
        const {
          settings: next,
          addedDeny,
          statusLine,
        } = addClaudeHooks(base, entries, wantStatusLine ? { statusLineCommand: statusCommand } : {});
        if (wantStatusLine && !statusLine) {
          changes.push({ path: CLAUDE_SETTINGS_PATH, action: "unchanged", detail: "kept your existing statusLine" });
        }
        const keptDeny = (previous?.settings?.addedDeny ?? []).filter(
          (rule) => Array.isArray(next.permissions?.deny) && (next.permissions.deny as unknown[]).includes(rule)
        );
        stateSettings = {
          path: CLAUDE_SETTINGS_PATH,
          commands: [...entries.map((entry) => entry.command), ...(statusLine ? [statusCommand] : [])],
          addedDeny: [...new Set([...keptDeny, ...addedDeny])],
          createdFile: previous?.settings?.createdFile ?? !current.existed,
        };
        if (JSON.stringify(next) === JSON.stringify(current.settings)) {
          changes.push({ path: CLAUDE_SETTINGS_PATH, action: "unchanged", detail: "ANVIL hooks" });
        } else {
          changes.push({
            path: CLAUDE_SETTINGS_PATH,
            action: current.existed ? "update" : "create",
            detail: "ANVIL hooks merged",
          });
          writes.push({ path: absolute, content: `${JSON.stringify(next, null, 2)}\n` });
        }
      } else if (previous?.settings && current.existed) {
        const next = removeClaudeHooks(current.settings, previousCommands, previous.settings.addedDeny);
        changes.push({ path: CLAUDE_SETTINGS_PATH, action: "remove", detail: "ANVIL hooks no longer selected" });
        writes.push({
          path: absolute,
          content:
            !Object.keys(next).length && previous.settings?.createdFile ? null : `${JSON.stringify(next, null, 2)}\n`,
        });
      }
    }
  }

  const stateNativeHooks: InstallStateNativeHooks[] = [];
  for (const target of NATIVE_HOOK_HARNESSES) {
    const previousEntry = previous?.nativeHooks?.find((entry) => entry.target === target);
    const want = Boolean(options.hooks) && plan.targets.includes(target);
    if (!want && !previousEntry) continue;
    const file = NATIVE_HOOK_FILES[target];
    const absolute = await resolveInside(root, file);
    let current: Awaited<ReturnType<typeof readSettingsFile>> | undefined;
    try {
      current = await readSettingsFile(absolute);
    } catch (error) {
      changes.push({
        path: file,
        action: "conflict",
        detail: `cannot merge ${target} hooks: ${error instanceof Error ? error.message : String(error)}`,
      });
      if (previousEntry) stateNativeHooks.push(previousEntry);
      continue;
    }
    const previousCommands = previousEntry?.commands ?? [];
    if (want) {
      const entries = nativeHookEntries(target, options.hookCommand);
      const next = addNativeHooks(target, current.settings, entries, previousCommands);
      stateNativeHooks.push({
        target,
        path: file,
        commands: entries.map((entry) => entry.command),
        createdFile: previousEntry?.createdFile ?? !current.existed,
      });
      if (JSON.stringify(next) === JSON.stringify(current.settings)) {
        changes.push({ path: file, action: "unchanged", detail: `ANVIL ${target} hooks` });
      } else {
        changes.push({
          path: file,
          action: current.existed ? "update" : "create",
          detail: `ANVIL ${target} hooks merged`,
        });
        writes.push({ path: absolute, content: `${JSON.stringify(next, null, 2)}\n` });
      }
    } else if (previousEntry && current.existed) {
      const next = removeNativeHooks(target, current.settings, previousCommands);
      changes.push({ path: file, action: "remove", detail: `ANVIL ${target} hooks no longer selected` });
      writes.push({
        path: absolute,
        content: !Object.keys(next).length && previousEntry.createdFile ? null : `${JSON.stringify(next, null, 2)}\n`,
      });
    }
  }

  const conflicts = changes.filter((change) => change.action === "conflict").length;
  if (!dryRun) {
    const version = options.anvilVersion ?? "1.4.0";
    const state: InstallState = {
      schemaVersion: STATE_SCHEMA_VERSION,
      anvilVersion: version,
      installedAt: (options.now ?? (() => new Date()))().toISOString(),
      profile: plan.profile,
      targets: plan.targets,
      languages: plan.languages,
      ...(plan.extras.length ? { extras: plan.extras } : {}),
      files: stateFiles.sort((a, b) => a.path.localeCompare(b.path)),
      blocks: stateBlocks.sort((a, b) => a.path.localeCompare(b.path)),
      ...(stateSettings ? { settings: stateSettings } : {}),
      ...(stateNativeHooks.length ? { nativeHooks: stateNativeHooks } : {}),
    };
    writes.push({
      path: await resolveInside(root, INSTALL_STATE_PATH),
      content: `${JSON.stringify(state, null, 2)}\n`,
    });
    await applyDurableFileTransaction(root, writes);
  }
  return { dryRun, plan, changes, conflicts, statePath: INSTALL_STATE_PATH };
}

export interface UninstallResult {
  dryRun: boolean;
  changes: InstallChange[];
  installed: boolean;
}

export async function uninstallHarness(options: {
  projectPath: string;
  dryRun?: boolean;
  force?: boolean;
}): Promise<UninstallResult> {
  const root = await realpath(path.resolve(options.projectPath));
  await recoverFileTransaction(root);
  const state = await loadInstallState(root);
  if (!state) return { dryRun: Boolean(options.dryRun), changes: [], installed: false };
  const changes: InstallChange[] = [];
  const operations: FileTransactionOperation[] = [];
  const pruneAfterCommit: string[] = [];
  const remainingFiles: InstallStateFile[] = [];
  const remainingBlocks: InstallStateBlock[] = [];
  let remainingSettings: InstallStateSettings | undefined;

  for (const entry of state.files) {
    const absolute = await resolveInside(root, entry.path);
    const current = await readIfExists(absolute);
    if (current === undefined) continue;
    if (sha256(current) === entry.sha256 || options.force) {
      changes.push({ path: entry.path, action: "remove" });
      operations.push({ path: absolute, content: null });
      pruneAfterCommit.push(absolute);
    } else {
      changes.push({
        path: entry.path,
        action: "keep-modified",
        detail: "locally modified; kept (use --force to remove)",
      });
      remainingFiles.push(entry);
    }
  }

  for (const entry of state.blocks) {
    const absolute = await resolveInside(root, entry.path);
    const current = await readIfExists(absolute);
    if (current === undefined) continue;
    const managed = extractManagedBlock(current);
    if (!managed) continue;
    if (sha256(managed.block) !== entry.sha256 && !options.force) {
      changes.push({
        path: entry.path,
        action: "keep-modified",
        detail: "managed block edited by hand; kept (use --force to remove)",
      });
      remainingBlocks.push(entry);
      continue;
    }
    changes.push({ path: entry.path, action: "remove", detail: "managed block" });
    const remaining = withoutBlock(current);
    operations.push({ path: absolute, content: !remaining && entry.createdFile ? null : remaining });
    if (!remaining && entry.createdFile) pruneAfterCommit.push(absolute);
  }

  if (state.settings) {
    const absolute = await resolveInside(root, state.settings.path);
    try {
      const current = await readSettingsFile(absolute);
      if (current.existed) {
        const next = removeClaudeHooks(current.settings, state.settings.commands, state.settings.addedDeny);
        changes.push({ path: state.settings.path, action: "remove", detail: "ANVIL hooks" });
        const createdFile = state.settings.createdFile;
        operations.push({
          path: absolute,
          content: !Object.keys(next).length && createdFile ? null : `${JSON.stringify(next, null, 2)}\n`,
        });
        if (!Object.keys(next).length && createdFile) pruneAfterCommit.push(absolute);
      }
    } catch (error) {
      changes.push({
        path: state.settings.path,
        action: "keep-modified",
        detail: `could not remove ANVIL hooks: ${error instanceof Error ? error.message : String(error)}`,
      });
      remainingSettings = state.settings;
    }
  }

  const remainingNativeHooks: InstallStateNativeHooks[] = [];
  for (const entry of state.nativeHooks ?? []) {
    const absolute = await resolveInside(root, entry.path);
    try {
      const current = await readSettingsFile(absolute);
      if (current.existed) {
        const next = removeNativeHooks(entry.target, current.settings, entry.commands);
        changes.push({ path: entry.path, action: "remove", detail: `ANVIL ${entry.target} hooks` });
        const drop = !Object.keys(next).length && entry.createdFile;
        operations.push({ path: absolute, content: drop ? null : `${JSON.stringify(next, null, 2)}\n` });
        if (drop) pruneAfterCommit.push(absolute);
      }
    } catch (error) {
      changes.push({
        path: entry.path,
        action: "keep-modified",
        detail: `could not remove ANVIL ${entry.target} hooks: ${error instanceof Error ? error.message : String(error)}`,
      });
      remainingNativeHooks.push(entry);
    }
  }

  if (!options.dryRun) {
    const { nativeHooks: _installedNativeHooks, ...stateWithoutNative } = state;
    const remainingState: InstallState = {
      ...stateWithoutNative,
      files: remainingFiles,
      blocks: remainingBlocks,
      ...(remainingSettings ? { settings: remainingSettings } : {}),
      ...(remainingNativeHooks.length ? { nativeHooks: remainingNativeHooks } : {}),
    };
    const statePath = await resolveInside(root, INSTALL_STATE_PATH);
    if (remainingFiles.length || remainingBlocks.length || remainingSettings || remainingNativeHooks.length) {
      operations.push({ path: statePath, content: `${JSON.stringify(remainingState, null, 2)}\n` });
    } else {
      operations.push({ path: statePath, content: null });
      pruneAfterCommit.push(statePath);
    }
    await applyDurableFileTransaction(root, operations);
    for (const file of pruneAfterCommit) await pruneEmptyParents(root, file);
  }
  return { dryRun: Boolean(options.dryRun), changes, installed: true };
}

export type DoctorStatus = "ok" | "missing" | "modified" | "outdated";
export interface DoctorEntry {
  path: string;
  status: DoctorStatus;
  detail?: string;
}
export interface DoctorReport {
  installed: boolean;
  healthy: boolean;
  anvilVersion?: string;
  currentVersion: string;
  profile?: InstallProfile;
  targets?: HarnessTarget[];
  languages?: string[];
  hooks?: boolean;
  /** Harnesses with ANVIL runtime hooks installed. */
  hookTargets?: HarnessTarget[];
  /** Extra catalog items added with --with. */
  extras?: string[];
  entries: DoctorEntry[];
  summary: Record<DoctorStatus, number>;
  recommendations: string[];
}

export async function doctorHarness(options: {
  projectPath: string;
  anvilVersion?: string;
  catalog?: HarnessCatalog;
}): Promise<DoctorReport> {
  const currentVersion = options.anvilVersion ?? "1.4.0";
  const root = await realpath(path.resolve(options.projectPath));
  const state = await loadInstallState(root);
  const summary: Record<DoctorStatus, number> = { ok: 0, missing: 0, modified: 0, outdated: 0 };
  if (!state) {
    return {
      installed: false,
      healthy: false,
      currentVersion,
      entries: [],
      summary,
      recommendations: ["Run `anvil install` to add ANVIL agents, skills, commands and rules to your harnesses."],
    };
  }
  const installedVersion = state.anvilVersion ?? currentVersion;
  const plan = await buildInstallPlan({
    projectPath: root,
    anvilVersion: currentVersion,
    profile: state.profile,
    targets: state.targets,
    languages: state.languages,
    ...(state.extras?.length ? { extras: state.extras } : {}),
    ...(options.catalog ? { catalog: options.catalog } : {}),
  });
  const expected = new Map(plan.files.map((file) => [file.path, sha256(file.content)]));
  const expectedBlocks = new Map(plan.blocks.map((block) => [block.path, sha256(block.content)]));
  const entries: DoctorEntry[] = [];
  for (const entry of state.files) {
    const current = await readIfExists(await resolveInside(root, entry.path));
    if (current === undefined) entries.push({ path: entry.path, status: "missing" });
    else if (sha256(current) !== entry.sha256) {
      entries.push({ path: entry.path, status: "modified", detail: "edited after install" });
    } else if (expected.has(entry.path) && expected.get(entry.path) !== entry.sha256) {
      entries.push({ path: entry.path, status: "outdated", detail: "a newer catalog version is available" });
    } else if (!expected.has(entry.path)) {
      entries.push({ path: entry.path, status: "outdated", detail: "no longer part of the catalog" });
    } else entries.push({ path: entry.path, status: "ok" });
  }
  const installedPaths = new Set(state.files.map((entry) => entry.path));
  for (const file of plan.files) {
    if (!installedPaths.has(file.path)) {
      entries.push({ path: file.path, status: "outdated", detail: "new catalog item not yet installed" });
    }
  }
  for (const entry of state.blocks) {
    const current = await readIfExists(await resolveInside(root, entry.path));
    let block: string | undefined;
    try {
      block = current === undefined ? undefined : extractManagedBlock(current)?.block;
    } catch (error) {
      entries.push({
        path: entry.path,
        status: "modified",
        detail: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    if (block === undefined) entries.push({ path: entry.path, status: "missing", detail: "managed block" });
    else if (sha256(block) !== entry.sha256) {
      entries.push({ path: entry.path, status: "modified", detail: "managed block edited" });
    } else if (expectedBlocks.get(entry.path) !== entry.sha256) {
      entries.push({ path: entry.path, status: "outdated", detail: "managed block" });
    } else entries.push({ path: entry.path, status: "ok", detail: "managed block" });
  }
  if (state.settings) {
    try {
      const current = await readSettingsFile(await resolveInside(root, state.settings.path));
      const text = JSON.stringify({
        hooks: current.settings.hooks ?? {},
        statusLine: current.settings.statusLine ?? null,
      });
      const missing = state.settings.commands.filter((command) => !text.includes(JSON.stringify(command)));
      entries.push(
        missing.length
          ? { path: state.settings.path, status: "missing", detail: `ANVIL hooks missing: ${missing.join(", ")}` }
          : { path: state.settings.path, status: "ok", detail: "ANVIL hooks" }
      );
    } catch (error) {
      entries.push({
        path: state.settings.path,
        status: "modified",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
  for (const entry of state.nativeHooks ?? []) {
    try {
      const current = await readSettingsFile(await resolveInside(root, entry.path));
      const missing = nativeHookCommandsPresent(current.settings, entry.commands);
      entries.push(
        missing.length
          ? {
              path: entry.path,
              status: "missing",
              detail: `ANVIL ${entry.target} hooks missing: ${missing.join(", ")}`,
            }
          : { path: entry.path, status: "ok", detail: `ANVIL ${entry.target} hooks` }
      );
    } catch (error) {
      entries.push({
        path: entry.path,
        status: "modified",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
  for (const entry of entries) summary[entry.status] += 1;
  const recommendations: string[] = [];
  if (summary.missing || summary.outdated) {
    recommendations.push("Run `anvil install` (or `anvil repair`) to restore missing files and apply catalog updates.");
  }
  if (summary.modified) {
    recommendations.push(
      "Modified files are preserved. Run `anvil install --force` only if you want to discard local edits."
    );
  }
  if (installedVersion !== currentVersion) {
    recommendations.push(`Installed by ANVIL ${installedVersion}; current CLI is ${currentVersion}.`);
  }
  return {
    installed: true,
    healthy: summary.missing === 0 && summary.outdated === 0,
    anvilVersion: installedVersion,
    currentVersion,
    profile: state.profile,
    targets: state.targets,
    languages: state.languages,
    hooks: Boolean(state.settings) || Boolean(state.nativeHooks?.length),
    ...(state.extras?.length ? { extras: state.extras } : {}),
    hookTargets: [
      ...(state.settings ? ["claude" as HarnessTarget] : []),
      ...(state.nativeHooks ?? []).map((entry) => entry.target as HarnessTarget),
    ],
    entries: entries.sort((a, b) => a.path.localeCompare(b.path)),
    summary,
    recommendations,
  };
}

export function formatInstallResult(result: InstallResult): string {
  const counts = new Map<FileAction, number>();
  for (const change of result.changes) counts.set(change.action, (counts.get(change.action) ?? 0) + 1);
  const lines = [
    `${result.dryRun ? "ANVIL install plan (dry run — nothing written)" : "ANVIL install complete"}`,
    `  profile   ${result.plan.profile}`,
    `  targets   ${result.plan.targets.join(", ")}`,
    `  languages ${result.plan.languages.length ? result.plan.languages.join(", ") : "common only"}`,
    `  items     ${result.plan.itemCount} catalog items → ${result.plan.files.length} files, ${result.plan.blocks.length} managed blocks`,
    `  changes   ${[...counts].map(([action, count]) => `${action} ${count}`).join(" · ") || "none"}`,
  ];
  const notable = result.changes.filter((change) => change.action !== "unchanged");
  if (notable.length) {
    lines.push("");
    for (const change of notable.slice(0, 200)) {
      lines.push(`  ${change.action.padEnd(13)} ${change.path}${change.detail ? `  (${change.detail})` : ""}`);
    }
    if (notable.length > 200) lines.push(`  … ${notable.length - 200} more`);
  }
  if (result.conflicts) {
    lines.push(
      "",
      `${result.conflicts} file(s) were kept because they were not written by ANVIL or were edited. Use --force to replace them.`
    );
  }
  if (!result.dryRun) {
    lines.push("", `State recorded in ${result.statePath}. Check health any time with \`anvil doctor\`.`);
  }
  return lines.join("\n");
}

export function formatUninstallResult(result: UninstallResult): string {
  if (!result.installed) return "ANVIL harness files are not installed in this project.";
  const lines = [result.dryRun ? "ANVIL uninstall plan (dry run — nothing removed)" : "ANVIL harness files removed"];
  for (const change of result.changes) {
    lines.push(`  ${change.action.padEnd(13)} ${change.path}${change.detail ? `  (${change.detail})` : ""}`);
  }
  return lines.join("\n");
}

export function formatDoctorReport(report: DoctorReport): string {
  if (!report.installed) {
    return ["ANVIL doctor: harness files not installed.", ...report.recommendations.map((r) => `  → ${r}`)].join("\n");
  }
  const version = report.anvilVersion ?? "unknown";
  const lines = [
    `ANVIL doctor: ${report.healthy ? "healthy" : "needs attention"}`,
    `  installed by ${version} · current ${report.currentVersion} · profile ${report.profile} · targets ${report.targets?.join(", ")}`,
    `  ok ${report.summary.ok} · modified ${report.summary.modified} · missing ${report.summary.missing} · outdated ${report.summary.outdated}`,
  ];
  const problems = report.entries.filter((entry) => entry.status !== "ok");
  if (problems.length) {
    lines.push("");
    for (const entry of problems.slice(0, 200)) {
      lines.push(`  ${entry.status.padEnd(9)} ${entry.path}${entry.detail ? `  (${entry.detail})` : ""}`);
    }
  }
  if (report.recommendations.length) lines.push("", ...report.recommendations.map((r) => `  → ${r}`));
  return lines.join("\n");
}
