// This script serves as a shim to force Deno.serve to use the specified port
// It wraps the original serve function with one that forces the port from environment

// Store reference to the original serve function
const originalServe = Deno.serve;

// Override Deno.serve with our custom implementation that forces the PORT
// @ts-ignore - We're intentionally overriding the typing to inject our port
Deno.serve = function (...args: unknown[]) {
  const port = Number(Deno.env.get("PORT"));

  // Handle different ways of calling Deno.serve
  if (args.length === 1 && typeof args[0] === "function") {
    // If called with just a handler: Deno.serve(handler)
    // Create a new array with options object first, then the handler
    args = [{}, args[0]];
  }

  if (!args[0] || typeof args[0] !== "object") {
    throw new Error("Invalid arguments");
  }

  const options = args[0] as Record<string, unknown>;
  options.port = port;
  options.hostname = "0.0.0.0";

  const handler = args[1] as Deno.ServeHandler;
  const wrapper: Deno.ServeHandler = (...handlerArgs) => {
    const req = handlerArgs[0] as Request;

    const isHealthCheck = req.method === "HEAD" && req.headers.get("x-graphand-healthcheck") === "true";
    if (isHealthCheck) {
      return new Response("OK", { status: 200 });
    }

    return handler(...handlerArgs);
  };
  args[1] = wrapper;

  // @ts-ignore - We know the args are valid for serve
  return originalServe.apply(Deno, args);
};

// Parse arguments
const args = Deno.args;
if (args.length < 1) {
  throw new Error("No server path provided as argument");
}

const serverPath = args[0];

// Create loader for the dynamic import
async function loadServer() {
  // Use file:// protocol to ensure we're using absolute paths
  const fileUrl = new URL(`file://${serverPath}`);

  // Important: When Deno.run is executed with --import-map or --config flags,
  // those settings are automatically used for any import() calls within the program.
  // No additional configuration is needed here, as the main Deno process was
  // started with the correct flags.
  await import(fileUrl.href);
}

// Load the server with the proper configuration
await loadServer();
