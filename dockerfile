# Use the latest Deno image
FROM denoland/deno:latest

# Set the working directory
WORKDIR /app

# Copy the source code
COPY src .
COPY deno.json .
COPY entrypoint.sh .

# Make the entrypoint script executable
RUN chmod +x ./entrypoint.sh

# Set the entrypoint script
ENTRYPOINT ["./entrypoint.sh"]
