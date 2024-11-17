# Dynamic Deno Server 🚀

Welcome to **Dynamic Deno Server**! This project allows you to dynamically manage multiple Deno servers with isolation using Linux network namespaces. It watches a main directory for subdirectories containing Deno applications and automatically serves them as separate instances. Think of it as a magical proxy that spins up servers on the fly! 🪄

## Table of Contents

- [Features](#features)
- [How It Works](#how-it-works)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Running with Docker](#running-with-docker)
- [Usage](#usage)
- [Example](#example)
- [How to Stop the Server](#how-to-stop-the-server)
- [Contributing](#contributing)
- [License](#license)

## Features ✨

- **Dynamic Subdirectory Watching**: Automatically detects new subdirectories and serves them.
- **Isolation with Network Namespaces**: Each subdirectory server runs in its own Linux network namespace for security and isolation.
- **Proxy Requests**: Proxies incoming requests to the appropriate subdirectory server.
- **Automatic Cleanup**: Stops servers and cleans up resources when subdirectories are deleted.

## How It Works 🛠️

1. **Main Server**: A global Deno server runs and watches a specified main directory (e.g., `/opt/functions`).
2. **Subdirectory Detection**: When you add a new subdirectory with an `index.ts` file, the main server detects it.
3. **Namespace Creation**: It creates a dedicated Linux network namespace for the subdirectory server.
4. **Server Startup**: Runs the subdirectory's `index.ts` file using Deno within the namespace.
5. **Request Proxying**: Incoming requests to the main server are proxied to the appropriate subdirectory server based on the URL path.
6. **Cleanup**: If a subdirectory is removed, its server is stopped, and resources are cleaned up.

## Prerequisites 📋

- **Docker** installed on your machine.
- **Deno** (if you plan to run without Docker).
- **Linux Kernel** with support for network namespaces (most modern Linux distributions).

## Installation 📦

Clone the repository:

```bash
git clone https://github.com/graphand/dynamic-deno-server.git
cd dynamic-deno-server
```

## Running with Docker 🐳

To make things easy, you can run the Dynamic Deno Server using Docker. Here's how:

### 1. Build the Docker Image 🔨

```bash
docker build -t dynamic-deno-server .
```

### 2. Run the Docker Container 🚀

```bash
docker run -d \
  --name dynamic-deno-server \
  -p 9999:9999 \
  -v /opt/functions:/opt/functions \
  --privileged \
  dynamic-deno-server
```

- **Explanation**:
  - `-d`: Run the container in detached mode.
  - `--name`: Name the container.
  - `-p 9999:9999`: Map port `9999` of the container to port `9999` on your host.
  - `-v /opt/functions:/opt/functions`: Mount the host directory `/opt/functions` into the container at `/opt/functions` (this is the watched directory).
  - `--privileged`: Allow the container to use advanced Linux features like network namespaces.

### 3. Create a Subdirectory Server 📁

Inside the `/opt/functions` directory on your host machine, create a new subdirectory with an `index.ts` file:

```bash
mkdir -p /opt/functions/hello-world
```

Create the `index.ts` file:

```typescript
// /opt/functions/hello-world/index.ts
import { serve } from "https://deno.land/std@0.200.0/http/server.ts";

serve((req) => new Response("Hello from Hello World Function!"));
```

### 4. Access the Subdirectory Server 🌐

Now, you can access your subdirectory server via the main server proxy:

```bash
curl http://localhost:9999/hello-world
```

You should see:

```
Hello from Hello World Function!
```

## Usage 📝

- **Adding Subdirectory Servers**: Simply add a new subdirectory with an `index.ts` file, and the main server will automatically start serving it.
- **Removing Subdirectory Servers**: Delete the subdirectory, and the main server will stop and clean up the associated server.
- **Multiple Subdirectories**: You can have multiple subdirectories, each running its own Deno server.

## Example 🌟

Let's create another example subdirectory:

```bash
mkdir -p /opt/functions/goodbye-world
```

Create the `index.ts` file:

```typescript
// /opt/functions/goodbye-world/index.ts
import { serve } from "https://deno.land/std@0.200.0/http/server.ts";

serve((req) => new Response("Goodbye from Goodbye World Function!"));
```

Access it via:

```bash
curl http://localhost:9999/goodbye-world
```

You should see:

```
Goodbye from Goodbye World Function!
```

## How to Stop the Server 🛑

To stop and remove the Docker container:

```bash
docker stop dynamic-deno-server
docker rm dynamic-deno-server
```

## Contributing 🤝

Contributions are welcome! Please open an issue or submit a pull request.

## License 📄

This project is licensed under the MIT License.

---

Made with ❤️ using Deno and Docker.

# Dockerfile

Here's the `Dockerfile` used to build the Docker image:

```dockerfile
# Use the latest Deno image
FROM --platform=${TARGETPLATFORM:-linux/amd64} denoland/deno:latest

# Install necessary packages
RUN apt-get update && apt-get install -y iproute2 iptables

# Set the working directory
WORKDIR /app

# Copy the source code
COPY src .

# Expose the main server port
EXPOSE 9999

# Run the main index.ts file
CMD ["deno", "run", "--allow-all", "--quiet", "./index.ts"]
```

# Project Structure 📁

```
dynamic-deno-server/
├── src/
│   ├── index.ts
│   ├── config.ts
│   ├── types.ts
│   ├── services/
│   │   ├── ServerManager.ts
│   │   └── NamespaceService.ts
│   └── utils/
│       ├── server.ts
│       ├── system.ts
│       ├── network.ts
│       └── path.ts
├── Dockerfile
└── README.md
```

## Brief Code Overview 🧐

- **index.ts**: The entry point. Starts the main server, watches the main directory, and manages subdirectory servers.
- **config.ts**: Contains configuration like ports and main directory path.
- **types.ts**: Defines TypeScript interfaces for the project.
- **ServerManager.ts**: Manages starting and stopping of subdirectory servers.
- **NamespaceService.ts**: Handles creation and cleanup of network namespaces.
- **utils/**: Contains utility functions for server validation, system commands, networking, and path normalization.

## Security Considerations 🔒

- **Isolation**: Each subdirectory server runs in its own network namespace, providing isolation.
- **Permissions**: The Docker container runs with `--privileged` to allow network namespace operations. Ensure you trust the code being run.
- **Code Validation**: Subdirectory code is validated before execution using `deno check`.

## Troubleshooting 🛠️

- **Ports in Use**: Ensure that the port `9999` is not in use on your host machine.
- **Permissions**: Docker needs to run with `--privileged` to manage network namespaces.
- **Directory Mounting**: The `/opt/functions` directory must be accessible and mounted correctly in the Docker container.

Feel free to open an issue if you encounter any problems!

---

Happy Coding! 🎉
