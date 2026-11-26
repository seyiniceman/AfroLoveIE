#!/usr/bin/env bash
set +x
set -euo pipefail
umask 077

if [[ $EUID -ne 0 || $# -ne 2 ]]; then
  echo "Usage: sudo bash fetch-runtime-secrets.sh DATABASE_URL_ARN SESSION_SECRET_ARN" >&2
  exit 1
fi

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
export AWS_PAGER=""
export AWS_CLI_AUTO_PROMPT=off

get_secret() {
  aws secretsmanager get-secret-value --region eu-west-1 \
    --secret-id "$1" --query SecretString --output json |
    python3 -c 'import json, sys
value = json.load(sys.stdin)
if not isinstance(value, str) or not value or any(c.isspace() or ord(c) < 32 for c in value):
    sys.exit("Expected a nonempty single-line secret without whitespace.")
sys.stdout.write(value)'
}

database_url=$(get_secret "$1")
session_secret=$(get_secret "$2")

if [[ ! "$database_url" =~ ^postgres(ql)?:// || "$database_url" == *\$* || "$database_url" == *\"* || "$database_url" == *\'* || "$database_url" == *\\* || "$database_url" == *\#* ]]; then
  echo "DATABASE_URL must be a PostgreSQL URL with credentials percent-encoded." >&2
  exit 1
fi

if [[ ! "$session_secret" =~ ^[A-Za-z0-9_-]{96}$ ]]; then
  echo "SESSION_SECRET must be a 96-character Base64URL string. See README.md." >&2
  exit 1
fi

tmp=$(mktemp .env.app.XXXXXX)
trap 'rm -f -- "$tmp"' EXIT
printf 'DATABASE_URL=%s\nSESSION_SECRET=%s\n' "$database_url" "$session_secret" > "$tmp"
mv -fT -- "$tmp" .env.app
echo "Runtime secrets refreshed."
