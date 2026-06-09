#!/usr/bin/env bash
# JumpServer Client plugin launch script (Linux demo)
# Receives connection context via JMS_CONNECT_JSON environment variable.

set -euo pipefail

if [[ -z "${JMS_CONNECT_JSON:-}" ]]; then
  echo "JMS_CONNECT_JSON is not set" >&2
  exit 1
fi

if command -v zenity >/dev/null 2>&1; then
  zenity --info --title="JumpServer Plugin Demo" --text="Hello Terminal Demo\n\n${JMS_CONNECT_JSON}" --width=400
elif command -v notify-send >/dev/null 2>&1; then
  notify-send "JumpServer Plugin Demo" "Hello Terminal Demo - see logs for JMS_CONNECT_JSON"
  echo "${JMS_CONNECT_JSON}"
else
  echo "[Hello Terminal Demo] JMS_CONNECT_JSON=${JMS_CONNECT_JSON}"
fi

exit 0
