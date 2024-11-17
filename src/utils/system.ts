import { CONFIG } from "../config.ts";

export async function runCommand(cmd: string[]): Promise<string> {
  try {
    const command = new Deno.Command(cmd[0], {
      args: cmd.slice(1),
      stdout: "piped",
      stderr: "piped",
    });
    const child = command.spawn();
    const { success } = await child.status;
    const { stdout, stderr } = await child.output();
    const output = new TextDecoder().decode(stdout);
    const errorOutput = new TextDecoder().decode(stderr);
    if (!success) {
      return Promise.reject(
        new Error(`Command failed: ${cmd.join(" ")}\n${errorOutput}`)
      );
    }
    return output;
  } catch (error) {
    return Promise.reject(
      new Error(
        `Failed to run command: ${cmd.join(" ")}\n${(error as Error).message}`
      )
    );
  }
}

export async function runCommandNS(
  namespace: string,
  cmd: string[]
): Promise<string> {
  return await runCommand(["ip", "netns", "exec", namespace, ...cmd]);
}

export async function isDirectory(path: string): Promise<boolean> {
  try {
    const stat = await Deno.stat(path);
    return stat.isDirectory;
  } catch {
    return false;
  }
}

export async function normalizePath(path: string): Promise<string> {
  try {
    const realPath = await Deno.realPath(path);
    const realMainDir = await Deno.realPath(CONFIG.mainDirectory);

    if (realPath.startsWith(realMainDir)) {
      return btoa(realPath).replace(/=/g, "");
    }

    throw new Error(`Path ${path} is not within ${CONFIG.mainDirectory}`);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return path;
    }
    throw error;
  }
}
