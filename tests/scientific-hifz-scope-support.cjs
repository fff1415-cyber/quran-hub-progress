const assert = require('node:assert/strict');
const helper = 'function isRecordedScientificHifz(value: unknown): boolean {\n  return value === "half" || value === "one" || value === "two";\n}\n\n';
const guard = '  // Incomplete/corrupt prep is not an instruction to recalculate or erase a stored score.\n  // The explicit empty value still follows the existing user-clear behavior.\n  if (field === "hifz" && entry.hifz !== "" && !isRecordedScientificHifz(entry.hifz)) {\n    return false;\n  }\n';
function withoutScientificHifzGuard(code) {
  if (!code.includes(helper)) return code;
  for (const [from, to] of [
    [helper, ''],
    ['return isRecordedScientificHifz(entry.hifz) ? (config.defaultScores.hifz?.trim() ?? "") : "";', 'return entry.hifz !== "" ? (config.defaultScores.hifz?.trim() ?? "") : "";'],
    ['if ("hifz" in patch && (patch.hifz === "" || isRecordedScientificHifz(patch.hifz))) {', 'if ("hifz" in patch) {'],
    [guard, ''],
  ]) {
    assert.equal(code.split(from).length, 2, 'only the exact tested hifz guard may be normalized');
    code = code.replace(from, to);
  }
  return code;
}
module.exports = { withoutScientificHifzGuard };
