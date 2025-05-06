# Dynamic Deno Server

A dynamic server manager for Deno projects.

## Features

- Automatically discovers and runs servers in subdirectories
- Health checks to ensure servers are running properly
- Port allocation for each server
- File watching for automatic server reloading
- Manual server reloading via API

## Configuration

The following environment variables can be used to configure the server:

| Variable              | Default        | Description                               |
| --------------------- | -------------- | ----------------------------------------- |
| PORT                  | 9999           | Main server port                          |
| HEALTH_CHECK_ATTEMPTS | 5              | Number of attempts to check server health |
| CHECK_CODE            | true           | Whether to check code before running      |
| SAVE_LOGS             | false          | Whether to save server logs               |
| QUIET                 | false          | Suppress console output                   |
| WATCH_FILES           | false          | Watch for file changes and reload servers |
| SERVER_PORT           | 8000           | Default server port                       |
| BASE_PORT             | 8001           | Base port for automatic allocation        |
| MAX_PORT              | 9000           | Maximum port for automatic allocation     |
| FUNC_DIRECTORY        | /opt/functions | Directory to scan for functions           |
| LOGS_DIRECTORY        | /opt/logs      | Directory to save logs                    |
| LOG_FORMAT            | cri            | Log format (cri or docker)                |
| ENV_JSON              | {}             | JSON string of environment variables      |
| ENV_FILE              | ""             | Path to env file for servers              |

## File Watching

The server can automatically watch for file changes in each server directory and reload the server when
changes are detected. To enable this feature, set the `WATCH_FILES` environment variable to `true`:

```bash
WATCH_FILES=true deno run --allow-all main.ts
```

This will watch for file changes in each server directory and automatically reload the server when changes are
detected.

## Manual Reloading

Servers can also be manually reloaded via the API:

```bash
# Reload the 'my-server' server
curl -X POST http://localhost:9999/my-server/reload
```

The API will return a JSON response with the status of the reload operation:

```json
{
  "success": true,
  "message": "Server my-server reloaded successfully"
}
```

## Usage

1. Create a directory structure with subdirectories containing server code
2. Run the main server with `deno run --allow-all main.ts`
3. Each subdirectory will be started as a separate server
4. Access each server through the main server with `http://localhost:9999/subdirectory/path`
