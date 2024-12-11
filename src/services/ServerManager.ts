import { resolve } from "https://deno.land/std/path/mod.ts";
import { SubdirectoryServer } from "../types.ts";
import { NamespaceService } from "./NamespaceService.ts";
import { CONFIG } from "../config.ts";
import { validateCode, checkServerHealth, pollDirectory } from "../utils/server.ts";

export class ServerManager {
  private servers = new Map<string, SubdirectoryServer>();

  startServer(path: string, normalizedPath: string): void {
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
      this.stopServer(normalizedPath);
    });

    server.readyPromise = this.initializeServer(path, server, namespaceService);
  }

  private async initializeServer(
    path: string,
    server: SubdirectoryServer,
    namespaceService: NamespaceService,
  ): Promise<void> {
    try {
      await validateCode(path);

      if (await namespaceService.exists()) {
        console.log(`Namespace ${server.namespace} already exists for path ${path}`);
        return;
      }

      await namespaceService.create();

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
          const logsDirectory = resolve(CONFIG.logsDirectory, name);

          // Create the directory if it doesn't exist
          await Deno.mkdir(logsDirectory, { recursive: true });

          const outLogPath = resolve(logsDirectory, "stdout.log");
          const errLogPath = resolve(logsDirectory, "stderr.log");

          // Create the files if they don't exist
          await Deno.writeTextFile(outLogPath, "");
          await Deno.writeTextFile(errLogPath, "");

          // Create write streams for stdout and stderr
          const stdoutStream = await Deno.open(outLogPath, {
            write: true,
            create: true,
            append: true,
          });
          const stderrStream = await Deno.open(errLogPath, {
            write: true,
            create: true,
            append: true,
          });

          // Pipe process output to log files
          child.stdout.pipeTo(stdoutStream.writable);
          child.stderr.pipeTo(stderrStream.writable);
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

  async stopServer(normalizedPath: string): Promise<void> {
    const server = this.servers.get(normalizedPath);
    if (!server) return;

    this.servers.delete(normalizedPath);

    if (server.process) {
      server.process.kill("SIGTERM");
      await server.process.status;
    }

    const namespaceService = new NamespaceService(server.namespace);
    await namespaceService.cleanup();

    console.log(`Server "${server.namespace}" stopped`);
  }

  getServer(normalizedPath: string): SubdirectoryServer | undefined {
    return this.servers.get(normalizedPath);
  }

  getAllServers(): Map<string, SubdirectoryServer> {
    return this.servers;
  }
}
