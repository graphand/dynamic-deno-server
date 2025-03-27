import { CONFIG } from "../config.ts";
import { NamespaceService } from "../services/NamespaceService.ts";
import { SubdirectoryServer } from "../types.ts";
import { isDirectory } from "./system.ts";

export async function validateCode(path: string) {
  const cmd = ["deno", "check", "--quiet", "--all", "--allow-import", `${path}/index.ts`];
  const command = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    stdout: "piped",
    stderr: "piped",
    env: CONFIG.serverEnvironment,
  });

  const child = command.spawn();
  const { success } = await child.status;
  const { stderr } = await child.output();

  if (!success) {
    throw new Error(new TextDecoder().decode(stderr));
  }
}

export async function checkServerHealth(
  server: SubdirectoryServer,
  port: number,
  maxAttempts: number,
): Promise<boolean> {
  const retryDelay = 50;
  const namespace = new NamespaceService(server.namespace);

  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await namespace.connect(port);
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
