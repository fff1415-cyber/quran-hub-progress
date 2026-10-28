// Offline inventory only. No database connection, network, binding or source-file writes.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const kinds = new Set(["segment_completions", "grades", "weekly_tests", "scientific_grades"]);
const digest = value => createHash("sha256").update(value).digest("hex");

export function createLegacyReviewManifest(raw, kind) {
  if (!kinds.has(kind)) throw new Error("Unsupported source kind");
  const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  const records = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!Array.isArray(records)) throw new Error("Expected an unchanged JSON array exported from the source");
  return {
    version: 1,
    kind,
    sourceSha256: digest(bytes),
    rowCount: records.length,
    records: records.map((record, ordinal) => ({ ordinal, valueSha256: digest(JSON.stringify(record)), state: "unresolved" })),
  };
}

export function verifyLegacyReviewManifest(raw, manifest) {
  if (manifest?.version !== 1) return false;
  const expected = createLegacyReviewManifest(raw, manifest.kind);
  return expected.sourceSha256 === manifest.sourceSha256 && expected.rowCount === manifest.rowCount
    && Array.isArray(manifest.records) && expected.records.length === manifest.records.length
    && expected.records.every((row, index) => row.ordinal === manifest.records[index]?.ordinal
      && row.valueSha256 === manifest.records[index]?.valueSha256 && manifest.records[index]?.state === "unresolved");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [mode, arg, source] = process.argv.slice(2);
  if (mode === "inventory" && arg && source) {
    console.log(JSON.stringify(createLegacyReviewManifest(await readFile(source), arg), null, 2));
  } else if (mode === "verify" && arg && source) {
    const ok = verifyLegacyReviewManifest(await readFile(source), JSON.parse(await readFile(arg, "utf8")));
    if (!ok) throw new Error("The source/manifest changed; do not apply any review decisions");
    console.log("Unchanged source and complete unresolved inventory verified; no records bound or modified.");
  } else {
    throw new Error("Usage: inventory <kind> <source.json> | verify <manifest.json> <source.json>");
  }
}
