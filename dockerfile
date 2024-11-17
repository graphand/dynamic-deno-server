FROM --platform=${TARGETPLATFORM:-linux/amd64} denoland/deno:alpine-2.0.6

RUN apk add --no-cache iproute2 iptables

WORKDIR /app

COPY src .

CMD ["deno", "run", "--allow-all", "--quiet", "./index.ts"]