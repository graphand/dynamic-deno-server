export interface SubdirectoryServer {
  namespace: string;
  status: "starting" | "ready" | "failed";
  error?: string;
  process?: Deno.ChildProcess;
  readyPromise: Promise<void>;
}
