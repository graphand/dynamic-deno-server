import { resolve } from "https://deno.land/std/path/mod.ts";

export class LogService {
  private logStream: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private logFile: Deno.FsFile | null = null;

  constructor(
    private readonly logsDirectory: string,
    private readonly logFormat: "cri" | "docker" = "cri",
  ) {}

  async initializeLogFile(serverName: string): Promise<void> {
    await Deno.mkdir(this.logsDirectory, { recursive: true });
    const logPath = resolve(this.logsDirectory, `${serverName}.log`);
    await Deno.writeTextFile(logPath, "");

    this.logFile = await Deno.open(logPath, {
      write: true,
      create: true,
      append: true,
    });

    this.logStream = this.logFile.writable.getWriter();
  }

  async setupProcessLogging(process: Deno.ChildProcess): Promise<void> {
    if (!this.logStream) {
      throw new Error("Log stream not initialized");
    }

    const createLogTransform = (streamType: "stdout" | "stderr") => {
      const logFormat = this.logFormat;
      return new TransformStream({
        transform(chunk, controller) {
          const timestamp = new Date().toISOString();
          const line = new TextDecoder().decode(chunk);
          const tag = line.endsWith("\n") ? "F" : "P";

          let logEntry;
          if (logFormat === "cri") {
            logEntry = `${timestamp} ${streamType} ${tag} ${line}`;
          } else if (logFormat === "docker") {
            logEntry = JSON.stringify({ log: line, stream: streamType, time: timestamp }) + "\n";
          } else {
            throw new Error(`Invalid log format: ${logFormat}`);
          }

          controller.enqueue(new TextEncoder().encode(logEntry));
        },
      });
    };

    try {
      await Promise.all([
        process.stdout.pipeThrough(createLogTransform("stdout")).pipeTo(
          new WritableStream({
            write: async chunk => {
              if (this.logStream) {
                await this.logStream.write(chunk);
              }
            },
          }),
        ),
        process.stderr.pipeThrough(createLogTransform("stderr")).pipeTo(
          new WritableStream({
            write: async chunk => {
              if (this.logStream) {
                await this.logStream.write(chunk);
              }
            },
          }),
        ),
      ]);
    } catch (error) {
      console.error("Error in process logging:", error);
    }
  }

  async close(): Promise<void> {
    if (this.logStream) {
      await this.logStream.close();
      this.logStream = null;
    }
    if (this.logFile) {
      try {
        await this.logFile.close();
      } catch (error) {
        if (!(error instanceof Deno.errors.BadResource)) {
          throw error; // Re-throw if it's not a BadResource error
        }
      }

      this.logFile = null;
    }
  }
}
