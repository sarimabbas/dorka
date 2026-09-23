#!/usr/bin/env bash
set -euo pipefail

: "${DORKA_SSH_PUBLIC_KEY:?DORKA_SSH_PUBLIC_KEY is required}"
: "${DORKA_EXECUTION_GENERATION:?DORKA_EXECUTION_GENERATION is required}"

mkdir -p /run/sshd /workspace /home/ubuntu/.ssh
chown ubuntu:ubuntu /home/ubuntu /workspace /home/ubuntu/.ssh
chmod 0700 /home/ubuntu/.ssh

install -d -o root -g root -m 0755 /home/ubuntu/.dorka
install -d -o ubuntu -g ubuntu -m 0700 /home/ubuntu/.dorka/managed-pty-exits/v1
password_file=/home/ubuntu/.dorka/desktop-password
if [[ ! -s "$password_file" ]]; then
  umask 077
  openssl rand -base64 24 | tr -d '\n' > "$password_file"
fi
chown ubuntu:ubuntu "$password_file"
chmod 0600 "$password_file"
export PASSWD
PASSWD=$(<"$password_file")
generation_marker=$(mktemp /home/ubuntu/.dorka/execution-generation.XXXXXX)
printf '%s\n' "$DORKA_EXECUTION_GENERATION" > "$generation_marker"
chmod 0444 "$generation_marker"
mv "$generation_marker" /home/ubuntu/.dorka/execution-generation

authorized_keys=/home/ubuntu/.ssh/authorized_keys
temporary_keys=$(mktemp /home/ubuntu/.ssh/authorized_keys.XXXXXX)
touch "$authorized_keys"
grep -Fvx -- "$DORKA_SSH_PUBLIC_KEY" "$authorized_keys" > "$temporary_keys" || true
printf '%s\n' "$DORKA_SSH_PUBLIC_KEY" >> "$temporary_keys"
chown ubuntu:ubuntu "$temporary_keys"
chmod 0600 "$temporary_keys"
mv "$temporary_keys" "$authorized_keys"
ssh-keygen -A

/usr/sbin/sshd -D -e \
  -o "Port=${DORKA_SSH_PORT:-2222}" \
  -o AllowUsers=ubuntu \
  -o PubkeyAuthentication=yes \
  -o PasswordAuthentication=no \
  -o KbdInteractiveAuthentication=no \
  -o PermitRootLogin=no &

# Selkies' rootless service supervisor remains PID 1 while sshd serves as a
# private-network sidecar process. Container teardown terminates every process.
exec setpriv --reuid=1000 --regid=1000 --init-groups /etc/container-entrypoint.sh "$@"
