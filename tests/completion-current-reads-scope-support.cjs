const assert=require('node:assert/strict');
const pairs=[
  [
    "function plan_events_strict_assignment(PDO $pdo, array $assignment, bool $lock = false): bool",
    "function plan_events_strict_assignment(PDO $pdo, array $assignment): bool"
  ],
  [
    "WHERE context_id=0 AND operation_id=?'.($lock?' FOR UPDATE':''));",
    "WHERE context_id=0 AND operation_id=?');"
  ],
  [
    "function plan_events_read(PDO $pdo, int $contextId, array $assignment, bool $lock = false): array",
    "function plan_events_read(PDO $pdo, int $contextId, array $assignment): array"
  ],
  [
    "    if ($lock && !$pdo->inTransaction()) throw new RuntimeException('قراءة مصدر التعديل تتطلب معاملة الحفظ نفسها');\n",
    ""
  ],
  [
    "plan_events_strict_assignment($pdo, $assignment, $lock);",
    "plan_events_strict_assignment($pdo, $assignment);"
  ],
  [
    "') ORDER BY segment_index, task_type, id'.($lock?' FOR UPDATE':''));",
    "') ORDER BY segment_index, task_type, id');"
  ],
  [
    "ORDER BY h.segment_index,h.task_type'.($lock?' FOR UPDATE':''));",
    "ORDER BY h.segment_index,h.task_type');"
  ],
  [
    "function plan_events_segments(PDO $pdo, array $assignment, bool $lock = false): array",
    "function plan_events_segments(PDO $pdo, array $assignment): array"
  ],
  [
    "ORDER BY segment_index'.($lock?' FOR UPDATE':''));",
    "ORDER BY segment_index');"
  ],
  [
    "function plan_events_hifz_counts(PDO $pdo, int $contextId, array $assignment, bool $lock = false): array",
    "function plan_events_hifz_counts(PDO $pdo, int $contextId, array $assignment): array"
  ],
  [
    "plan_events_segments($pdo, $assignment, $lock);",
    "plan_events_segments($pdo, $assignment);"
  ],
  [
    "plan_events_read($pdo, $contextId, $assignment, $lock) as $envelope)",
    "plan_events_read($pdo, $contextId, $assignment) as $envelope)"
  ],
  [
    "$all = plan_events_segments($pdo,$assignment,true);$rows = array_column(plan_events_read($pdo,$contextId,$assignment,true),'completion');",
    "$all = plan_events_segments($pdo,$assignment);$rows = array_column(plan_events_read($pdo,$contextId,$assignment),'completion');"
  ],
  [
    "$segments=plan_events_segments($pdo,$assignment,true);",
    "$segments=plan_events_segments($pdo,$assignment);"
  ],
  [
    "task_type=? FOR UPDATE');$query->execute([$legacy,",
    "task_type=?');$query->execute([$legacy,"
  ],
  [
    "plan_events_segments($pdo,$assignment,true),true))",
    "plan_events_segments($pdo,$assignment),true))"
  ],
  [
    "plan_events_read($pdo,$contextId,$assignment,true) as $envelope)",
    "plan_events_read($pdo,$contextId,$assignment) as $envelope)"
  ],
  [
    "plan_events_hifz_counts($pdo, $cid, $current, true);",
    "plan_events_hifz_counts($pdo, $cid, $current);"
  ],
  [
    "plan_events_hifz_counts($pdo, $cid, $assignment + ['student_id' => $studentId], true);",
    "plan_events_hifz_counts($pdo, $cid, $assignment + ['student_id' => $studentId]);"
  ]
];
function withoutCompletionCurrentReads(code){for(const [from,to] of pairs){if(!code.includes(from))continue;assert.equal(code.split(from).length,2,'only exact current-read hooks may be normalized');code=code.replace(from,to);}return code;}
module.exports={withoutCompletionCurrentReads,pairs};
