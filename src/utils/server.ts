import { CONFIG } from "../config.ts";
import { SubdirectoryServer } from "../types.ts";
import { isDirectory } from "./system.ts";

export async function validateCode(args: string[]) {
  const cmd = ["deno", "check", "--quiet", "--all", "--allow-import", ...args];
  const command = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    stdout: "piped",
    stderr: "piped",
    env: CONFIG.envJSON,
  });

  const child = command.spawn();
  const { success } = await child.status;
  const { stderr } = await child.output();

  if (!success) {
    throw new Error(new TextDecoder().decode(stderr));
  }
}

export async function checkServerHealth(server: SubdirectoryServer, maxAttempts: number): Promise<boolean> {
  const retryDelay = 50;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      // Create a request to check if the server is ready
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 1000);

      const response = await fetch(`http://localhost:${server.port}`, {
        method: "HEAD",
        headers: {
          "x-graphand-healthcheck": "true",
        },
        signal: controller.signal,
      });

      clearTimeout(id);
      return response.status === 200;
    } catch {
      const delay = retryDelay * Math.pow(3, i / 2);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return false;
}

export async function pollDirectory(path: string, interval: number = 3000) {
  while (true) {
    const exists = await isDirectory(path);
    if (!exists) {
      throw new Error();
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}
