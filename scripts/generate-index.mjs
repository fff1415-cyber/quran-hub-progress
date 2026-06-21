import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const clientDir = join(process.cwd(), "dist", "client");
const serverPath = pathToFileURL(join(process.cwd(), "dist", "server", "server.js")).href;

const { default: server } = await import(serverPath);
const response = await server.fetch(new Request("http://localhost/"));

if (!response.ok) {
  console.error(`SSR prerender failed: HTTP ${response.status}`);
  process.exit(1);
}

const html = await response.text();
await writeFile(join(clientDir, "index.html"), html, "utf8");
console.log(`Generated dist/client/index.html via SSR (${html.length} bytes)`);
