# Dynamic Deno Server 🚀

Welcome to **Dynamic Deno Server**! This project allows you to dynamically manage multiple Deno servers with
isolation using Linux network namespaces. It watches a main directory for subdirectories containing Deno
applications and automatically serves them as separate instances. Think of it as a magical proxy that spins up
servers on the fly! 🪄

## Table of Contents

- [Features](#features)
- [How It Works](#how-it-works)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Running with Docker](#running-with-docker)
  - [1. Build the Docker Image 🔨](#1-build-the-docker-image-)
  - [2. Run the Docker Container 🚀](#2-run-the-docker-container-)
  - [3. Create a Subdirectory Server 📁](#3-create-a-subdirectory-server-)
  - [4. Access the Subdirectory Server 🌐](#4-access-the-subdirectory-server-)
- [Running with Docker Compose 🐋](#running-with-docker-compose-)
- [Configuration](#configuration)
- [Environment Variables for Subdirectory Servers 🌍](#environment-variables-for-subdirectory-servers-)
- [Usage 📝](#usage-)
- [Example 🌟](#example-)
- [Logs 📑](#logs-)
- [How to Stop the Server 🛑](#how-to-stop-the-server-)
- [Contributing 🤝](#contributing-)
- [License 📄](#license-)

## Features ✨

- **Dynamic Subdirectory Watching**: Automatically detects new subdirectories and serves them.
- **Isolation with Network Namespaces**: Each subdirectory server runs in its own Linux network namespace for
  security and isolation.
- **Proxy Requests**: Proxies incoming requests to the appropriate subdirectory server based on the URL path.
- **Automatic Cleanup**: Stops servers and cleans up resources when subdirectories are deleted.
- **Logging Support**: Optionally log the stdout and stderr of each subdirectory server to files for easy
  debugging and monitoring.

## How It Works 🛠️

1. **Main Server**: A global Deno server runs and watches a specified main directory (e.g., `/opt/functions`).
2. **Subdirectory Detection**: When you add a new subdirectory with an `index.ts` file, the main server
   detects it.
3. **Namespace Creation**: It creates a dedicated Linux network namespace for the subdirectory server.
4. **Server Startup**: Runs the subdirectory's `index.ts` file using Deno within the namespace.
5. **Request Proxying**: Incoming requests to the main server are proxied to the appropriate subdirectory
   server based on the URL path.
6. **Logging (Optional)**: If enabled, the stdout and stderr of subdirectory servers are logged to files in
   `/opt/logs/{serverName}/`.
7. **Cleanup**: If a subdirectory is removed, its server is stopped, and resources are cleaned up.

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
  -v /opt/logs:/opt/logs \
  -e ENABLE_LOGS=true \
  -e SERVER_ENVIRONMENT={"KEY1":"value1","KEY2":"value2"} \
  --privileged \
  dynamic-deno-server
```

- **Explanation**:
  - `-d`: Run the container in detached mode.
  - `--name`: Name the container.
  - `-p 9999:9999`: Map port `9999` of the container to port `9999` on your host.
  - `-v /opt/functions:/opt/functions`: Mount the host directory `/opt/functions` into the container at
    `/opt/functions` (this is the watched directory).
  - `-v /opt/logs:/opt/logs`: Mount the host directory `/opt/logs` into the container at `/opt/logs` to access
    logs.
  - `-e ENABLE_LOGS=true`: Set the environment variable `ENABLE_LOGS` to `true` to enable logging.
  - `-e SERVER_ENVIRONMENT={"KEY1":"value1","KEY2":"value2"}`: Set the environment variable
    `SERVER_ENVIRONMENT` to a stringified JSON object containing key-value pairs of environment variables you
    wish to make available to your subdirectory servers.
  - `--privileged`: Allow the container to use advanced Linux features like network namespaces.

### 3. Create a Subdirectory Server 📁

Inside the `/opt/functions` directory on your host machine, create a new subdirectory with an `index.ts` file:

```bash
mkdir -p /opt/functions/hello-world
```

Create the `index.ts` file:

```typescript
// /opt/functions/hello-world/index.ts
Deno.serve(req => new Response("Hello from Hello World Function!"));
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

## Running with Docker Compose 🐋

For easier deployment, you can use Docker Compose. Create a `docker-compose.yml` file:

```yaml
services:
  dynamic-deno-server:
    build: .
    ports:
      - "9999:9999"
    volumes:
      - /opt/functions:/opt/functions
      - /opt/logs:/opt/logs
    environment:
      - ENABLE_LOGS=true
      - HEALTH_CHECK_ATTEMPTS=5
      - SERVICE_PORT=9999
      - SERVER_ENVIRONMENT={"KEY1":"value1","KEY2":"value2"}
    privileged: true
    restart: unless-stopped
```

Then run:

```bash
docker compose up -d
```

This will:

- Build the Docker image if needed
- Start the container in detached mode (-d)
- Mount the necessary volumes
- Set up the environment variables
- Enable privileged mode for network namespace support
- Automatically restart the container unless explicitly stopped

To stop the service:

```bash
docker compose down
```

For development, you might want to rebuild the image when making changes:

```bash
docker compose up -d --build
```

## Configuration

The Dynamic Deno Server can be configured using environment variables:

- `SERVICE_PORT`: Port on which the main server runs (default: `9999`).
- `HEALTH_CHECK_ATTEMPTS`: Number of attempts to check the health of a subdirectory server (default: `5`).
- `ENABLE_LOGS`: If set to `true`, enables logging of stdout and stderr for subdirectory servers (default:
  `false`).
- `SERVER_ENVIRONMENT`: A stringified JSON object containing key-value pairs of environment variables you wish
  to make available to your subdirectory servers.

## Environment Variables for Subdirectory Servers 🌍

The Dynamic Deno Server allows you to pass environment variables to all subdirectory servers using the
`SERVER_ENVIRONMENT` environment variable. This is particularly useful when you need to provide configuration,
API keys, or other environment-specific values to your functions.

### Usage

Set the `SERVER_ENVIRONMENT` variable as a stringified JSON object when running the container:

```bash
docker run -d \
  --name dynamic-deno-server \
  -p 9999:9999 \
  -v /opt/functions:/opt/functions \
  -e SERVER_ENVIRONMENT='{"API_KEY":"your-api-key","DATABASE_URL":"postgresql://user:pass@host/db"}' \
  --privileged \
  dynamic-deno-server
```

Or in your docker-compose.yml:

```yaml
services:
  dynamic-deno-server:
    build: .
    environment:
      - SERVER_ENVIRONMENT={"API_KEY":"your-api-key","DATABASE_URL":"postgresql://user:pass@host/db"}
    # ... other configuration
```

### Accessing Environment Variables

In your subdirectory server's `index.ts`, you can access these environment variables using `Deno.env`:

```typescript
// /opt/functions/my-server/index.ts
const apiKey = Deno.env.get("API_KEY");
const dbUrl = Deno.env.get("DATABASE_URL");

Deno.serve(req => new Response(`API Key: ${apiKey}, DB URL: ${dbUrl}`));
```

### Important Notes

- The `SERVER_ENVIRONMENT` value must be a valid JSON string
- Environment variables are isolated to each subdirectory server
- System environment variables (`SERVICE_PORT`, `HEALTH_CHECK_ATTEMPTS`, `ENABLE_LOGS`, `SERVER_ENVIRONMENT`)
  are not passed to subdirectory servers for security reasons
- If the JSON string is invalid, an error will be logged, and no custom environment variables will be set

## Usage 📝

- **Adding Subdirectory Servers**: Simply add a new subdirectory with an `index.ts` file, and the main server
  will automatically start serving it.
- **Removing Subdirectory Servers**: Delete the subdirectory, and the main server will stop and clean up the
  associated server.
- **Multiple Subdirectories**: You can have multiple subdirectories, each running its own Deno server.

## Example 🌟

Let's create another example subdirectory:

```bash
mkdir -p /opt/functions/goodbye-world
```

Create the `index.ts` file:

```typescript
// /opt/functions/goodbye-world/index.ts
Deno.serve(req => new Response("Goodbye from Goodbye World Function!"));
```

Access it via:

```bash
curl http://localhost:9999/goodbye-world
```

You should see:

```
Goodbye from Goodbye World Function!
```

## Logs 📑

If logging is enabled by setting the `ENABLE_LOGS` environment variable to `true`, the stdout and stderr of
each subdirectory server are written to files in the `/opt/logs/{serverName}/` directory inside the container.

- **Accessing Logs**: By binding the `/opt/logs` directory to a local directory on your host machine, you can
  access the logs locally.

  For example, when running the Docker container, add the volume binding:

  ```bash
  -v /path/to/local/logs:/opt/logs
  ```

  Replace `/path/to/local/logs` with the path where you want to store the logs on your host machine.

- **Log Files**:

  - **Standard Output**: `/opt/logs/{serverName}/stdout`
  - **Standard Error**: `/opt/logs/{serverName}/stderr`

- **Example**:

  Assuming you have a subdirectory server named `hello-world`, the logs will be located at:

  - Standard Output: `/path/to/local/logs/hello-world/stdout`
  - Standard Error: `/path/to/local/logs/hello-world/stderr`

- **Note**: The logs directory and files are created automatically when logging is enabled and a subdirectory
  server is started.

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

---

## Dockerfile

Here's the `Dockerfile` used to build the Docker image:

```dockerfile
# Use the latest Deno image
FROM --platform=${TARGETPLATFORM:-linux/amd64} denoland/deno:latest

# Install necessary packages
RUN apk add --no-cache iproute2 curl

# Set the working directory
WORKDIR /app

# Copy the source code
COPY src .

# Make the scripts executable
RUN chmod +x ./scripts/*.sh

# Run the main index.ts file
CMD ["deno", "run", "--allow-all", "--quiet", "./index.ts"]
```

## Project Structure 📁

```
dynamic-deno-server/
├── src/
│   ├── index.ts
│   ├── config.ts
│   ├── types.ts
│   ├── scripts/
│   │   ├── start-server.sh
│   │   └── stop-server.sh
│   ├── services/
│   │   ├── ServerManager.ts
│   │   └── NamespaceService.ts
│   └── utils/
│       ├── server.ts
│       ├── system.ts
├── dockerfile
├── docker-compose.yml
├── package.json
└── README.md
```

## Brief Code Overview 🧐

- **index.ts**: The entry point. Starts the main server, watches the main directory, and manages subdirectory
  servers.
- **config.ts**: Contains configuration like ports, main directory path, and logging settings.
- **types.ts**: Defines TypeScript interfaces for the project.
- **ServerManager.ts**: Manages starting and stopping of subdirectory servers.
- **NamespaceService.ts**: Handles creation and cleanup of network namespaces.
- **utils/**: Contains utility functions for server validation and system commands.

## Security Considerations 🔒

- **Isolation**: Each subdirectory server runs in its own network namespace, providing isolation.
- **Permissions**: The Docker container runs with `--privileged` to allow network namespace operations. Ensure
  you trust the code being run.
- **Code Validation**: Subdirectory code is validated before execution using `deno check`.
- **Logging Permissions**: Ensure that the `/opt/logs` directory is properly secured, especially if it
  contains sensitive information.

## Troubleshooting 🛠️

- **Ports in Use**: Ensure that the port `9999` is not in use on your host machine.
- **Permissions**: Docker needs to run with `--privileged` to manage network namespaces.
- **Directory Mounting**: The `/opt/functions` and `/opt/logs` directories must be accessible and mounted
  correctly in the Docker container.
- **watchFs**: The `Deno.watchFs` API is used to watch the main directory for changes. Ensure that the
  directory exists, is accessible and receives events.
- **Logging Not Working**: If logs are not being generated, ensure that `ENABLE_LOGS` is set to `true` and
  that the `/opt/logs` directory has the correct permissions.

Feel free to open an issue if you encounter any problems!

---

Happy Coding! 🎉

---

**Note**: Remember to replace `/path/to/local/logs` with the actual path where you want to store the logs on
your host machine when running the Docker container.
