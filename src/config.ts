let envJSON: Record<string, string> = {};

if (Deno.env.get("ENV_JSON")) {
  try {
    envJSON = JSON.parse(Deno.env.get("ENV_JSON") || "{}");
  } catch {
    console.error("Unable to parse ENV_JSON env. This should be a stringified JSON object.");
  }
}

export const CONFIG = {
  mainPort: parseInt(Deno.env.get("PORT") || "9999"),
  healthCheckAttempts: parseInt(Deno.env.get("HEALTH_CHECK_ATTEMPTS") || "5"),
  checkCode: (Deno.env.get("CHECK_CODE") || "true") === "true",
  saveLogs: (Deno.env.get("SAVE_LOGS") || "false") === "true",
  quiet: (Deno.env.get("QUIET") || "false") === "true",
  watchFiles: (Deno.env.get("WATCH_FILES") || "false") === "true",
  serverPort: parseInt(Deno.env.get("SERVER_PORT") || "8000"),
  basePort: parseInt(Deno.env.get("BASE_PORT") || "8001"),
  maxPort: parseInt(Deno.env.get("MAX_PORT") || "9000"),
  funcDirectory: Deno.env.get("FUNC_DIRECTORY") || "/opt/functions",
  logsDirectory: Deno.env.get("LOGS_DIRECTORY") || "/opt/logs",
  logFormat: Deno.env.get("LOG_FORMAT") || "cri",
  envJSON,
  envFile: Deno.env.get("ENV_FILE") || "",
};
