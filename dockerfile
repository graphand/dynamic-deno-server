FROM --platform=${TARGETPLATFORM:-linux/amd64} denoland/deno:alpine-2.0.6

RUN apk add --no-cache iproute2 curl

WORKDIR /app

COPY src src

RUN chmod +x ./scripts/*.sh

CMD ["deno", "run", "--allow-all", "--quiet", "./src/index.ts"]
