#!/usr/bin/env bash
set -euo pipefail

mkdir -p /run/sshd /workspace /home/ubuntu/.ssh
chown ubuntu:ubuntu /workspace /home/ubuntu/.ssh
chmod 0700 /home/ubuntu/.ssh
ssh-keygen -A

/usr/sbin/sshd -D -e \
  -o "Port=${DORKA_SSH_PORT:-2222}" \
  -o AllowUsers=ubuntu \
  -o PasswordAuthentication=yes \
  -o PermitRootLogin=no &
sshd_pid=$!

shutdown() {
  kill -TERM "$sshd_pid" "$desktop_pid" 2>/dev/null || true
  wait "$sshd_pid" "$desktop_pid" 2>/dev/null || true
}
trap shutdown INT TERM EXIT

setpriv --reuid=1000 --regid=1000 --init-groups /usr/bin/supervisord "$@" &
desktop_pid=$!
wait -n "$sshd_pid" "$desktop_pid"
