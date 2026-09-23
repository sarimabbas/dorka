# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /src
RUN apt-get update && apt-get install --no-install-recommends -y \
      g++ make python3 && \
    rm -rf /var/lib/apt/lists/* && \
    corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && \
    pnpm run rebuild:node && \
    pnpm run build:dorkad && \
    pnpm prune --prod --ignore-scripts

FROM node:24-bookworm-slim
ARG TARGETARCH
ARG DOCKER_CLI_VERSION=28.5.1
RUN apt-get update && apt-get install --no-install-recommends -y \
      bash ca-certificates curl file git gosu jq openssh-client zlib1g && \
    rm -rf /var/lib/apt/lists/* && \
    case "${TARGETARCH}" in amd64) docker_arch=x86_64 ;; arm64) docker_arch=aarch64 ;; \
      *) echo "Unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; esac && \
    curl -fsSL --retry 3 \
      "https://download.docker.com/linux/static/stable/${docker_arch}/docker-${DOCKER_CLI_VERSION}.tgz" \
      | tar -xz -C /usr/local/bin --strip-components=1 docker/docker && \
    groupmod --new-name dorka node && \
    usermod --login dorka --home /data --move-home --shell /bin/bash node
COPY --from=build /src/out/dorkad /opt/dorka/out/dorkad
COPY --from=build /src/node_modules /opt/dorka/node_modules
COPY --from=build /src/package.json /opt/dorka/package.json
COPY docker/server/entrypoint.sh /usr/local/bin/dorka-server-entrypoint
RUN chmod 0755 /usr/local/bin/dorka-server-entrypoint && mkdir -p /data && chown dorka:dorka /data

ENV HOME=/data \
    DOCKER_HOST=unix:///var/run/docker.sock
WORKDIR /data
VOLUME ["/data"]
EXPOSE 6768
ENTRYPOINT ["/usr/local/bin/dorka-server-entrypoint"]
CMD ["--port", "6768"]
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=5 \
  CMD bash -c 'exec 3<>/dev/tcp/127.0.0.1/6768'
