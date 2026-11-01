const assert = require('node:assert/strict');
function withoutCompletionEditData(code) {
  const start = code.indexOf('/** Explicit single-segment edit primitive'), end = code.indexOf('function plan_events_history(', start);
  if (start < 0) return code;
  assert.ok(end > start);
  code = code.slice(0, start) + code.slice(end);
  const kinds = "['completion_apply','completion_revoke','completion_set']";
  assert.equal(code.split(kinds).length, 2);
  return code.replace(kinds, "['completion_apply','completion_revoke']");
}
module.exports = { withoutCompletionEditData };
