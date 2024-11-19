import { isDirectory } from "./system.ts";

export async function validateCode(path: string) {
  const cmd = ["deno", "check", "--quiet", "--all", "--allow-import", `${path}/index.ts`];
  const command = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    stdout: "piped",
    stderr: "piped",
  });

  const child = command.spawn();
  const { success } = await child.status;
  const { stderr } = await child.output();

  if (!success) {
    throw new Error(new TextDecoder().decode(stderr));
  }
}

export async function checkServerHealth(ipAddress: string, port: number): Promise<boolean> {
  const maxAttempts = 5;
  const retryDelay = 50;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const conn = await Deno.connect({ hostname: ipAddress, port });
      conn.close();
      return true;
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
