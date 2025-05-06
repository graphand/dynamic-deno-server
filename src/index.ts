import { walk } from "fs";
import { normalizePath } from "./utils/system.ts";
import { CONFIG } from "./config.ts";
import { ServerService } from "./services/ServerService.ts";
import { join } from "path";
import { debug } from "./utils/debug.ts";

const serverManager = new ServerService();
const pathRegex = new RegExp(`^${CONFIG.funcDirectory}/[^/]+`);
const _getSubdirectory = (path: string) => path.match(pathRegex)?.[0];

// Permission checker
async function checkPermissions() {
  try {
    await Deno.stat(CONFIG.funcDirectory);
  } catch {
    console.error(`Directory ${CONFIG.funcDirectory} does not exist or cannot be accessed`);
    Deno.exit(1);
  }

  try {
    await Deno.stat(CONFIG.logsDirectory);
  } catch {
    if (CONFIG.saveLogs) {
      debug(`Creating log directory ${CONFIG.logsDirectory}`);
      await Deno.mkdir(CONFIG.logsDirectory, { recursive: true });
    }
  }
}

// Setup cleanup handlers for server on exit
function setupCleanupHandlers() {
  const cleanup = async () => {
    debug("Shutting down servers gracefully...");
    const servers = serverManager.getAllServers();
    const promises = [];

    for (const [normalizedPath] of servers) {
      promises.push(serverManager.stopServer(normalizedPath));
    }

    await Promise.all(promises);
    debug("All servers stopped");
    Deno.exit(0);
  };

  Deno.addSignalListener("SIGINT", cleanup);
  Deno.addSignalListener("SIGTERM", cleanup);
}

// Main function to watch the directory
async function watchDirectory() {
  // Initial directory scan
  await scanForDirectories();

  // Watch directory for changes
  const watcher = Deno.watchFs(CONFIG.funcDirectory);
  debug(`Watching directory ${CONFIG.funcDirectory} for changes`);

  for await (const event of watcher) {
    if (event.kind === "create" || event.kind === "modify") {
      for (const path of event.paths) {
        const subdirectory = _getSubdirectory(path);
        if (subdirectory) await handleSubdirectoryChange(subdirectory);
      }
    } else if (event.kind === "remove") {
      for (const path of event.paths) {
        const subdirectory = _getSubdirectory(path);
        if (subdirectory) await handleSubdirectoryRemoval(subdirectory);
      }
    }
  }
}

// Scan for all existing subdirectories
async function scanForDirectories() {
  debug(`Scanning ${CONFIG.funcDirectory} for existing subdirectories`);

  for await (const entry of walk(CONFIG.funcDirectory, { maxDepth: 1 })) {
    if (entry.isDirectory && entry.path !== CONFIG.funcDirectory) {
      await handleSubdirectoryChange(entry.path);
    }
  }
}

// Handle creation or modification of a subdirectory
async function handleSubdirectoryChange(path: string) {
  try {
    // Normalize the path and check if it's a valid server directory
    const normalizedPath = await normalizePath(path).catch(console.error);

    if (!normalizedPath) {
      return;
    }

    // Check if server is already running
    const existingServer = serverManager.getServer(normalizedPath);

    if (existingServer && existingServer.status !== "failed") {
      return; // Server already running
    }

    // Start the server
    serverManager.startServer(path, normalizedPath);
  } catch (error) {
    console.error(`Error handling subdirectory change for ${path}:`, error);
  }
}

// Handle removal of a subdirectory
async function handleSubdirectoryRemoval(path: string) {
  try {
    // Check if directory still exists (handle partial removals)
    const exists = await Deno.stat(path)
      .then(() => true)
      .catch(() => false);
    if (exists) return;

    // Get server name from path
    const normalizedPath = path.split("/").pop();
    if (!normalizedPath) return;

    // Stop server if running
    await serverManager.stopServer(normalizedPath);
  } catch (error) {
    console.error(`Error handling subdirectory removal for ${path}:`, error);
  }
}

// Main server to dispatch requests
async function startMainServer() {
  debug(`Main server running on port ${CONFIG.mainPort}`);

  await Deno.serve({ port: CONFIG.mainPort, onListen: () => null }, async req => {
    const url = new URL(req.url);
    const subdirectory = decodeURI(url.pathname.split("/")[1]);

    const normalizedPath = await normalizePath(join(CONFIG.funcDirectory, subdirectory)).catch(console.error);
    const server = normalizedPath && serverManager.getServer(normalizedPath);

    if (!server) {
      return new Response("Function not found", { status: 404 });
    }

    await server.readyPromise;

    if (server.status === "failed") {
      const message = server.error || "Server is in failed state";
      return new Response(message, { status: 500 });
    }

    const isHealthCheck = req.headers.get("x-graphand-healthcheck") === "true";
    if (isHealthCheck) {
      return new Response("OK", { status: 200 });
    }

    try {
      // Forward request to the server on its allocated port
      const targetUrl = new URL(
        // remove the first segment
        url.pathname.split("/").filter(Boolean).slice(1).join("/"),
        `http://localhost:${server.port}`,
      );
      targetUrl.search = url.search;

      // Clone the request with the new URL
      const requestInit: RequestInit = {
        method: req.method,
        headers: req.headers,
        body: req.body,
        redirect: "follow",
      };

      // Forward the request
      const response = await fetch(targetUrl.toString(), requestInit);

      // Create a new response with the headers and status from the response
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      return new Response(`Error forwarding request: ${(error as Error).message}`, { status: 502 });
    }
  });
}

// Main function
async function main() {
  await checkPermissions();
  setupCleanupHandlers();

  const [watchPromise, serverPromise] = [watchDirectory(), startMainServer()];
  await Promise.all([watchPromise, serverPromise]);
}

main().catch(error => {
  console.error("Main process error:", error);
  Deno.exit(1);
});
