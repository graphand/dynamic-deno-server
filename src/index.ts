import { walk } from "https://deno.land/std@0.200.0/fs/walk.ts";
import { normalizePath } from "./utils/system.ts";
import { CONFIG } from "./config.ts";
import { ServerManager } from "./services/ServerManager.ts";

const serverManager = new ServerManager();

// Function to watch the main directory and manage child servers
async function watchDirectory() {
  const watcher = Deno.watchFs(CONFIG.mainDirectory);

  // Start watching immediately and scan directory concurrently
  const watchPromise = (async () => {
    for await (const event of watcher) {
      if (!["create", "rename", "remove"].includes(event.kind)) continue;

      for (const path of event.paths) {
        if (path === CONFIG.mainDirectory) continue;
        const normalizedPath = await normalizePath(path);

        // For create/rename events, start server if it's a directory
        if (
          ["create", "rename"].includes(event.kind) &&
          (await Deno.stat(path)).isDirectory
        ) {
          const server = serverManager.getServer(normalizedPath);
          if (!server) {
            serverManager.startServer(path, normalizedPath);
          }
        }

        // For remove events, stop server if we have one running
        if (event.kind === "remove") {
          const server = serverManager.getServer(normalizedPath);
          if (server) {
            console.log(`Detected removal of directory ${path}`);
            await serverManager.stopServer(normalizedPath).catch((error) => {
              console.error(
                `Failed to stop child server for ${normalizedPath}:`,
                error
              );
            });
          }
        }
      }
    }
  })();

  // Scan existing directories concurrently with watching
  const entries = new Set<string>();
  for await (const entry of walk(CONFIG.mainDirectory, {
    maxDepth: 1,
    includeDirs: true,
  })) {
    if (entry.isDirectory && entry.path !== CONFIG.mainDirectory) {
      entries.add(entry.path);
    }
  }

  // Start all existing subdirectory servers concurrently
  await Promise.all(
    Array.from(entries).map(async (entry) => {
      const normalizedPath = await normalizePath(entry);
      const server = serverManager.getServer(normalizedPath);
      if (!server) {
        serverManager.startServer(entry, normalizedPath);
      }
    })
  );

  // Keep the watcher running
  await watchPromise;
}

// Main server to dispatch requests
async function startMainServer() {
  console.log(`Main server running on port ${CONFIG.mainPort}`);

  await Deno.serve(
    { port: CONFIG.mainPort, onListen: () => null },
    async (req) => {
      const url = new URL(req.url);
      const subdirectory = url.pathname.split("/")[1];
      const normalizedPath = await normalizePath(
        `${CONFIG.mainDirectory}/${subdirectory}`
      );
      const server = serverManager.getServer(normalizedPath);

      if (!server) {
        return new Response("Function not found", { status: 404 });
      }

      await server.readyPromise;

      if (server.status === "failed") {
        const message = server.error || "Server is in failed state";
        return new Response(message, { status: 500 });
      }

      const isHealthCheck =
        req.headers.get("x-graphand-healthcheck") === "true";
      if (isHealthCheck) {
        return new Response("OK", { status: 200 });
      }

      const targetUrl = new URL(
        url.pathname.replace(`/${subdirectory}`, ""),
        `http://${server.ipAddress}:${CONFIG.subdirectoryInternalPort}`
      );
      targetUrl.search = url.search;

      try {
        const response = await fetch(targetUrl.toString(), {
          method: req.method,
          headers: req.headers,
          body: req.body,
        });

        return new Response(response.body, {
          status: response.status,
          headers: response.headers,
        });
      } catch (error) {
        return new Response(
          `Error forwarding request: ${(error as Error).message}`,
          { status: 502 }
        );
      }
    }
  );
}

// Function to cleanup all child servers
async function cleanupServers() {
  const servers = serverManager.getAllServers();
  const promises = Array.from(servers.keys()).map((normalizedPath) =>
    serverManager.stopServer(normalizedPath)
  );
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
