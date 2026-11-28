import { open, stat } from "node:fs/promises";
import path from "node:path";
import { findAll, parseAxml, type AxmlElement } from "./axml.js";
import { isAsar, readAsar } from "./asar.js";
import { parsePlist, type PlistValue } from "./plist.js";
import {
  extractSources,
  looksLikeSourceMap,
  parseSourceMap,
  summarizeSourceMap,
  type SourceMapInfo,
} from "./sourcemap.js";
import { isScannableText, newTextScan, scanText, type AppFinding, type TextScanResult } from "./text-scan.js";
import { isWasm, readWasm, type WasmModuleInfo } from "./wasm.js";
import { analyzeNative, detectNativeFormat, formatHardening, nativeIssues, type NativeHardening } from "./native.js";
import { isZip, readZip, type ZipArchive } from "./zip.js";

/**
 * `anvil app`: look inside a shipped app artifact without any external
 * reverse-engineering tool. Android APK, iOS IPA, Electron app.asar, Java/VS
 * Code/browser-extension zips, WebAssembly, source maps and JS bundles.
 */

export type AppKind =
  "android-apk" | "android-aab" | "ios-ipa" | "electron-asar" | "zip" | "wasm" | "source-map" | "js-bundle" | "native";

export interface AppReport {
  file: string;
  kind: AppKind;
  sizeBytes: number;
  summary: Record<string, unknown>;
  findings: AppFinding[];
  endpoints: Array<{ host: string; count: number }>;
  notes: string[];
}

export const MAX_APP_BYTES = 512 * 1024 * 1024;
const MAX_SCAN_BYTES = 96 * 1024 * 1024;
const MAX_SCAN_FILES = 4_000;

const DANGEROUS_PERMISSIONS = new Set(
  [
    "READ_SMS",
    "SEND_SMS",
    "RECEIVE_SMS",
    "READ_CALL_LOG",
    "READ_CONTACTS",
    "RECORD_AUDIO",
    "CAMERA",
    "ACCESS_FINE_LOCATION",
    "ACCESS_BACKGROUND_LOCATION",
    "READ_PHONE_STATE",
    "READ_EXTERNAL_STORAGE",
    "MANAGE_EXTERNAL_STORAGE",
    "SYSTEM_ALERT_WINDOW",
    "REQUEST_INSTALL_PACKAGES",
    "BIND_ACCESSIBILITY_SERVICE",
    "QUERY_ALL_PACKAGES",
  ].map((name) => `android.permission.${name}`)
);

async function readWhole(file: string): Promise<Buffer> {
  const info = await stat(file);
  if (!info.isFile()) throw new Error(`${file} is not a file`);
  if (info.size > MAX_APP_BYTES) throw new Error(`${file} is larger than ${MAX_APP_BYTES / 1024 / 1024} MiB`);
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(info.size);
    await handle.read(buffer, 0, info.size, 0);
    return buffer;
  } finally {
    await handle.close();
  }
}

export function detectAppKind(file: string, buffer: Buffer): AppKind {
  const ext = path.extname(file).toLowerCase();
  if (isWasm(buffer)) return "wasm";
  if (detectNativeFormat(buffer)) return "native";
  if (isAsar(buffer)) return "electron-asar";
  if (isZip(buffer)) {
    if (ext === ".apk" || ext === ".apks" || ext === ".xapk") return "android-apk";
    if (ext === ".aab") return "android-aab";
    if (ext === ".ipa") return "ios-ipa";
    return "zip";
  }
  const head = buffer.toString("utf8", 0, Math.min(buffer.length, 4096));
  if (ext === ".map" || looksLikeSourceMap(head)) return "source-map";
  if (
    /\.(m?js|cjs)$/.test(ext) ||
    /^\s*(?:["']use strict["'];?|!function|\(function|var |const |import |export )/.test(head)
  ) {
    return "js-bundle";
  }
  throw new Error(
    `Unrecognised app format for ${path.basename(file)} (expected .apk, .ipa, .asar, .aab, .wasm, .map, .js, a zip or an ELF/PE/Mach-O binary)`
  );
}

function finding(
  ruleId: string,
  severity: AppFinding["severity"],
  file: string,
  message: string,
  remediation: string
): AppFinding {
  return { ruleId, severity, file, message, remediation };
}

function scanZipText(zip: ZipArchive, scan: TextScanResult, notes: string[]): void {
  let budget = MAX_SCAN_BYTES;
  let files = 0;
  for (const entry of zip.entries) {
    if (!isScannableText(entry.name) || entry.encrypted || entry.size === 0) continue;
    if (files >= MAX_SCAN_FILES || entry.size > budget) {
      notes.push("Text scan stopped early at the size limit; very large packages are only partly scanned.");
      return;
    }
    try {
      const data = zip.read(entry);
      budget -= data.length;
      files += 1;
      scanText(entry.name, data.toString(entry.name.endsWith(".dex") ? "latin1" : "utf8"), scan);
    } catch {
      /* unreadable entry: skip */
    }
  }
}

const MAX_NATIVE_LIBS = 40;
const MAX_NATIVE_BYTES = 64 * 1024 * 1024;

/** One finding per mitigation gap, listing every binary that has it. */
function nativeFindings(results: Array<{ file: string; info: NativeHardening }>): AppFinding[] {
  const grouped = new Map<string, { issue: ReturnType<typeof nativeIssues>[number]; files: string[] }>();
  for (const { file, info } of results) {
    for (const issue of nativeIssues(info)) {
      const group = grouped.get(issue.ruleId) ?? { issue, files: [] };
      group.files.push(file);
      grouped.set(issue.ruleId, group);
    }
  }
  return [...grouped.values()].map(({ issue, files }) =>
    finding(
      issue.ruleId,
      issue.severity,
      files.length === 1 ? (files[0] ?? "") : `${files.length} native binaries`,
      files.length === 1
        ? issue.message
        : `${issue.message} (${files.slice(0, 4).join(", ")}${files.length > 4 ? ", …" : ""})`,
      issue.remediation
    )
  );
}

function hardeningSummary(info: NativeHardening): Record<string, unknown> {
  return {
    hardening: formatHardening(info),
    libraries: info.libraries.slice(0, 40),
    ...(info.rpaths.length ? { rpaths: info.rpaths } : {}),
    ...(info.slices ? { slices: info.slices } : {}),
    ...(info.dotnet ? { dotnet: true } : {}),
    ...(info.encrypted ? { encrypted: true } : {}),
  };
}

function attr(element: AxmlElement | undefined, name: string): string | number | boolean | undefined {
  if (!element) return undefined;
  return element.attrs[`android:${name}`] ?? element.attrs[name];
}

function inspectAndroid(
  zip: ZipArchive,
  buffer: Buffer,
  findings: AppFinding[],
  notes: string[]
): Record<string, unknown> {
  const names = zip.entries.map((entry) => entry.name);
  const abis = [...new Set(names.flatMap((name) => /^lib\/([^/]+)\/[^/]+\.so$/.exec(name)?.[1] ?? []))].sort();
  const signing = {
    v1: names.some((name) => /^META-INF\/[^/]+\.(RSA|DSA|EC)$/i.test(name)),
    v2plus: buffer
      .subarray(Math.max(0, zip.centralDirectoryOffset - 16), zip.centralDirectoryOffset)
      .toString("latin1")
      .includes("APK Sig Block 42"),
  };
  const summary: Record<string, unknown> = {
    entries: names.length,
    dexFiles: names.filter((name) => /^classes\d*\.dex$/.test(name)).length,
    nativeAbis: abis,
    nativeLibraries: names.filter((name) => /^lib\/.+\.so$/.test(name)).length,
    signing,
    frameworks: [
      names.some((n) => n.includes("libflutter.so")) && "Flutter",
      names.some((n) => n.includes("libreactnativejni.so") || n.endsWith("index.android.bundle")) && "React Native",
      names.some((n) => n.includes("libunity.so")) && "Unity",
      names.some((n) => n.includes("libil2cpp.so")) && "Unity IL2CPP",
      names.some((n) => n.startsWith("assets/www/") || n.endsWith("cordova.js")) && "Cordova/Capacitor",
      names.some((n) => n.startsWith("assemblies/") || n.includes("libmonodroid.so")) && ".NET MAUI/Xamarin",
    ].filter(Boolean),
  };
  if (!signing.v1 && !signing.v2plus) {
    findings.push(
      finding(
        "ANVIL-APP-APK-UNSIGNED",
        "medium",
        "APK",
        "No APK signature found.",
        "Sign release builds; unsigned APKs cannot be installed or updated safely."
      )
    );
  }

  const libs = zip.entries.filter(
    (entry) => /^lib\/[^/]+\/[^/]+\.so$/.test(entry.name) && entry.size <= MAX_NATIVE_BYTES
  );
  const analyzed: Array<{ file: string; info: NativeHardening }> = [];
  for (const entry of libs.slice(0, MAX_NATIVE_LIBS)) {
    try {
      analyzed.push({ file: entry.name, info: analyzeNative(zip.read(entry, MAX_NATIVE_BYTES)) });
    } catch {
      /* not a readable ELF: skip */
    }
  }
  if (libs.length > MAX_NATIVE_LIBS)
    notes.push(`Checked the first ${MAX_NATIVE_LIBS} of ${libs.length} native libraries.`);
  if (analyzed.length) {
    summary.nativeHardening = analyzed.map(({ file, info }) => `${file}: ${formatHardening(info)}`);
    findings.push(...nativeFindings(analyzed));
  }

  const manifestEntry = zip.entries.find((entry) => entry.name === "AndroidManifest.xml");
  if (!manifestEntry) {
    notes.push("No AndroidManifest.xml found at the archive root.");
    return summary;
  }
  let manifest: AxmlElement;
  try {
    manifest = parseAxml(zip.read(manifestEntry));
  } catch (error) {
    notes.push(`AndroidManifest.xml could not be decoded: ${error instanceof Error ? error.message : String(error)}`);
    return summary;
  }
  const application = findAll(manifest, "application")[0];
  const usesSdk = findAll(manifest, "uses-sdk")[0];
  const permissions = findAll(manifest, "uses-permission")
    .map((el) => String(attr(el, "name") ?? ""))
    .filter(Boolean);
  const targetSdk = Number(attr(usesSdk, "targetSdkVersion") ?? 0);
  const exported: string[] = [];
  for (const tag of ["activity", "activity-alias", "service", "receiver", "provider"]) {
    for (const component of findAll(manifest, tag)) {
      const explicit = attr(component, "exported");
      const hasFilter = component.children.some((child) => child.tag === "intent-filter");
      const isExported =
        explicit === true || explicit === "true" || (explicit === undefined && hasFilter && targetSdk < 31);
      const isLauncher = findAll(component, "category").some(
        (c) => attr(c, "name") === "android.intent.category.LAUNCHER"
      );
      if (isExported && !attr(component, "permission") && !isLauncher)
        exported.push(`${tag} ${String(attr(component, "name"))}`);
    }
  }
  Object.assign(summary, {
    package: manifest.attrs.package,
    versionName: attr(manifest, "versionName"),
    versionCode: attr(manifest, "versionCode"),
    minSdk: attr(usesSdk, "minSdkVersion"),
    targetSdk: attr(usesSdk, "targetSdkVersion"),
    permissions,
    dangerousPermissions: permissions.filter((p) => DANGEROUS_PERMISSIONS.has(p)),
    exportedComponents: exported,
  });

  const appFlag = (name: string) => {
    const value = attr(application, name);
    return value === true || value === "true";
  };
  if (appFlag("debuggable")) {
    findings.push(
      finding(
        "ANVIL-APP-APK-DEBUGGABLE",
        "high",
        "AndroidManifest.xml",
        'android:debuggable="true": anyone with the device can attach a debugger and read app data.',
        "Never ship debuggable builds; build release variants with debuggable false."
      )
    );
  }
  if (appFlag("usesCleartextTraffic")) {
    findings.push(
      finding(
        "ANVIL-APP-APK-CLEARTEXT",
        "medium",
        "AndroidManifest.xml",
        'usesCleartextTraffic="true" allows plain HTTP for every host.',
        "Use HTTPS and, if a host needs HTTP, allow only that host in a network security config."
      )
    );
  }
  if (attr(application, "allowBackup") !== false && attr(application, "allowBackup") !== "false") {
    findings.push(
      finding(
        "ANVIL-APP-APK-BACKUP",
        "low",
        "AndroidManifest.xml",
        "allowBackup is on (the default): app data can be copied off the device with adb backup.",
        'Set android:allowBackup="false" or define backup rules that exclude tokens and databases.'
      )
    );
  }
  if (exported.length) {
    findings.push(
      finding(
        "ANVIL-APP-APK-EXPORTED",
        "medium",
        "AndroidManifest.xml",
        `${exported.length} exported component(s) without a permission: ${exported.slice(0, 5).join(", ")}${exported.length > 5 ? ", …" : ""}`,
        'Set android:exported="false" unless other apps must call it, and protect the rest with a signature permission.'
      )
    );
  }
  if (targetSdk && targetSdk < 33) {
    findings.push(
      finding(
        "ANVIL-APP-APK-OLD-TARGET",
        "low",
        "AndroidManifest.xml",
        `targetSdkVersion ${targetSdk} opts out of newer platform protections.`,
        "Target a recent API level; Google Play also requires it for updates."
      )
    );
  }
  return summary;
}

function plistString(value: PlistValue | undefined): string | undefined {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : undefined;
}

function inspectIos(zip: ZipArchive, findings: AppFinding[], notes: string[]): Record<string, unknown> {
  const names = zip.entries.map((entry) => entry.name);
  const appDir = names.map((name) => /^Payload\/([^/]+\.app)\//.exec(name)?.[1]).find(Boolean);
  const summary: Record<string, unknown> = {
    entries: names.length,
    app: appDir,
    frameworks: [
      ...new Set(names.flatMap((name) => /\/Frameworks\/([^/]+)\.framework\//.exec(name)?.[1] ?? [])),
    ].sort(),
    provisioningProfile: names.some((name) => name.endsWith("embedded.mobileprovision")),
  };
  const infoEntry = zip.entries.find((entry) => appDir && entry.name === `Payload/${appDir}/Info.plist`);
  if (!infoEntry) {
    notes.push("Info.plist not found under Payload/*.app/.");
    return summary;
  }
  try {
    const info = parsePlist(zip.read(infoEntry)) as Record<string, PlistValue>;
    const ats = (info.NSAppTransportSecurity ?? {}) as Record<string, PlistValue>;
    const schemes = ((info.CFBundleURLTypes ?? []) as Array<Record<string, PlistValue>>).flatMap((type) =>
      ((type?.CFBundleURLSchemes ?? []) as PlistValue[]).map(String)
    );
    Object.assign(summary, {
      bundleId: plistString(info.CFBundleIdentifier),
      version: plistString(info.CFBundleShortVersionString),
      build: plistString(info.CFBundleVersion),
      minimumOS: plistString(info.MinimumOSVersion),
      urlSchemes: schemes,
      privacyUsage: Object.keys(info).filter((key) => /^NS\w+UsageDescription$/.test(key)),
      backgroundModes: Array.isArray(info.UIBackgroundModes) ? info.UIBackgroundModes.map(String) : [],
    });
    const executableName = plistString(info.CFBundleExecutable) ?? appDir?.replace(/\.app$/, "");
    const executable = zip.entries.find((entry) => entry.name === `Payload/${appDir}/${executableName}`);
    if (executable && executable.size <= MAX_NATIVE_BYTES * 4) {
      try {
        const hardening = analyzeNative(zip.read(executable, MAX_NATIVE_BYTES * 4));
        summary.executable = hardeningSummary(hardening);
        findings.push(...nativeFindings([{ file: executable.name, info: hardening }]));
        if (hardening.encrypted) {
          notes.push(
            "The executable is FairPlay-encrypted (App Store build), so its code and strings can't be scanned."
          );
        }
      } catch (error) {
        notes.push(`App executable could not be analysed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (ats.NSAllowsArbitraryLoads === true) {
      findings.push(
        finding(
          "ANVIL-APP-IOS-ATS-DISABLED",
          "medium",
          "Info.plist",
          "NSAllowsArbitraryLoads is true: App Transport Security is off and plain HTTP is allowed.",
          "Remove the global exception and allow HTTP only for specific domains that need it."
        )
      );
    }
  } catch (error) {
    notes.push(`Info.plist could not be decoded: ${error instanceof Error ? error.message : String(error)}`);
  }
  return summary;
}

const ELECTRON_RULES: Array<{ id: string; severity: AppFinding["severity"]; regex: RegExp; message: string }> = [
  {
    id: "ANVIL-APP-ELECTRON-NODE-INTEGRATION",
    severity: "high",
    regex: /nodeIntegration\s*:\s*(?:true|!0)\b/,
    message: "nodeIntegration enabled: any XSS in a window becomes code execution on the user's machine.",
  },
  {
    id: "ANVIL-APP-ELECTRON-CONTEXT-ISOLATION",
    severity: "high",
    regex: /contextIsolation\s*:\s*(?:false|!1)\b/,
    message: "contextIsolation disabled: page scripts can reach the preload script's privileges.",
  },
  {
    id: "ANVIL-APP-ELECTRON-WEB-SECURITY",
    severity: "high",
    regex: /webSecurity\s*:\s*(?:false|!1)\b/,
    message: "webSecurity disabled: same-origin policy is off.",
  },
  {
    id: "ANVIL-APP-ELECTRON-INSECURE-CONTENT",
    severity: "medium",
    regex: /allowRunningInsecureContent\s*:\s*(?:true|!0)\b/,
    message: "allowRunningInsecureContent enabled: HTTPS pages may load HTTP scripts.",
  },
  {
    id: "ANVIL-APP-ELECTRON-SANDBOX",
    severity: "medium",
    regex: /sandbox\s*:\s*(?:false|!1)\b/,
    message: "Renderer sandbox disabled.",
  },
  {
    id: "ANVIL-APP-ELECTRON-REMOTE",
    severity: "medium",
    regex: /enableRemoteModule\s*:\s*(?:true|!0)\b/,
    message: "Remote module enabled: renderers can call main-process objects.",
  },
];

function inspectElectron(
  buffer: Buffer,
  scan: TextScanResult,
  findings: AppFinding[],
  notes: string[]
): Record<string, unknown> {
  const asar = readAsar(buffer);
  const pkgFile = asar.files.find((file) => file.path === "package.json");
  let pkg: Record<string, unknown> = {};
  if (pkgFile) {
    try {
      pkg = JSON.parse(asar.read(pkgFile).toString("utf8")) as Record<string, unknown>;
    } catch {
      notes.push("package.json inside the archive is not valid JSON.");
    }
  }
  const seen = new Set<string>();
  let budget = MAX_SCAN_BYTES;
  for (const file of asar.files) {
    if (file.unpacked || !isScannableText(file.path) || /(^|\/)node_modules\//.test(file.path)) continue;
    if (file.size > budget) break;
    let text: string;
    try {
      text = asar.read(file).toString("utf8");
    } catch {
      continue;
    }
    budget -= file.size;
    scanText(file.path, text, scan);
    if (!/\.(m?js|cjs)$/.test(file.path)) continue;
    for (const rule of ELECTRON_RULES) {
      if (seen.has(rule.id) || !rule.regex.test(text)) continue;
      seen.add(rule.id);
      findings.push(
        finding(
          rule.id,
          rule.severity,
          file.path,
          rule.message,
          "Use Electron's secure defaults: contextIsolation, sandbox, no nodeIntegration, and a narrow preload API."
        )
      );
    }
  }
  const deps = { ...((pkg.dependencies as Record<string, string>) ?? {}) };
  return {
    files: asar.files.length,
    unpackedFiles: asar.files.filter((file) => file.unpacked).length,
    name: pkg.productName ?? pkg.name,
    version: pkg.version,
    main: pkg.main,
    dependencies: Object.keys(deps).length,
    sourceMaps: asar.files.filter((file) => file.path.endsWith(".map")).length,
  };
}

function wasmSummary(info: WasmModuleInfo): Record<string, unknown> {
  const modules = [...new Set(info.imports.map((item) => item.module))];
  return {
    version: info.version,
    host: info.host,
    importModules: modules,
    imports: info.imports.length,
    importedFunctions: info.imports
      .filter((item) => item.kind === "function")
      .slice(0, 40)
      .map((item) => `${item.module}.${item.name}`),
    exports: info.exports.map((item) => `${item.name} (${item.kind})`).slice(0, 60),
    functions: info.functionCount,
    customSections: info.customSections,
    debugInfo: info.customSections.some((name) => name === "name" || name.startsWith(".debug")),
  };
}

export async function inspectApp(
  file: string,
  options: { extractSourcesTo?: string | undefined; includeThirdParty?: boolean | undefined } = {}
): Promise<AppReport> {
  const resolved = path.resolve(file);
  const buffer = await readWhole(resolved);
  const kind = detectAppKind(resolved, buffer);
  const findings: AppFinding[] = [];
  const notes: string[] = [];
  const scan = newTextScan();
  let summary: Record<string, unknown> = {};

  if (kind === "android-apk" || kind === "android-aab" || kind === "ios-ipa" || kind === "zip") {
    const zip = readZip(buffer);
    if (kind === "android-apk") summary = inspectAndroid(zip, buffer, findings, notes);
    else if (kind === "ios-ipa") summary = inspectIos(zip, findings, notes);
    else {
      summary = {
        entries: zip.entries.length,
        topLevel: [...new Set(zip.entries.map((e) => e.name.split("/")[0]))].slice(0, 20),
      };
      if (kind === "android-aab") {
        summary.modules = [
          ...new Set(zip.entries.flatMap((e) => /^([^/]+)\/manifest\/AndroidManifest\.xml$/.exec(e.name)?.[1] ?? [])),
        ];
        notes.push("App bundles store the manifest as protobuf; build an APK (bundletool) for a full manifest review.");
      }
    }
    scanZipText(zip, scan, notes);
    const maps = zip.entries.filter((entry) => entry.name.endsWith(".map")).length;
    if (maps) summary.sourceMaps = maps;
  } else if (kind === "electron-asar") {
    summary = inspectElectron(buffer, scan, findings, notes);
  } else if (kind === "wasm") {
    summary = wasmSummary(readWasm(buffer));
  } else if (kind === "native") {
    const hardening = analyzeNative(buffer);
    summary = {
      format: hardening.format,
      type: hardening.type,
      arch: `${hardening.arch}/${hardening.bits}`,
      ...hardeningSummary(hardening),
    };
    findings.push(...nativeFindings([{ file: path.basename(resolved), info: hardening }]));
    scanText(path.basename(resolved), buffer.toString("latin1", 0, Math.min(buffer.length, MAX_SCAN_BYTES)), scan);
  } else if (kind === "source-map") {
    const map = parseSourceMap(buffer.toString("utf8"));
    const info: SourceMapInfo = summarizeSourceMap(map);
    summary = { ...info };
    if (info.withContent > 0) {
      findings.push(
        finding(
          "ANVIL-APP-SOURCEMAP-CONTENT",
          "medium",
          path.basename(resolved),
          `Source map embeds the original source of ${info.withContent} file(s).`,
          "Don't deploy source maps with sourcesContent publicly; upload them to your error tracker instead."
        )
      );
    }
    for (const [index, content] of (map.sourcesContent ?? []).entries()) {
      if (typeof content === "string") scanText(String(map.sources?.[index] ?? `source-${index}`), content, scan);
    }
    if (options.extractSourcesTo) {
      summary.extracted = await extractSources(map, options.extractSourcesTo, {
        includeThirdParty: options.includeThirdParty,
      });
      summary.extractedTo = path.resolve(options.extractSourcesTo);
    }
  } else {
    const text = buffer.toString("utf8");
    scanText(path.basename(resolved), text, scan);
    const mapRef = /\/\/[#@]\s*sourceMappingURL=([^\s'"]+)/.exec(text.slice(-4096))?.[1];
    summary = {
      lines: text.split("\n").length,
      sourceMappingURL: mapRef,
      minified: text.length > 2000 && text.split("\n").length < text.length / 1000,
    };
    if (mapRef && !mapRef.startsWith("data:"))
      notes.push(`Bundle points at a source map (${mapRef}); if it is deployed, its original sources are public.`);
  }

  if (scan.insecureHttpHosts.size) {
    const hosts = [...scan.insecureHttpHosts].slice(0, 6);
    findings.push(
      finding(
        "ANVIL-APP-HTTP-ENDPOINT",
        "low",
        "(app text)",
        `Plain HTTP endpoints: ${hosts.join(", ")}${scan.insecureHttpHosts.size > 6 ? ", …" : ""}`,
        "Use HTTPS for every network call."
      )
    );
  }
  findings.push(...scan.findings);
  const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || a.ruleId.localeCompare(b.ruleId));
  const endpoints = [...scan.hosts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 40)
    .map(([host, count]) => ({ host, count }));
  return { file: resolved, kind, sizeBytes: buffer.length, summary, findings, endpoints, notes };
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "none";
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function formatAppReport(report: AppReport): string {
  const lines = [
    `ANVIL app inspection: ${path.basename(report.file)}`,
    `  kind  ${report.kind} · ${(report.sizeBytes / 1024 / 1024).toFixed(2)} MiB`,
  ];
  for (const [key, value] of Object.entries(report.summary)) {
    if (value === undefined || value === null || value === "") continue;
    lines.push(`  ${key.padEnd(20)}${formatValue(value)}`);
  }
  if (report.endpoints.length) {
    lines.push(
      "",
      `Endpoints (${report.endpoints.length}):`,
      ...report.endpoints.slice(0, 15).map((e) => `  ${e.host} ×${e.count}`)
    );
  }
  lines.push("", report.findings.length ? `Findings (${report.findings.length}):` : "Findings: none");
  for (const item of report.findings) {
    lines.push(
      `  [${item.severity.toUpperCase()}] ${item.ruleId} ${item.file}`,
      `    ${item.message}`,
      `    fix: ${item.remediation}`
    );
  }
  if (report.notes.length) lines.push("", "Notes:", ...report.notes.map((note) => `  - ${note}`));
  return lines.join("\n");
}
