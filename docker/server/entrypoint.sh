#!/usr/bin/env bash
set -euo pipefail

socket=/var/run/docker.sock
if [[ -S "$socket" ]]; then
  socket_gid=$(stat -c '%g' "$socket")
  socket_group=$(getent group "$socket_gid" | cut -d: -f1 || true)
  if [[ -z "$socket_group" ]]; then
    socket_group=dorka-engine
    groupadd --gid "$socket_gid" "$socket_group"
  fi
  usermod -aG "$socket_group" dorka
else
  echo "warning: no container-engine socket is mounted at $socket" >&2
fi

chown dorka:dorka /data
exec gosu dorka /opt/dorka/AppRun "$@"
