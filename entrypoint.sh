#!/bin/sh
set -e

# Run the Deno application
exec deno run --allow-all --quiet --config ./deno.json ./index.ts "$@"