import { SubdirectoryServer } from "../types.ts";
import { CONFIG } from "../config.ts";
import { validateCode, checkServerHealth, pollDirectory } from "../utils/server.ts";
import { LogService } from "./LogService.ts";
import { PortManager } from "./PortManager.ts";
import { join, resolve } from "path";
import { debug } from "../utils/debug.ts";

export class ServerService {
  private servers = new Map<string, SubdirectoryServer>();
  private portManager = PortManager.getInstance();
  private watchers = new Map<string, Deno.FsWatcher>();

  startServer(path: string, normalizedPath: string): void {
    // Allocate a port for this server
    const port = this.portManager.allocatePort(normalizedPath);

    const server: SubdirectoryServer = {
      path,
      port,
      status: "starting",
      readyPromise: Promise.resolve(),
    };

    this.servers.set(normalizedPath, server);

    debug(`Starting server "${normalizedPath}"`);

    pollDirectory(path).catch(() => {
      const server = this.getServer(normalizedPath);
      if (server && server.status !== "failed") {
        this.stopServer(normalizedPath);
      }
    });

    server.readyPromise = this.initializeServer(path, server, normalizedPath);
  }

  private getPublicEnv(): Record<string, string> {
    const PREFIX = "PUBLIC_DENO_";
    const publicEntries = Object.entries(Deno.env.toObject()).filter(([key]) => key.startsWith(PREFIX));
    return Object.fromEntries(publicEntries.map(([key, value]) => [key.replace(PREFIX, ""), value]));
  }

  private async initializeServer(
    path: string,
    server: SubdirectoryServer,
    normalizedPath: string,
  ): Promise<void> {
    try {
      const publicEnv = this.getPublicEnv();
      const env = { ...publicEnv, ...CONFIG.envJSON, __RUNNER_PORT__: server.port.toString() };
      const serverName = path.split("/").pop() || normalizedPath;

      const { configArgs, serverEntryPath } = await this.resolveServerPaths(path);

      if (CONFIG.checkCode) {
        await validateCode([...configArgs, serverEntryPath]);
      }

      const { envFileArgs } = await this.resolveEnvFile();

      const child = this.spawnServerProcess(serverEntryPath, { configArgs, envFileArgs, env });
      server.process = child;

      await this.setupLogging(child, serverName, CONFIG.quiet);

      if (CONFIG.healthCheckAttempts > 0) {
        const isHealthy = await checkServerHealth(server, CONFIG.healthCheckAttempts);
        if (!isHealthy) {
          throw new Error("Child server health check failed");
        }
      }

      debug(`Server "${normalizedPath}" is ready`);
      server.status = "ready";

      // Set up file watching if enabled
      if (CONFIG.watchFiles) {
        this.watchServerFiles(path, normalizedPath);
      }
    } catch (error) {
      console.error(`Server "${normalizedPath}" failed to start: ${error}`);
      server.status = "failed";
      server.error = (error as Error).message;
    }
  }

  private watchServerFiles(path: string, normalizedPath: string): void {
    try {
      // Close any existing watcher for this path
      const existingWatcher = this.watchers.get(normalizedPath);
      if (existingWatcher) {
        try {
          existingWatcher.close();
        } catch (error) {
          console.error(`Error closing existing watcher for ${normalizedPath}:`, error);
        }
      }

      // Create a new watcher
      const watcher = Deno.watchFs(path);
      this.watchers.set(normalizedPath, watcher);

      debug(`Watching for changes in server "${normalizedPath}"`);

      // Start watching for changes
      (async () => {
        try {
          for await (const event of watcher) {
            if (event.kind === "modify" || event.kind === "create") {
              // Check if the server is still running
              const server = this.getServer(normalizedPath);
              if (server && server.status === "ready") {
                debug(`Changes detected in "${normalizedPath}", reloading server...`);
                await this.reloadServer(normalizedPath);
              }
            }
          }
        } catch (error) {
          // Handle watcher errors or closures
          if (error instanceof Deno.errors.BadResource) {
            // Watcher was closed, this is normal
            return;
          }
          console.error(`Error watching ${normalizedPath}:`, error);
        }
      })();
    } catch (error) {
      console.error(`Failed to set up file watcher for ${normalizedPath}:`, error);
    }
  }

  async reloadServer(normalizedPath: string): Promise<void> {
    const server = this.servers.get(normalizedPath);
    if (!server) return;

    try {
      // Save current path and port
      const { path, port } = server;

      // Stop the current server process
      if (server.process) {
        try {
          server.process.kill("SIGTERM");
          await server.process.status;
        } catch (error) {
          console.error(`Error stopping server process on port ${port}:`, error);
        }
      }

      // Update server status
      server.status = "starting";

      // Re-initialize the server
      server.readyPromise = this.initializeServer(path, server, normalizedPath);

      // Wait for server to be ready again
      await server.readyPromise;

      debug(`Server "${normalizedPath}" reloaded successfully`);
    } catch (error) {
      console.error(`Failed to reload server "${normalizedPath}":`, error);
      server.status = "failed";
      server.error = (error as Error).message;
    }
  }

  private async resolveEnvFile(): Promise<{ envFileArgs: string[] }> {
    const envFile = CONFIG.envFile && resolve(CONFIG.funcDirectory, CONFIG.envFile);
    const envFileExists = envFile && (await Deno.stat(envFile).catch(() => false));

    if (envFile && !envFileExists) {
      console.error(`Environment file "${envFile}" does not exist`);
    }

    const envFileArgs = envFileExists ? [`--env-file=${envFile}`] : [];

    return { envFileArgs };
  }

  private async resolveServerPaths(path: string): Promise<{ configArgs: string[]; serverEntryPath: string }> {
    const serverEntryPath = join(path, "index.ts");

    const globalConfigPath = join(CONFIG.funcDirectory, "deno.json");
    const globalImportMapPath = join(CONFIG.funcDirectory, "import_map.json");
    const scopedConfigPath = join(path, "deno.json");
    const scopedImportMapPath = join(path, "import_map.json");

    const existsGlobalConfig = await Deno.stat(globalConfigPath).catch(() => false);
    const existsGlobalImportMap = await Deno.stat(globalImportMapPath).catch(() => false);
    const existsScopedConfig = await Deno.stat(scopedConfigPath).catch(() => false);
    const existsScopedImportMap = await Deno.stat(scopedImportMapPath).catch(() => false);

    const configPath = existsScopedConfig
      ? scopedConfigPath
      : existsGlobalConfig
        ? globalConfigPath
        : undefined;

    const importMapPath = existsScopedImportMap
      ? scopedImportMapPath
      : existsGlobalImportMap
        ? globalImportMapPath
        : undefined;

    const configArgs = [
      ...(configPath ? [`--config=${configPath}`] : []),
      ...(importMapPath ? [`--import-map=${importMapPath}`] : []),
    ];

    return { configArgs, serverEntryPath };
  }

  private spawnServerProcess(
    serverEntryPath: string,
    opts: {
      configArgs: string[];
      envFileArgs: string[];
      env: Record<string, string>;
    },
  ): Deno.ChildProcess {
    const runnerPath = join(Deno.cwd(), "runner.ts");

    const command = new Deno.Command("deno", {
      args: [
        "run",
        "--allow-all",
        "--quiet",
        ...opts.configArgs,
        ...opts.envFileArgs,
        runnerPath,
        serverEntryPath,
      ],
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
      env: opts.env,
    });

    return command.spawn();
  }

  private async setupLogging(child: Deno.ChildProcess, serverName: string, quiet: boolean): Promise<void> {
    if (!CONFIG.saveLogs && quiet) return;

    if (!child.stdout || !child.stderr) return;

    let process: {
      stdout: ReadableStream<Uint8Array>;
      stderr: ReadableStream<Uint8Array>;
    } = child;

    if (!quiet) {
      // Split streams for dual use (console and log file)
      const [stdoutConsole, stdoutLog] = child.stdout.tee();
      const [stderrConsole, stderrLog] = child.stderr.tee();

      process = {
        stdout: stdoutLog,
        stderr: stderrLog,
      };

      // Handle console output
      this.setupConsoleOutput(stdoutConsole, stderrConsole, serverName);
    }

    if (CONFIG.saveLogs) {
      // Initialize log service for file logging
      const logService = new LogService(CONFIG.logsDirectory, CONFIG.logFormat as "cri" | "docker");
      await logService.initializeLogFile(serverName);

      // Set up file logging
      logService
        .setupProcessLogging(process)
        .catch(error => console.error(`Error setting up logging for ${serverName}:`, error));
    }
  }

  private setupConsoleOutput(
    stdout: ReadableStream<Uint8Array>,
    stderr: ReadableStream<Uint8Array>,
    serverName: string,
  ): void {
    const decoder = new TextDecoder();

    const processStream = (stream: ReadableStream<Uint8Array>, isError = false) => {
      const reader = stream.getReader();
      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const logFn = isError ? console.error : console.log;
            logFn(`[${serverName}]`, decoder.decode(value).trimEnd());
          }
        } catch (error) {
          console.error(`Error processing ${isError ? "stderr" : "stdout"} for ${serverName}:`, error);
        }
      })();
    };

    // Process both streams for console output
    processStream(stdout);
    processStream(stderr, true);
  }

  async stopServer(normalizedPath: string): Promise<void> {
    const server = this.servers.get(normalizedPath);
    if (!server) return;

    // Release the port from the port manager
    this.portManager.releasePort(normalizedPath);

    // Close any file watcher for this server
    const watcher = this.watchers.get(normalizedPath);
    if (watcher) {
      try {
        watcher.close();
        this.watchers.delete(normalizedPath);
      } catch (error) {
        console.error(`Error closing file watcher for ${normalizedPath}:`, error);
      }
    }

    this.servers.delete(normalizedPath);

    if (server.process) {
      try {
        server.process.kill("SIGTERM");
        await server.process.status;
      } catch (error) {
        console.error(`Error stopping server on port ${server.port}:`, error);
      }
    }

    if (CONFIG.saveLogs) {
      const name = server.path.split("/").pop();
      if (name) {
        const logService = new LogService(CONFIG.logsDirectory, CONFIG.logFormat as "cri" | "docker");
        await logService.removeLogFile(name);
      }
    }

    debug(`Server on port ${server.port} stopped`);
  }

  getServer(normalizedPath: string): SubdirectoryServer | undefined {
    return this.servers.get(normalizedPath);
  }

  getAllServers(): Map<string, SubdirectoryServer> {
    return this.servers;
  }
}
