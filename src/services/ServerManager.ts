import { SubdirectoryServer } from "../types.ts";
import { NamespaceService } from "./NamespaceService.ts";
import {
  generateNamespaceName,
  generateIndexFromPath,
} from "../utils/network.ts";
import { CONFIG } from "../config.ts";
import {
  validateCode,
  checkServerHealth,
  pollDirectory,
} from "../utils/server.ts";

export class ServerManager {
  private servers = new Map<string, SubdirectoryServer>();

  startServer(path: string, normalizedPath: string): void {
    const namespace = generateNamespaceName(path);
    const index = generateIndexFromPath(normalizedPath);
    const namespaceService = new NamespaceService(namespace);

    const server: SubdirectoryServer = {
      namespace,
      ipAddress: "", // Will be set after namespace creation
      status: "starting",
      readyPromise: Promise.resolve(),
    };

    this.servers.set(normalizedPath, server);

    pollDirectory(path).catch(() => {
      this.stopServer(normalizedPath);
    });

    server.readyPromise = this.initializeServer(
      path,
      server,
      namespaceService,
      index
    );
  }

  private async initializeServer(
    path: string,
    server: SubdirectoryServer,
    namespaceService: NamespaceService,
    index: number
  ): Promise<void> {
    try {
      await validateCode(path);

      if (await namespaceService.exists()) {
        console.log(
          `Namespace ${server.namespace} already exists for path ${path}`
        );
        return;
      }

      const { childIP } = await namespaceService.create(index);
      server.ipAddress = childIP;

      const child = await namespaceService.executeCommand([
        "deno",
        "run",
        "--allow-all",
        "--quiet",
        `${path}/index.ts`,
      ]);

      server.process = child;

      if (!CONFIG.disableHealthChecks) {
        const isHealthy = await checkServerHealth(
          childIP,
          CONFIG.subdirectoryInternalPort
        );

        if (!isHealthy) {
          throw new Error("Child server health check failed");
        }
      }

      server.status = "ready";
    } catch (error) {
      server.status = "failed";
      server.error = (error as Error).message;
    }
  }

  async stopServer(normalizedPath: string): Promise<void> {
    const server = this.servers.get(normalizedPath);
    if (!server) return;

    this.servers.delete(normalizedPath);

    if (server.process) {
      server.process.kill("SIGTERM");
      await server.process.status;
    }

    const namespaceService = new NamespaceService(server.namespace);
    await namespaceService.cleanup(server.ipAddress);
  }

  getServer(normalizedPath: string): SubdirectoryServer | undefined {
    return this.servers.get(normalizedPath);
  }

  getAllServers(): Map<string, SubdirectoryServer> {
    return this.servers;
  }
}
