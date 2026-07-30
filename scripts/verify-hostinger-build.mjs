/**
 * Fail CI/local build if the old VITE_API_URL guard is still bundled.
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const clientDir = join(process.cwd(), "dist", "client");
const forbidden = ["VITE_API_URL is not configured"];
const required = ["/api/r.php"];

async function walkJs(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkJs(full)));
    } else if (/\.(js|mjs)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

const files = await walkJs(clientDir);
let body = "";
for (const file of files) {
  body += await readFile(file, "utf8");
}

for (const phrase of forbidden) {
  if (body.includes(phrase)) {
    console.error(`Hostinger build check failed: bundle still contains "${phrase}"`);
    process.exit(1);
  }
}

for (const phrase of required) {
  if (!body.includes(phrase)) {
    console.error(`Hostinger build check failed: bundle missing "${phrase}"`);
    process.exit(1);
  }
}

console.log("Hostinger build OK — uses same-origin /api/r.php");
