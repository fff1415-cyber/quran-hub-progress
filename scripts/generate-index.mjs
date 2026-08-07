import { writeFile, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const clientDir = join(process.cwd(), "dist", "client");
const publicDir = join(process.cwd(), "public");
const serverPath = pathToFileURL(join(process.cwd(), "dist", "server", "server.js")).href;

const { default: server } = await import(serverPath);
const response = await server.fetch(new Request("http://localhost/"));

if (!response.ok) {
  console.error(`SSR prerender failed: HTTP ${response.status}`);
  process.exit(1);
}

let html = await response.text();
// Strip SSR router hydration — same index.html serves /, /5645, /5645/manager (SPA).
// Keeping $_TSR state from "/" breaks deep links (Invariant failed).
html = html.replace(/<script class="\$tsr"[\s\S]*?<\/script>/, "");
html = html.replace(/<!--\$-->[\s\S]*?<!--\/\$-->/, '<div id="root"></div>');
await writeFile(join(clientDir, "index.html"), html, "utf8");

try {
  await copyFile(join(publicDir, ".htaccess"), join(clientDir, ".htaccess"));
  console.log("Copied public/.htaccess → dist/client/.htaccess");
} catch (e) {
  console.warn("Could not copy .htaccess:", e);
}

console.log(`Generated dist/client/index.html via SSR (${html.length} bytes)`);
