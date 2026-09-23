# syntax=docker/dockerfile:1
ARG DORKA_VERSION=v1.4.197

FROM ubuntu:22.04 AS appimage
ARG DORKA_VERSION
ARG TARGETARCH
RUN apt-get update && apt-get install --no-install-recommends -y ca-certificates curl && \
    rm -rf /var/lib/apt/lists/* && \
    case "${TARGETARCH}" in \
      amd64) asset=orca-linux.AppImage ;; \
      arm64) asset=orca-linux-arm64.AppImage ;; \
      *) echo "Unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac && \
    curl -fsSL --retry 3 \
      "https://github.com/stablyai/orca/releases/download/${DORKA_VERSION}/${asset}" \
      -o /tmp/dorka.AppImage && \
    chmod +x /tmp/dorka.AppImage && \
    cd /opt && /tmp/dorka.AppImage --appimage-extract && \
    mv squashfs-root dorka && chmod -R a+rX /opt/dorka

FROM ubuntu:22.04
ARG TARGETARCH
ARG DOCKER_CLI_VERSION=28.5.1
RUN apt-get update && apt-get install --no-install-recommends -y \
      bash ca-certificates curl file git gosu jq libasound2 libatk-bridge2.0-0 \
      libatk1.0-0 libcairo2 libcups2 libdrm2 libgbm1 libgtk-3-0 libnss3 \
      libpango-1.0-0 libx11-xcb1 libxcb-dri3-0 libxcomposite1 libxdamage1 \
      libxfixes3 libxkbcommon0 libxrandr2 libxrender1 libxss1 libxtst6 \
      openssh-client xvfb zlib1g-dev && \
    rm -rf /var/lib/apt/lists/* && \
    case "${TARGETARCH}" in amd64) docker_arch=x86_64 ;; arm64) docker_arch=aarch64 ;; \
      *) echo "Unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; esac && \
    curl -fsSL --retry 3 \
      "https://download.docker.com/linux/static/stable/${docker_arch}/docker-${DOCKER_CLI_VERSION}.tgz" \
      | tar -xz -C /usr/local/bin --strip-components=1 docker/docker && \
    groupadd --gid 1000 dorka && \
    useradd --uid 1000 --gid dorka --create-home --home-dir /data --shell /bin/bash dorka
COPY --from=appimage /opt/dorka /opt/dorka
COPY docker/server/entrypoint.sh /usr/local/bin/dorka-server-entrypoint
RUN chmod 0755 /usr/local/bin/dorka-server-entrypoint && mkdir -p /data && chown dorka:dorka /data

ENV HOME=/data \
    LIBGL_ALWAYS_SOFTWARE=1 \
    DOCKER_HOST=unix:///var/run/docker.sock
WORKDIR /data
VOLUME ["/data"]
EXPOSE 6768
ENTRYPOINT ["/usr/local/bin/dorka-server-entrypoint"]
CMD ["serve", "--port", "6768"]
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=5 \
  CMD bash -c 'exec 3<>/dev/tcp/127.0.0.1/6768'
