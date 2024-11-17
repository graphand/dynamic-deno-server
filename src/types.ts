export interface SubdirectoryServer {
  namespace: string;
  ipAddress: string;
  status: "starting" | "ready" | "failed";
  error?: string;
  process?: Deno.ChildProcess;
  readyPromise: Promise<void>;
}

export interface IPAddresses {
  mainIP: string;
  childIP: string;
}
