import { formatAppReport, inspectApp } from "../core/app-intel/app-inspector.js";
import { reportCommandError } from "./arg-parse.js";

const USAGE = `Usage: anvil app <file> [--json] [--fail-on critical|high|medium|low]
       anvil app <file.map> --extract DIR [--include-third-party]

Look inside a shipped app without external reverse-engineering tools:
  .apk / .aab   Android: manifest, permissions, exported components, signing, native lib hardening
  .ipa          iOS: Info.plist, URL schemes, App Transport Security, executable hardening
  app.asar      Electron: package, insecure BrowserWindow settings
  .wasm         WebAssembly: imports, exports, host (WASI or JS), debug info
  .map          Source maps: recoverable original sources (--extract writes them to DIR)
  .js / zip     Bundles and other zips (JAR, VSIX, XPI): embedded secrets and endpoints
  ELF/PE/Mach-O Native binaries (.so, .exe, .dll, .dylib, executables): PIE/ASLR, NX/DEP, RELRO,
                stack canary, FORTIFY, CFG, code signing, linked libraries, RPATH

Every format is also scanned for embedded credentials (masked) and network endpoints.
`;

const SEVERITY_ORDER = ["critical", "high", "medium", "low"] as const;

export async function runApp(_command: string, rest: string[]): Promise<void> {
  if (!rest.length || rest.includes("--help") || rest.includes("-h")) {
    process.stdout.write(USAGE);
    return;
  }
  try {
    let file: string | undefined;
    let extract: string | undefined;
    let failOn: string | undefined;
    let json = false;
    let includeThirdParty = false;
    for (let i = 0; i < rest.length; i += 1) {
      const arg = rest[i] ?? "";
      if (arg === "--json") json = true;
      else if (arg === "--include-third-party") includeThirdParty = true;
      else if (arg === "--extract" || arg === "--fail-on") {
        const value = rest[++i];
        if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
        if (arg === "--extract") extract = value;
        else failOn = value;
      } else if (arg.startsWith("--")) throw new Error(`Unknown option ${arg}`);
      else if (file) throw new Error("Give one file to inspect");
      else file = arg;
    }
    if (!file) throw new Error("Give a file to inspect");
    if (failOn && !SEVERITY_ORDER.includes(failOn as (typeof SEVERITY_ORDER)[number])) {
      throw new Error("--fail-on must be critical, high, medium or low");
    }

    const report = await inspectApp(file, { extractSourcesTo: extract, includeThirdParty });
    if (extract && report.kind !== "source-map") throw new Error("--extract only works on source maps (.map)");
    process.stdout.write((json ? JSON.stringify(report, null, 2) : formatAppReport(report)) + "\n");

    if (failOn) {
      const limit = SEVERITY_ORDER.indexOf(failOn as (typeof SEVERITY_ORDER)[number]);
      const failing = report.findings.some((item) => {
        const rank = SEVERITY_ORDER.indexOf(item.severity as (typeof SEVERITY_ORDER)[number]);
        return rank !== -1 && rank <= limit;
      });
      if (failing) process.exitCode = 1;
    }
  } catch (error) {
    reportCommandError("app", error);
  }
}
