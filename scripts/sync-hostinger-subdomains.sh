#!/usr/bin/env bash
# Sync SPA to msht.io + subdomain document roots on Hostinger (SFTP/SSH port 65002).
#
# Usage:
#   bash scripts/sync-hostinger-subdomains.sh USER@SERVER_IP
#
# Prerequisites:
#   npm run build:hostinger   (or npm run build && node scripts/prepare-hostinger-deploy.mjs)
#   SSH access enabled in hPanel
#
# Optional env:
#   HOSTINGER_SUBDOMAINS=m1,m2
#   HOSTINGER_USER=u112851217
#   HOSTINGER_MAIN_DIR=/home/u112851217/domains/msht.io/public_html/

set -euo pipefail

SSH_TARGET="${1:-}"
if [ -z "$SSH_TARGET" ]; then
  echo "Usage: bash scripts/sync-hostinger-subdomains.sh USER@SERVER_IP"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLIENT="$ROOT/dist/client"
SUB_BASE="$ROOT/dist/hostinger-subdomains"
SSH_OPTS=(-p 65002 -o ConnectTimeout=90 -o StrictHostKeyChecking=no)

SUBDOMAINS="${HOSTINGER_SUBDOMAINS:-m1,m2}"
IFS=',' read -ra SUBS <<< "$SUBDOMAINS"

USER="${HOSTINGER_USER:-${SSH_TARGET%%@*}}"
MAIN_DIR="${HOSTINGER_MAIN_DIR:-/home/${USER}/domains/msht.io/public_html/}"

if [ ! -f "$CLIENT/index.html" ]; then
  echo "Missing $CLIENT/index.html — run: npm run build:hostinger"
  exit 1
fi

RSYNC=(rsync -avz --delete -e "ssh ${SSH_OPTS[*]}")

echo "→ Main site: $MAIN_DIR"
"${RSYNC[@]}" "$CLIENT/" "${SSH_TARGET}:${MAIN_DIR}"

for sub in "${SUBS[@]}"; do
  sub="$(echo "$sub" | tr -d ' ')"
  [ -z "$sub" ] && continue
  PACK="$SUB_BASE/$sub"
  REMOTE="/home/${USER}/domains/${sub}.msht.io/public_html/"
  if [ ! -d "$PACK" ]; then
    echo "Skip $sub (no pack at $PACK — run prepare-hostinger-deploy.mjs)"
    continue
  fi
  echo "→ Subdomain $sub: $REMOTE"
  "${RSYNC[@]}" "$PACK/" "${SSH_TARGET}:${REMOTE}"
  echo "   Delete default.php in File Manager if it still appears."
done

echo "Done."
