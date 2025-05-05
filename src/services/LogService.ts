import { resolve } from "path";

export class LogService {
  private logStream: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private logFile: Deno.FsFile | null = null;
  private loggingAbortController: AbortController | null = null;

  constructor(
    private readonly logsDirectory: string,
    private readonly logFormat: "cri" | "docker" = "cri",
  ) {}

  async initializeLogFile(serverName: string): Promise<void> {
    await Deno.mkdir(this.logsDirectory, { recursive: true }).catch(() => {});
    const logPath = resolve(this.logsDirectory, `${serverName}.log`);
    await Deno.writeTextFile(logPath, "");

    this.logFile = await Deno.open(logPath, {
      write: true,
      create: true,
      append: true,
    });

    this.logStream = this.logFile.writable.getWriter();
    this.loggingAbortController = new AbortController();
  }

  async setupProcessLogging(process: Deno.ChildProcess): Promise<void> {
    if (!this.logStream || !this.loggingAbortController) {
      throw new Error("Log stream not initialized");
    }

    const signal = this.loggingAbortController.signal;
    const logStream = this.logStream;
    const logFormat = this.logFormat;

    const createLogTransform = (streamType: "stdout" | "stderr") => {
      return new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          if (signal.aborted) {
            return;
          }

          const timestamp = new Date().toISOString();
          const line = new TextDecoder().decode(chunk);

          if (logFormat === "cri") {
            const lines = line.split(/\r?\n/);
            for (let i = 0; i < lines.length; i++) {
              if (lines[i] === "") continue;
              const tag = i === lines.length - 1 && !line.endsWith("\n") ? "P" : "F";
              const logEntry = `${timestamp} ${streamType} ${tag} ${lines[i]}\n`;
              controller.enqueue(new TextEncoder().encode(logEntry));
            }
          } else if (logFormat === "docker") {
            const logEntry =
              JSON.stringify({
                log: line,
                stream: streamType,
                time: timestamp,
              }) + "\n";
            controller.enqueue(new TextEncoder().encode(logEntry));
          } else {
            controller.error(new Error(`Invalid log format: ${logFormat}`));
          }
        },
      });
    };

    const createWritableStream = () => {
      return new WritableStream<Uint8Array>({
        write: async chunk => {
          if (signal.aborted) {
            throw new DOMException("Stream aborted", "AbortError");
          }

          await logStream.write(chunk);
        },
      });
    };

    try {
      const streams = [
        { readable: process.stdout, type: "stdout" as const },
        { readable: process.stderr, type: "stderr" as const },
      ];

      await Promise.all(
        streams.map(({ readable, type }) =>
          readable
            .pipeThrough(createLogTransform(type), { signal })
            .pipeTo(createWritableStream(), { signal }),
        ),
      ).catch(console.error);
    } catch (error) {
      console.error("Error in process logging:", error);
    }
  }

  async close(): Promise<void> {
    if (this.loggingAbortController) {
      this.loggingAbortController.abort();
      this.loggingAbortController = null;
    }

    if (this.logStream) {
      await this.logStream.close();
      this.logStream = null;
    }

    if (this.logFile) {
      try {
        await this.logFile.close();
      } catch (error) {
        if (!(error instanceof Deno.errors.BadResource)) {
          throw error;
        }
      }
      this.logFile = null;
    }
  }
}
