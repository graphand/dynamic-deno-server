export const CONFIG = {
  mainPort: parseInt(Deno.env.get("SERVICE_PORT") || "9999"),
  disableHealthChecks: Deno.env.get("DISABLE_HEALTH_CHECKS") === "true",
  enableLogs: Deno.env.get("ENABLE_LOGS") === "true",

  subdirectoryInternalPort: 8000,
  funcDirectory: await Deno.realPath("/opt/functions"),
  logsDirectory: await Deno.realPath("/opt/logs"),
};
