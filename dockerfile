FROM --platform=${TARGETPLATFORM:-linux/amd64} denoland/deno:alpine-2.1.1

# Install minimal dependencies required for networking
RUN apk add --no-cache --update \
    iproute2 \
    curl \
    iptables \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Copy application source
COPY src /app/src

# Make scripts executable
RUN chmod +x /app/src/scripts/*.sh

# Set entrypoint script
RUN chmod +x /app/src/scripts/entrypoint.sh
ENTRYPOINT ["/app/src/scripts/entrypoint.sh"]

# Command to run the application
CMD ["deno", "run", "--allow-all", "--quiet", "/app/src/index.ts"]
