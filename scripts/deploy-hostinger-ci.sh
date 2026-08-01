#!/usr/bin/env bash
# Rsync deploy to Hostinger via SSH port 65002 (GitHub Actions fallback when SFTP action fails).
#
# Usage:
#   FTP_PASSWORD=... bash scripts/deploy-hostinger-ci.sh USER SERVER LOCAL/ REMOTE/ [attempts]
#
# LOCAL and REMOTE must end with / for directory sync.

set -euo pipefail

SSH_USER="${1:-}"
SERVER="${2:-}"
LOCAL="${3:-}"
REMOTE="${4:-}"
MAX_ATTEMPTS="${5:-3}"

if [ -z "$SSH_USER" ] || [ -z "$SERVER" ] || [ -z "$LOCAL" ] || [ -z "$REMOTE" ]; then
  echo "Usage: FTP_PASSWORD=... bash scripts/deploy-hostinger-ci.sh USER SERVER LOCAL/ REMOTE/ [attempts]"
  exit 1
fi

if [ -z "${FTP_PASSWORD:-}" ]; then
  echo "FTP_PASSWORD env var required"
  exit 1
fi

if [ ! -e "$LOCAL" ]; then
  echo "Local path missing: $LOCAL"
  exit 1
fi

export SSHPASS="$FTP_PASSWORD"
SSH_OPTS=(-p 65002 -o ConnectTimeout=90 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ServerAliveInterval=30)
RSYNC_SSH=(sshpass -e ssh "${SSH_OPTS[@]}")

attempt=1
while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
  echo "Rsync attempt ${attempt}/${MAX_ATTEMPTS}: ${LOCAL} → ${SSH_USER}@${SERVER}:${REMOTE}"
  if rsync -avz --delete -e "${RSYNC_SSH[*]}" "$LOCAL" "${SSH_USER}@${SERVER}:${REMOTE}"; then
    echo "Rsync deploy OK"
    exit 0
  fi
  echo "Rsync attempt ${attempt} failed"
  attempt=$((attempt + 1))
  if [ "$attempt" -le "$MAX_ATTEMPTS" ]; then
    sleep 45
  fi
done

echo "Rsync deploy failed after ${MAX_ATTEMPTS} attempts"
exit 1
