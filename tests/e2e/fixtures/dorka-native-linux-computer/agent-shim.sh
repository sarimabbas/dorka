#!/usr/bin/env bash
set -euo pipefail

token=''
for argument in "$@"; do
  if [[ "$argument" =~ (run-dna-[a-z0-9_.-]+) ]]; then
    token="${BASH_REMATCH[1]}"
  fi
done
if [[ -z "$token" ]]; then
  printf 'DORKA_NATIVE_AGENT_ERROR missing run token\n' >&2
  exit 64
fi

printf 'DORKA_NATIVE_AGENT_READY %s\n' "$token"
while [[ ! -e "/workspace/$token.exit" ]]; do sleep 0.2; done
printf 'DORKA_NATIVE_AGENT_EXIT %s\n' "$token"
exit "${DORKA_NATIVE_AGENT_EXIT_CODE:-23}"
