import { resolve } from "https://deno.land/std@0.200.0/path/resolve.ts";
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
      return Promise.reject(new Error(`Command failed: ${cmd.join(" ")}\n${errorOutput}`));
    }
    return output;
  } catch (error) {
    return Promise.reject(new Error(`Failed to run command: ${cmd.join(" ")}\n${(error as Error).message}`));
  }
}

export async function runCommandNS(namespace: string, cmd: string[]): Promise<string> {
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

export async function isFile(path: string): Promise<boolean> {
  try {
    const stat = await Deno.stat(path);
    return stat.isFile;
  } catch {
    return false;
  }
}

export async function normalizePath(path: string): Promise<string> {
  try {
    const realPath = await Deno.realPath(path);

    if (!(await isDirectory(realPath))) {
      throw new Error(`Path ${path} is not a directory`);
    }

    if (!realPath.startsWith(CONFIG.funcDirectory)) {
      throw new Error(`Path ${path} is not within ${CONFIG.funcDirectory}`);
    }

    const serverName = realPath.slice(CONFIG.funcDirectory.length + 1);

    if (!serverName || serverName.includes("/")) {
      throw new Error(`Path ${path} is not a valid server name`);
    }

    const index = resolve(realPath, "index.ts");
    if (!(await isFile(index))) {
      throw new Error(`Path ${path} does not contain an index.ts file`);
    }

    return serverName;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return path;
    }
    throw error;
  }
}
