export const CONFIG = {
  mainPort: parseInt(Deno.env.get("SERVICE_PORT") || "9999"),
  subdirectoryInternalPort: 8000,
  mainDirectory: await Deno.realPath("/opt/functions"),
  disableHealthChecks: Deno.env.get("DISABLE_HEALTH_CHECKS") === "true",
};
