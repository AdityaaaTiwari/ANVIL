import path from "node:path";
import { startDashboard } from "../core/dashboard-server.js";

export async function runDashboard(_command: string, rest: string[]): Promise<void> {
  const target = path.resolve(rest.find((arg) => !arg.startsWith("--")) ?? ".");
  const portIndex = rest.indexOf("--port");
  const portValue = portIndex >= 0 ? Number(rest[portIndex + 1]) : 4173;
  if (!Number.isInteger(portValue) || portValue < 0 || portValue > 65535) {
    process.stderr.write("Dashboard port must be an integer from 0 to 65535.\n");
    process.exitCode = 1;
    return;
  }
  try {
    let dashboard;
    let chosenPort = portValue;
    if (portIndex < 0) {
      for (let p = portValue; p < portValue + 10; p++) {
        try {
          dashboard = await startDashboard({ projectPath: target, port: p });
          chosenPort = p;
          break;
        } catch (err: unknown) {
          if (
            err &&
            typeof err === "object" &&
            "code" in err &&
            (err as { code: string }).code === "EADDRINUSE" &&
            p < portValue + 9
          )
            continue;
          throw err;
        }
      }
    } else {
      dashboard = await startDashboard({ projectPath: target, port: portValue });
    }
    if (!dashboard) throw new Error("Could not bind an available dashboard port.");
    const address = dashboard.server.address();
    const actualPort = address && typeof address !== "string" ? address.port : chosenPort;
    process.stdout.write(
      `ANVIL dashboard: http://127.0.0.1:${actualPort}\nProject: ${target}\nPress Ctrl+C to stop.\n`
    );
    const shutdown = () => dashboard.server.close(() => process.exit(0));
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Could not start dashboard: ${message}\n`);
    process.exitCode = 1;
  }
  return;
}
