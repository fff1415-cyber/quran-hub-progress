/**
 * Prepare Hostinger deploy bundles after `npm run build`.
 *
 * Hostinger often creates SEPARATE document roots for subdomains, e.g.:
 *   /home/USER/domains/m1.msht.io/public_html/default.php
 * Those folders do NOT inherit public_html/.htaccess from the main domain.
 *
 * This script mirrors dist/client/ into dist/hostinger-subdomains/{m1,m2,...}
 * Upload each mirror to that subdomain's public_html (and delete default.php).
 *
 * Usage:
 *   node scripts/prepare-hostinger-deploy.mjs
 *   HOSTINGER_SUBDOMAINS=m1,m2,m3 node scripts/prepare-hostinger-deploy.mjs
 */

import { access, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const clientDir = join(root, "dist", "client");
const outBase = join(root, "dist", "hostinger-subdomains");

const subdomains = (process.env.HOSTINGER_SUBDOMAINS ?? "m1,m2")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const instructions = `# Hostinger subdomain deploy packs

Generated: ${new Date().toISOString()}

## Why m1.msht.io shows default.php

Hostinger creates a **separate folder** per subdomain (with default.php).
The main site .htaccess in msht.io/public_html does NOT apply there.

## Fix (choose one)

### Option A — Recommended (one docroot for all)

hPanel → Domains → Subdomains → edit m1 / m2:
  Document root = **same as msht.io** → public_html
  (e.g. /home/USER/domains/msht.io/public_html)

Then upload ONLY dist/client/ to public_html once.
Delete any default.php in subdomain folders.

### Option B — Mirror SPA into each subdomain folder

Upload contents of each pack below to that subdomain's public_html:

${subdomains.map((s) => `- dist/hostinger-subdomains/${s}/  →  /domains/${s}.msht.io/public_html/`).join("\n")}

After upload, **delete default.php** in each subdomain folder.

API uses same-origin /api on each host (msht.io, m1.msht.io, …). VITE_API_URL is optional.

## SFTP sync (SSH port 65002)

Replace USER with your Hostinger username (e.g. u112851217):

\`\`\`bash
# Main site
rsync -avz --delete -e "ssh -p 65002" dist/client/ USER@SERVER_IP:/home/USER/domains/msht.io/public_html/

${subdomains.map((s) => `rsync -avz --delete -e "ssh -p 65002" dist/hostinger-subdomains/${s}/ USER@SERVER_IP:/home/USER/domains/${s}.msht.io/public_html/`).join("\n")}
\`\`\`

Or run: bash scripts/sync-hostinger-subdomains.sh USER@SERVER_IP
`;

async function main() {
  try {
    await access(join(clientDir, "index.html"));
  } catch {
    console.error("Run npm run build first — dist/client/index.html missing");
    process.exit(1);
  }

  await rm(outBase, { recursive: true, force: true });
  await mkdir(outBase, { recursive: true });

  for (const sub of subdomains) {
    const dest = join(outBase, sub);
    await cp(clientDir, dest, { recursive: true });
    console.log(`Pack: dist/hostinger-subdomains/${sub}/`);
  }

  await writeFile(join(root, "dist", "HOSTINGER-SUBDOMAINS.txt"), instructions, "utf8");
  console.log("\nWrote dist/HOSTINGER-SUBDOMAINS.txt");
  console.log(`Subdomain packs: ${subdomains.join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
