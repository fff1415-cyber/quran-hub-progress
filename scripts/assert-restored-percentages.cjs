const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve("candidate");
const ts = require(path.join(root, "node_modules/typescript"));
const cache = new Map();
function load(name) {
  if (name.endsWith("grade-sync")) return { gradeView: (value) => value };
  if (name.endsWith("auth-session")) return { hasAuthToken: () => false };
  const file = path.join(root, "src/lib", name.split("/").at(-1) + ".ts");
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "exports", code)(load, exports);
  return exports;
}
const sampleLine = fs.readFileSync(process.argv[2], "utf8").split("\n").find(line => line.startsWith("PERCENTAGE_SAMPLE "));
assert.ok(sampleLine, "read-only restored sample was unavailable");
const sample = JSON.parse(sampleLine.slice("PERCENTAGE_SAMPLE ".length));
const store = { fixture: { [sample.week]: { days: sample.days } } };
const result = load("semester-grading").studentWeekOverallPercentage("fixture", false, store, sample.week, "gold",
  { semester: sample.semester, operationalDate: sample.end });
assert.equal(result, sample.expected);
console.log("PASS: calculation matches independent result from the restored database");
