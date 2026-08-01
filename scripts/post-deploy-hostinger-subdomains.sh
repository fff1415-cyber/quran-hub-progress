#!/usr/bin/env bash
# Remove Hostinger placeholder pages after subdomain deploy (prevents ERR_HTTP2 / default.php issues).
#
# Usage (GitHub Actions or local):
#   FTP_PASSWORD=... bash scripts/post-deploy-hostinger-subdomains.sh USER SERVER_IP
#
# Optional: HOSTINGER_SUBDOMAINS=m1,m2

set -euo pipefail

SSH_USER="${1:-}"
SERVER="${2:-}"
if [ -z "$SSH_USER" ] || [ -z "$SERVER" ]; then
  echo "Usage: FTP_PASSWORD=... bash scripts/post-deploy-hostinger-subdomains.sh SSH_USER SERVER_IP"
  exit 1
fi

if [ -z "${FTP_PASSWORD:-}" ]; then
  echo "FTP_PASSWORD env var required"
  exit 1
fi

SUBDOMAINS="${HOSTINGER_SUBDOMAINS:-m1,m2}"
IFS=',' read -ra SUBS <<< "$SUBDOMAINS"

PATHS=()
for sub in "${SUBS[@]}"; do
  sub="$(echo "$sub" | tr -d ' ')"
  [ -z "$sub" ] && continue
  PATHS+=("/home/${SSH_USER}/domains/${sub}.msht.io/public_html/default.php")
done

if [ ${#PATHS[@]} -eq 0 ]; then
  echo "No subdomain paths configured"
  exit 0
fi

SSH_OPTS=(-p 65002 -o ConnectTimeout=90 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null)

echo "Removing default.php from subdomain folders (if present)..."
sshpass -p "$FTP_PASSWORD" ssh "${SSH_OPTS[@]}" "${SSH_USER}@${SERVER}" \
  "rm -f ${PATHS[*]} && echo 'OK: default.php removed or already absent'"
