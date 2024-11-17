import { IPAddresses } from "../types.ts";

// Helper function to generate unique namespace names
export function generateNamespaceName(path: string): string {
  return "ns_" + btoa(path).replace(/=/g, "");
}

// Helper function to generate IP addresses for main and child namespaces
export function generateIPAddresses(index: number): IPAddresses {
  const thirdOctet = Math.floor(index / 128);
  const baseFourthOctet = (index % 128) * 2;
  const mainIP = `10.200.${thirdOctet}.${baseFourthOctet}`;
  const childIP = `10.200.${thirdOctet}.${baseFourthOctet + 1}`;
  return { mainIP, childIP };
}

export function generateIndexFromPath(normalizedPath: string): number {
  let hash = 0;
  for (let i = 0; i < normalizedPath.length; i++) {
    const char = normalizedPath.charCodeAt(i);
    hash = (hash * 31 + char) % 16384;
  }
  return hash;
}
