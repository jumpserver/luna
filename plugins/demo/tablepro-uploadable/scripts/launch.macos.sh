#!/bin/bash

set -euo pipefail

CONNECT_JSON="${JMS_CONNECT_JSON:-}"
DB_TYPE="${JMS_DB_TYPE:-}"
HOST="${JMS_HOST:-}"
PORT="${JMS_PORT:-}"
DATABASE="${JMS_DATABASE:-}"
USERNAME="${JMS_USERNAME:-}"
PASSWORD="${JMS_PASSWORD:-}"

if [[ -z "$DB_TYPE" || -z "$HOST" || -z "$PORT" || -z "$USERNAME" ]]; then
    echo "missing required database arguments" >&2
    exit 1
fi

if [[ -n "$CONNECT_JSON" ]]; then
    echo "Launching TablePro with JMS_CONNECT_JSON context" >&2
fi

url_encode() {
    /usr/bin/python3 -c '
import sys
import urllib.parse

print(urllib.parse.quote(sys.argv[1], safe=""))
' "$1"
}

USER_ENCODED="$(url_encode "$USERNAME")"
PASS_ENCODED="$(url_encode "$PASSWORD")"
DB_ENCODED="$(url_encode "$DATABASE")"

case "$DB_TYPE" in
    mysql|mariadb)
        SCHEME="mysql"
        ;;
    postgresql|postgres)
        SCHEME="postgresql"
        ;;
    *)
        echo "unsupported database type: $DB_TYPE" >&2
        exit 2
        ;;
esac

URL="${SCHEME}://${USER_ENCODED}:${PASS_ENCODED}@${HOST}:${PORT}/${DB_ENCODED}"

open "$URL"
