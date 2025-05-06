export interface SubdirectoryServer {
  path: string;
  port: number;
  status: "starting" | "ready" | "failed";
  error?: string;
  process?: Deno.ChildProcess;
  readyPromise: Promise<void>;
}
