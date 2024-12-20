import { SubdirectoryServer } from "../types.ts";
import { NamespaceService } from "./NamespaceService.ts";
import { CONFIG } from "../config.ts";
import { validateCode, checkServerHealth, pollDirectory } from "../utils/server.ts";
import { LogService } from "./LogService.ts";

export class ServerService {
  private servers = new Map<string, SubdirectoryServer>();

  startServer(path: string, normalizedPath: string, initNamespace: boolean = true): void {
    const namespace = NamespaceService.generateNamespaceName(path);
    const namespaceService = new NamespaceService(namespace);

    const server: SubdirectoryServer = {
      namespace,
      status: "starting",
      readyPromise: Promise.resolve(),
    };

    this.servers.set(normalizedPath, server);

    console.log(`Starting server "${normalizedPath}"`);

    pollDirectory(path).catch(() => {
      const server = this.getServer(normalizedPath);
      if (server && server.status !== "failed") {
        this.stopServer(normalizedPath);
      }
    });

    server.readyPromise = this.initializeServer(path, server, namespaceService, initNamespace);
  }

  private async initializeServer(
    path: string,
    server: SubdirectoryServer,
    namespaceService: NamespaceService,
    initNamespace: boolean = true,
  ): Promise<void> {
    let logService: LogService | null = null;

    try {
      await validateCode(path);

      if (initNamespace) {
        if (await namespaceService.exists()) {
          console.log(`Namespace ${server.namespace} already exists for path ${path}`);
          return;
        }

        await namespaceService.create();
      }

      const child = await namespaceService.executeCommand(
        ["deno", "run", "--allow-all", "--quiet", `${path}/index.ts`],
        {
          env: CONFIG.serverEnvironment,
          clearEnv: true,
        },
      );

      server.process = child;

      if (CONFIG.enableLogs) {
        const name = path.split("/").pop();
        if (name && child.stdout && child.stderr) {
          logService = new LogService(CONFIG.logsDirectory, CONFIG.logFormat as "cri" | "docker");
          await logService.initializeLogFile(name);
          logService.setupProcessLogging(child).catch(console.error);
        }
      }

      if (CONFIG.healthCheckAttempts > 0) {
        const isHealthy = await checkServerHealth(server, CONFIG.serverPort, CONFIG.healthCheckAttempts);

        if (!isHealthy) {
          throw new Error("Child server health check failed");
        }
      }

      console.log(`Server "${server.namespace}" is ready`);
      server.status = "ready";
    } catch (error) {
      console.error(`Server "${server.namespace}" failed to start: ${error}`);
      server.status = "failed";
      server.error = (error as Error).message;
    }
  }

  async stopServer(normalizedPath: string, cleanupNamespace: boolean = true): Promise<void> {
    const server = this.servers.get(normalizedPath);
    if (!server) return;

    this.servers.delete(normalizedPath);

    if (server.process) {
      try {
        server.process.kill("SIGTERM");
        await server.process.status;
      } catch (error) {
        console.error(`Error stopping server "${server.namespace}":`, error);
      }
    }

    if (cleanupNamespace) {
      const namespaceService = new NamespaceService(server.namespace);
      await namespaceService.cleanup();
    }

    console.log(`Server "${server.namespace}" stopped`);
  }

  getServer(normalizedPath: string): SubdirectoryServer | undefined {
    return this.servers.get(normalizedPath);
  }

  getAllServers(): Map<string, SubdirectoryServer> {
    return this.servers;
  }
}
