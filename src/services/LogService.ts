import { resolve } from "path";

/**
 * Service for handling logging of child process output to files.
 * Supports CRI and Docker log formats.
 */
export class LogService {
  private logStream: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private logFile: Deno.FsFile | null = null;
  private loggingAbortController: AbortController | null = null;

  constructor(
    private readonly logsDirectory: string,
    private readonly logFormat: "cri" | "docker" = "cri",
  ) {}

  /**
   * Initializes the log file for a server
   * @param serverName Name of the server (used as filename)
   */
  async initializeLogFile(serverName: string): Promise<void> {
    try {
      // Create logs directory if it doesn't exist
      await Deno.mkdir(this.logsDirectory, { recursive: true }).catch(() => {});
      const logPath = resolve(this.logsDirectory, `${serverName}.log`);

      // Create an empty file (or clear existing one)
      await Deno.writeTextFile(logPath, "");

      // Open the file for writing
      this.logFile = await Deno.open(logPath, {
        write: true,
        create: true,
        append: true,
      });

      this.logStream = this.logFile.writable.getWriter();
      this.loggingAbortController = new AbortController();
    } catch (error: unknown) {
      console.error(`Failed to initialize log file for ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * Removes a server's log file
   * @param serverName Name of the server
   */
  async removeLogFile(serverName: string): Promise<void> {
    try {
      const logPath = resolve(this.logsDirectory, `${serverName}.log`);
      await Deno.remove(logPath);
    } catch (error: unknown) {
      // Ignore file not found errors
      if (error instanceof Deno.errors.NotFound) {
        // File doesn't exist, which is fine
        return;
      }
      console.error(`Error removing log file for ${serverName}:`, error);
    }
  }

  /**
   * Sets up logging for a process's stdout and stderr streams
   * @param process Object with stdout and stderr ReadableStreams
   */
  async setupProcessLogging(process: {
    stdout: ReadableStream<Uint8Array>;
    stderr: ReadableStream<Uint8Array>;
  }): Promise<void> {
    if (!this.logStream || !this.loggingAbortController) {
      throw new Error("Log stream not initialized");
    }

    const signal = this.loggingAbortController.signal;
    const logStream = this.logStream;
    const logFormat = this.logFormat;

    // Creates a transform stream that formats log entries
    const createLogTransform = (streamType: "stdout" | "stderr") => {
      return new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          if (signal.aborted) {
            return;
          }

          try {
            const timestamp = new Date().toISOString();
            const line = new TextDecoder().decode(chunk);

            if (logFormat === "cri") {
              // CRI format: timestamp stream tag message
              const lines = line.split(/\r?\n/);
              for (let i = 0; i < lines.length; i++) {
                if (lines[i] === "") continue;
                // P tag for partial line, F for full line
                const tag = i === lines.length - 1 && !line.endsWith("\n") ? "P" : "F";
                const logEntry = `${timestamp} ${streamType} ${tag} ${lines[i]}\n`;
                controller.enqueue(new TextEncoder().encode(logEntry));
              }
            } else if (logFormat === "docker") {
              // Docker format: JSON with log, stream, and time fields
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
          } catch (error: unknown) {
            console.error("Error formatting log entry:", error);
            controller.error(error instanceof Error ? error : new Error(String(error)));
          }
        },
      });
    };

    // Creates a writable stream that writes to the log file
    const createWritableStream = () => {
      return new WritableStream<Uint8Array>({
        write: async chunk => {
          if (signal.aborted) {
            throw new DOMException("Stream aborted", "AbortError");
          }

          try {
            await logStream.write(chunk);
          } catch (error) {
            console.error("Error writing to log file:", error);
            throw error;
          }
        },
      });
    };

    try {
      // Set up processing for both stdout and stderr
      const streams = [
        { readable: process.stdout, type: "stdout" as const },
        { readable: process.stderr, type: "stderr" as const },
      ];

      // Process all streams in parallel
      await Promise.all(
        streams.map(({ readable, type }) =>
          readable
            .pipeThrough(createLogTransform(type), { signal })
            .pipeTo(createWritableStream(), { signal })
            .catch(error => {
              if (error instanceof Error && error.name !== "AbortError") {
                console.error(`Error processing ${type} stream:`, error);
              }
            }),
        ),
      );
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== "AbortError") {
        console.error("Error in process logging:", error);
      }
    }
  }

  /**
   * Closes log streams and files
   */
  async close(): Promise<void> {
    // Abort any ongoing logging operations
    if (this.loggingAbortController) {
      this.loggingAbortController.abort();
      this.loggingAbortController = null;
    }

    // Close the log stream
    if (this.logStream) {
      try {
        await this.logStream.close();
      } catch (error: unknown) {
        console.error("Error closing log stream:", error);
      }
      this.logStream = null;
    }

    // Close the log file
    if (this.logFile) {
      try {
        await this.logFile.close();
      } catch (error: unknown) {
        if (!(error instanceof Deno.errors.BadResource)) {
          console.error("Error closing log file:", error);
        }
      }
      this.logFile = null;
    }
  }
}
