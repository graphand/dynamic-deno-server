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
  healthCheckAttempts: parseInt(Deno.env.get("HEALTH_CHECK_ATTEMPTS") || "5"),
  enableLogs: Deno.env.get("ENABLE_LOGS") === "true",
  serverPort: parseInt(Deno.env.get("SERVER_PORT") || "8000"),
  funcDirectory: await Deno.realPath(Deno.env.get("FUNC_DIRECTORY") || "/opt/functions"),
  logsDirectory: await Deno.realPath(Deno.env.get("LOGS_DIRECTORY") || "/opt/logs"),
  logFormat: Deno.env.get("LOG_FORMAT") || "cri",
  serverEnvironment,
};
