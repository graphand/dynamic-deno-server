import { runCommand } from "../utils/system.ts";
import { resolve } from "path";

export class NamespaceService {
  constructor(private readonly namespace: string) {}

  // Helper function to generate namespace names
  static generateNamespaceName(path: string): string {
    return "ns_" + btoa(path).replace(/=/g, "");
  }

  async exists(): Promise<boolean> {
    try {
      const output = await runCommand(["ip", "netns", "list"]);
      const list = output.split("\n").map(line => line.split(" ")[0]);
      return list.includes(this.namespace);
    } catch {
      return false;
    }
  }

  async create(): Promise<void> {
    const scriptPath = resolve(Deno.cwd(), "./src/scripts/create-namespace.sh");
    await runCommand(["sh", scriptPath, this.namespace]);
  }

  async connect(port: number): Promise<boolean> {
    const process = await this.executeCommand(["nc", "-z", "-w1", "127.0.0.1", port.toString()]);
    const { success } = await process.status;

    if (!success) {
      throw new Error();
    }

    return success;
  }

  async fetch(url: string, request: Request): Promise<Response> {
    // Build curl command array
    // -s: silent mode, -D /dev/stderr: write headers to stderr, -o -: write body to stdout
    const curlCmd = ["curl", "-s", "-D", "/dev/stderr", "-o", "-"];

    // Set request method
    if (request.method !== "GET") {
      curlCmd.push("-X", request.method);
    }

    // Add headers from the request
    for (const [key, value] of request.headers.entries()) {
      curlCmd.push("-H", `${key}: ${value}`);
    }

    // Handle request body if present
    if (request.body) {
      curlCmd.push("--data-binary", "@-"); // Read from stdin
    }

    // Add the URL as the final argument
    curlCmd.push(url);

    // Execute curl in the namespace
    const process = this.executeCommand(curlCmd, {
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    });

    // If there's a body, pipe it to curl's stdin
    if (request.body) {
      const writer = process.stdin.getWriter();
      await request.body.pipeTo(
        new WritableStream({
          write(chunk) {
            return writer.write(chunk);
          },
          close() {
            return writer.close();
          },
        }),
      );
    }

    // Wait for the process to complete and get output
    const { stdout, stderr, success } = await process.output();

    // Handle error cases
    if (!success) {
      const errorText = new TextDecoder().decode(stderr);
      return new Response(errorText, {
        status: 500,
        statusText: "Error executing request in namespace",
      });
    }

    // Parse curl headers from stderr
    const stderrText = new TextDecoder().decode(stderr);
    const headers = new Headers();
    let status = 200;

    // Parse the headers from curl's output
    const headerLines = stderrText.split("\n");
    for (const line of headerLines) {
      if (line.startsWith("HTTP/")) {
        // Parse status code from HTTP response line
        status = parseInt(line.split(" ")[1], 10);
      } else if (line.includes(":")) {
        // Parse response headers
        const [key, ...values] = line.split(":");
        if (key && values.length) {
          headers.set(key.trim(), values.join(":").trim());
        }
      }
    }

    // Return response with parsed headers and status
    return new Response(stdout, {
      status,
      headers,
    });
  }

  async cleanup(): Promise<void> {
    const scriptPath = resolve(Deno.cwd(), "./src/scripts/cleanup-namespace.sh");
    await runCommand(["sh", scriptPath, this.namespace]);
  }

  executeCommand(
    cmd: string[],
    opts: {
      stdin?: Deno.CommandOptions["stdin"];
      stdout?: Deno.CommandOptions["stdout"];
      stderr?: Deno.CommandOptions["stderr"];
      clearEnv?: boolean;
      env?: Record<string, string>;
    } = {},
  ): Deno.ChildProcess {
    const env: Record<string, string> = Object.assign({}, opts.env, Deno.env.toObject());

    const clearVars = [
      "SERVER_ENVIRONMENT",
      "SERVICE_PORT",
      "HEALTH_CHECK_ATTEMPTS",
      "ENABLE_LOGS",
      "LOG_FORMAT",
    ];

    clearVars.forEach(key => {
      delete env[key];
    });

    const command = new Deno.Command("ip", {
      args: ["netns", "exec", this.namespace, ...cmd],
      stdin: opts.stdin ?? "piped",
      stdout: opts.stdout ?? "piped",
      stderr: opts.stderr ?? "piped",
      clearEnv: opts.clearEnv ?? false,
      env,
    });

    return command.spawn();
  }
}
