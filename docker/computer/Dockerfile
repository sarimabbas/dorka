# syntax=docker/dockerfile:1
# Pinned official Selkies desktop. Override only with a tested compatible image.
ARG SELKIES_IMAGE=ghcr.io/selkies-project/nvidia-glx-desktop:24.04-20260810151351
FROM ${SELKIES_IMAGE}

# Install system packages as real root. fakeroot cannot perform dpkg ownership changes under
# rootless Podman/buildx emulation and produced an image that could not be built reproducibly.
USER 0
SHELL ["/bin/sh", "-c"]
ARG DEBIAN_FRONTEND=noninteractive
# hadolint ignore=DL3008,SC1008
RUN apt-get update && apt-get install --no-install-recommends -y \
      bash build-essential ca-certificates curl git jq nodejs npm openssh-server python3 && \
    apt-get clean && \
    rm -f /etc/ssh/ssh_host_* && \
    rm -rf /var/lib/apt/lists/* /var/cache/debconf/* /var/log/* /tmp/* /var/tmp/*

# sshd starts as root, then drops each session to the unprivileged ubuntu user.
# hadolint ignore=DL3002
USER 0
COPY docker/computer/entrypoint.sh /usr/local/bin/dorka-computer-entrypoint
# hadolint ignore=SC1008
RUN chmod 0755 /usr/local/bin/dorka-computer-entrypoint && \
    mkdir -p /run/sshd /workspace && chown ubuntu:ubuntu /workspace

# DORKA_SSH_PUBLIC_KEY is required at runtime; the image never contains a private key.
ENV DORKA_SSH_PORT=2222
WORKDIR /workspace
VOLUME ["/home/ubuntu", "/workspace"]
EXPOSE 2222 8080
ENTRYPOINT ["/usr/local/bin/dorka-computer-entrypoint"]
HEALTHCHECK --interval=15s --timeout=5s --start-period=45s --retries=5 \
  CMD bash -c 'exec 3<>/dev/tcp/127.0.0.1/${DORKA_SSH_PORT} && curl -ksS -o /dev/null https://127.0.0.1:8080/'
