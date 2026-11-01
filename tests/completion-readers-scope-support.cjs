const assert = require('node:assert/strict');
function withoutCompletionReaderHooks(code) {
  const sheet = "            'completions' => plan_events_sheet_rows($pdo, $cid, $assignment, $compStmt->fetchAll()),";
  if (!code.includes(sheet)) return code;
  for (const [from, to] of [
    [sheet, "            'completions' => array_map('completion_row', $compStmt->fetchAll()),"],
    ['            if (plan_events_tables_ready($pdo)) $counts = plan_events_hifz_counts($pdo, $cid, $current);\n', ''],
    ["        if (plan_events_tables_ready($pdo)) $counts = plan_events_hifz_counts($pdo, $cid, $assignment + ['student_id' => $studentId]);\n", ''],
  ]) {
    assert.equal(code.split(from).length, 2, 'only the exact reader/count hooks may be normalized');
    code = code.replace(from, to);
  }
  return code;
}
module.exports = { withoutCompletionReaderHooks };
