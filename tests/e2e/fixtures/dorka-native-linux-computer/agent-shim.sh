#!/usr/bin/env bash
set -euo pipefail

token=''
for argument in "$@"; do
  case "$argument" in run-dna-*) token="$argument" ;; esac
done
if [[ -z "$token" ]]; then
  printf 'DORKA_NATIVE_AGENT_ERROR missing run token\n' >&2
  exit 64
fi

printf 'DORKA_NATIVE_AGENT_READY %s\n' "$token"
while [[ ! -e "/workspace/$token.exit" ]]; do sleep 0.2; done
printf 'DORKA_NATIVE_AGENT_EXIT %s\n' "$token"
exit "${DORKA_NATIVE_AGENT_EXIT_CODE:-23}"
