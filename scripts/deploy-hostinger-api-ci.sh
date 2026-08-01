#!/usr/bin/env bash
# Rsync api/ to Hostinger, excluding config.php (GitHub Actions fallback).

set -euo pipefail

SSH_USER="${1:-}"
SERVER="${2:-}"
REMOTE="${3:-}"
MAX_ATTEMPTS="${4:-3}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL="${ROOT}/api/"

if [ -z "$SSH_USER" ] || [ -z "$SERVER" ] || [ -z "$REMOTE" ]; then
  echo "Usage: FTP_PASSWORD=... bash scripts/deploy-hostinger-api-ci.sh USER SERVER REMOTE/ [attempts]"
  exit 1
fi

if [ -z "${FTP_PASSWORD:-}" ]; then
  echo "FTP_PASSWORD env var required"
  exit 1
fi

export SSHPASS="$FTP_PASSWORD"
SSH_OPTS=(-p 65002 -o ConnectTimeout=90 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ServerAliveInterval=30)
RSYNC_SSH=(sshpass -e ssh "${SSH_OPTS[@]}")

attempt=1
while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
  echo "API rsync attempt ${attempt}/${MAX_ATTEMPTS} → ${SSH_USER}@${SERVER}:${REMOTE}"
  if rsync -avz --delete --exclude=config.php -e "${RSYNC_SSH[*]}" "$LOCAL" "${SSH_USER}@${SERVER}:${REMOTE}"; then
    echo "API rsync OK"
    exit 0
  fi
  attempt=$((attempt + 1))
  if [ "$attempt" -le "$MAX_ATTEMPTS" ]; then
    sleep 45
  fi
done

exit 1
