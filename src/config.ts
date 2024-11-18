let serverEnvironment: Record<string, string> = {};

if (Deno.env.get("SERVER_ENVIRONMENT")) {
  try {
    serverEnvironment = JSON.parse(Deno.env.get("SERVER_ENVIRONMENT") || "{}");
  } catch {
    console.error("Unable to parse SERVER_ENVIRONMENT env. This should be a stringified JSON object.");
  }
}

export const CONFIG = {
  mainPort: parseInt(Deno.env.get("SERVICE_PORT") || "9999"),
  disableHealthChecks: Deno.env.get("DISABLE_HEALTH_CHECKS") === "true",
  enableLogs: Deno.env.get("ENABLE_LOGS") === "true",
  serverPort: parseInt(Deno.env.get("SERVER_PORT") || "8000"),
  funcDirectory: await Deno.realPath("/opt/functions"),
  logsDirectory: await Deno.realPath("/opt/logs"),
  serverEnvironment,
};
