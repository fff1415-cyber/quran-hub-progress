/**
 * Generate VAPID keys for Web Push and print config.php lines.
 * Usage: node scripts/generate-vapid-keys.mjs
 */
import { generateKeyPairSync } from "node:crypto";

function base64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pubDer = publicKey.export({ type: "spki", format: "der" });
const privDer = privateKey.export({ type: "pkcs8", format: "der" });

// web-push expects raw uncompressed public (65 bytes) and 32-byte private scalar
const pubRaw = pubDer.subarray(pubDer.length - 65);
const privRaw = privDer.subarray(privDer.length - 32);

console.log("Add to api/config.php:\n");
console.log(`define('VAPID_PUBLIC_KEY', '${base64url(pubRaw)}');`);
console.log(`define('VAPID_PRIVATE_KEY', '${base64url(privRaw)}');`);
console.log("define('VAPID_SUBJECT', 'mailto:admin@msht.io');");
