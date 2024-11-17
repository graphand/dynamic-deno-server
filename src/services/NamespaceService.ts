import { runCommand, runCommandNS } from "../utils/system.ts";
import { generateIPAddresses } from "../utils/network.ts";

export class NamespaceService {
  constructor(private readonly namespace: string) {}

  async exists(): Promise<boolean> {
    try {
      const output = await runCommand(["ip", "netns", "list"]);
      const list = output.split("\n").map(line => line.split(" ")[0]);
      return list.includes(this.namespace);
    } catch {
      return false;
    }
  }

  async create(index: number): Promise<{ mainIP: string; childIP: string }> {
    const { mainIP, childIP } = generateIPAddresses(index);
    const vethMain = `veth-main${index}`;
    const vethChild = `veth-child${index}`;

    // Create network namespace
    await runCommand(["ip", "netns", "add", this.namespace]);

    await Promise.all([
      runCommand(["ip", "link", "add", vethMain, "type", "veth", "peer", "name", vethChild]),
      runCommand(["ip", "link", "set", vethChild, "netns", this.namespace]),
      runCommand(["mkdir", "-p", `/etc/netns/${this.namespace}`]),
    ]);

    await Promise.all([
      // Configure main namespace
      runCommand(["ip", "addr", "add", `${mainIP}/24`, "dev", vethMain]),
      runCommand(["ip", "link", "set", vethMain, "up"]),

      // Configure child namespace
      runCommandNS(this.namespace, ["ip", "addr", "add", `${childIP}/24`, "dev", vethChild]),
      runCommandNS(this.namespace, ["ip", "link", "set", vethChild, "up"]),
      runCommandNS(this.namespace, ["ip", "link", "set", "lo", "up"]),
      runCommandNS(this.namespace, ["ip", "route", "add", "default", "via", mainIP]),

      // Create DNS configuration
      Deno.writeTextFile(
        `/etc/netns/${this.namespace}/resolv.conf`,
        "nameserver 1.1.1.1\n" + "nameserver 8.8.8.8",
      ),
    ]);

    // Add NAT rules
    await runCommand([
      "iptables",
      "-t",
      "nat",
      "-A",
      "POSTROUTING",
      "-s",
      `${childIP}/24`,
      "-j",
      "MASQUERADE",
    ]);

    return { mainIP, childIP };
  }

  async cleanup(ipAddress: string): Promise<void> {
    // Clean up DNS configuration
    await runCommand(["rm", "-rf", `/etc/netns/${this.namespace}`]).catch(console.error);

    // Delete namespace if it exists
    if (await this.exists()) {
      await runCommand(["ip", "netns", "del", this.namespace]);
    }

    // Remove NAT rules
    await runCommand([
      "iptables",
      "-t",
      "nat",
      "-D",
      "POSTROUTING",
      "-s",
      `${ipAddress}/24`,
      "-j",
      "MASQUERADE",
    ]).catch(() => null);
  }

  executeCommand(cmd: string[]): Deno.ChildProcess {
    const command = new Deno.Command("ip", {
      args: ["netns", "exec", this.namespace, ...cmd],
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    });

    return command.spawn();
  }
}
