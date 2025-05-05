import { walk } from "fs";
import { normalizePath } from "./utils/system.ts";
import { CONFIG } from "./config.ts";
import { ServerService } from "./services/ServerService.ts";
import { NamespaceService } from "./services/NamespaceService.ts";
import { join } from "path";

const serverManager = new ServerService();
const pathRegex = new RegExp(`^${CONFIG.funcDirectory}/[^/]+`);
const _getSubdirectory = (path: string) => path.match(pathRegex)?.[0];
const _resolvePathSize = (path: string) => path.split("/").filter(Boolean).length;
const _isTargetPath = (path: string, target: string) => _resolvePathSize(path) === _resolvePathSize(target);
const watchEvents = ["create", "modify", "rename", "remove"] as Deno.FsEvent["kind"][];
const WATCH_DEBOUNCE_DELAY = 300; // milliseconds
const pendingOperations = new Map<string, number>();

// Function to watch the main directory and manage child servers
async function watchDirectory() {
  // Start watching immediately and scan directory concurrently
  const watchPromise = (async () => {
    const watcher = Deno.watchFs(CONFIG.funcDirectory, { recursive: true });
    console.log(`Watching directory ${CONFIG.funcDirectory}`);

    for await (const event of watcher) {
      if (!watchEvents.includes(event.kind)) continue;

      const pathsArray = event.paths
        .filter(path => path !== CONFIG.funcDirectory && !path.split("/").pop()?.startsWith("."))
        .map(_getSubdirectory)
        .filter(Boolean) as string[];

      const paths = new Set(pathsArray);

      if (!paths.size) continue;

      for (const path of paths) {
        const normalizedPath = await normalizePath(path).catch(e => {
          console.error(`Failed to normalize path ${path}:`, e.message);
          return null;
        });

        if (!normalizedPath) continue;

        const _processEvent = async () => {
          const isFuncRemoved = event.kind === "remove" && event.paths.find(p => _isTargetPath(p, path));

          if (isFuncRemoved) {
            const server = serverManager.getServer(normalizedPath);
            if (server) {
              await serverManager.stopServer(normalizedPath);
            }
          } else {
            const server = serverManager.getServer(normalizedPath);
            console.log(`Event received on path ${normalizedPath}.`);

            if (server) {
              await serverManager.stopServer(normalizedPath, false);
            }

            serverManager.startServer(path, normalizedPath, !server);
          }

          pendingOperations.delete(normalizedPath);
        };

        if (!WATCH_DEBOUNCE_DELAY) {
          await _processEvent();
          return;
        }

        // Clear any existing timeout for this path
        const existingTimeout = pendingOperations.get(normalizedPath);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
        }

        // Set new timeout for this path
        pendingOperations.set(normalizedPath, setTimeout(_processEvent, WATCH_DEBOUNCE_DELAY));
      }
    }
  })();

  // Scan existing directories concurrently with watching
  const entries = new Set<string>();
  for await (const entry of walk(CONFIG.funcDirectory, {
    maxDepth: 1,
    includeDirs: true,
  })) {
    if (entry.isDirectory && entry.path !== CONFIG.funcDirectory) {
      entries.add(entry.path);
    }
  }

  // Start all existing subdirectory servers concurrently
  await Promise.all(
    Array.from(entries).map(async entry => {
      const normalizedPath = await normalizePath(entry).catch(e => {
        console.error(e.message);
        return null;
      });

      if (!normalizedPath) return;

      const server = serverManager.getServer(normalizedPath);
      if (!server) {
        serverManager.startServer(entry, normalizedPath);
      }
    }),
  );

  // Keep the watcher running
  await watchPromise;
}

// Main server to dispatch requests
async function startMainServer() {
  console.log(`Main server running on port ${CONFIG.mainPort}`);

  await Deno.serve({ port: CONFIG.mainPort, onListen: () => null }, async req => {
    const url = new URL(req.url);
    const subdirectory = url.pathname.split("/")[1];
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
      const targetUrl = new URL(
        url.pathname.replace(`/${subdirectory}`, ""),
        `http://127.0.0.1:${CONFIG.serverPort}`,
      );
      targetUrl.search = url.search;

      const namespaceService = new NamespaceService(server.namespace);
      return await namespaceService.fetch(targetUrl.toString(), req);
    } catch (error) {
      return new Response(`Error forwarding request: ${(error as Error).message}`, { status: 502 });
    }
  });
}

// Function to cleanup all child servers
async function cleanupServers() {
  const servers = serverManager.getAllServers();
  const promises = Array.from(servers.keys()).map(normalizedPath => serverManager.stopServer(normalizedPath));
  await Promise.all(promises);
  Deno.exit(0);
}

// Add signal handlers for cleanup
function setupCleanupHandlers() {
  const signals = ["SIGINT", "SIGTERM", "SIGQUIT"] as const;
  for (const signal of signals) {
    Deno.addSignalListener(signal, () => {
      cleanupServers();
    });
  }
}

// Function to check necessary permissions
async function checkPermissions() {
  const permissions = await Deno.permissions.query({ name: "run" });
  if (permissions.state !== "granted") {
    throw new Error("Run permission is required to execute commands");
  }
}

// Main function
async function main() {
  await checkPermissions();
  setupCleanupHandlers();

  const [watchPromise, serverPromise] = [watchDirectory(), startMainServer()];
  await Promise.all([watchPromise, serverPromise]);
}

main().catch(console.error);
