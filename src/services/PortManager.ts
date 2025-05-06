import { CONFIG } from "../config.ts";

export class PortManager {
  private static instance: PortManager;
  private usedPorts: Set<number>;
  private portMapping: Map<string, number>;
  private basePort: number;
  private maxPort: number;

  private constructor() {
    this.usedPorts = new Set();
    this.portMapping = new Map();
    this.basePort = CONFIG.basePort;
    this.maxPort = CONFIG.maxPort;
  }

  public static getInstance(): PortManager {
    if (!PortManager.instance) {
      PortManager.instance = new PortManager();
    }
    return PortManager.instance;
  }

  public allocatePort(serverPath: string): number {
    // Check if this server already has a port
    if (this.portMapping.has(serverPath)) {
      return this.portMapping.get(serverPath)!;
    }

    // Find an unused port
    let port = this.basePort;
    while (this.usedPorts.has(port) && port <= this.maxPort) {
      port++;
    }

    if (port > this.maxPort) {
      throw new Error(`No available ports in range ${this.basePort}-${this.maxPort}`);
    }

    // Save the port allocation
    this.usedPorts.add(port);
    this.portMapping.set(serverPath, port);

    return port;
  }

  public releasePort(serverPath: string): void {
    const port = this.portMapping.get(serverPath);
    if (port) {
      this.usedPorts.delete(port);
      this.portMapping.delete(serverPath);
    }
  }

  public getPort(serverPath: string): number | undefined {
    return this.portMapping.get(serverPath);
  }
}
