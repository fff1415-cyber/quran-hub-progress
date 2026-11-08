const assert = require("node:assert/strict");
const { load, storage, jsx, hooks, text } = require("./independent-test-support.cjs");
const { GradeOutbox } = load("src/lib/grade-outbox.ts", {});
const input = { PassFail: "PassFail", HifzTaskInput: "HifzTaskInput" };
const { PlanAwareTaskCell } = load("src/components/plans/PlanAwareTaskCell.tsx", {
  "react/jsx-runtime": jsx, "@/components/plans/TeacherGradeInputs": input,
  "@/lib/mock-data": { isHifzChecked: Boolean },
});
const calendar_context = { known: true, active_semester_id: "fixture" };
const data = storage();
const persistent = { ...data, get length() { return data.data.size; }, key: i => [...data.data.keys()][i] };
const path = (field, day = "sun") => ["synthetic-student", "10", "days", day, field];
const planRequired = "هذه الدرجة مرتبطة بخطة؛ يلزم تسجيل الدرجة والإنجاز معًا، ولم يُحفظ جزء منفرد";

(async () => {
  for (const [cid, role] of [[7, "teacher"], [19, "assistant"]]) {
    const box = new GradeOutbox(persistent, JSON.stringify([cid, role]), () => "synthetic-" + cid + "-" + box.drafts().length);
    const snapshot = value => box.accept({ protocol: 1, context_complex_id: cid, calendar_context, versions: {}, value });
    snapshot({});
    assert.equal(box.drafts().length, 0);
    const days = Object.fromEntries(["sun", "mon", "tue", "wed", "thu"].map(d => [d, { attendance: "", hifz: "", compensationFaces: 0 }]));
    days.sun.hifz = "one";
    const effect = { student_id: "synthetic-student", expected_assignment_id: "assignment-" + cid,
      task_type: "hifz", action: "record", tap: "one", completed_at: "2026-11-08", cell_path: path("hifz") };
    box.edit({}, { "synthetic-student": { 10: { days, compensationFaces: 0, compensationMurajaFaces: 0 } } }, effect);
    assert.deepEqual(box.drafts()[0].packet.changes.map(c => c.path), [path("hifz")]);
    assert.equal(box.drafts()[0].packet.plan.expected_assignment_id, "assignment-" + cid);
    const saved = { "synthetic-student": { 10: { days: { sun: { hifz: "one", rabt: "pass", compensationFaces: 1 } } } } };
    await box.flush(async packet => ({ ok: true, operation_id: packet.operation_id, input_sha256: "a".repeat(64) }));
    snapshot(saved);
    const changed = structuredClone(saved);
    changed["synthetic-student"][10].days.sun.compensationFaces = 0;
    const comp = { ...effect, action: "compensation", cell_path: path("compensationFaces") };
    box.edit(saved, changed, comp);
    assert.equal(box.drafts().at(-1).packet.changes[0].next.value, 0, "a real removal is preserved");
    await box.flush(async packet => ({ ok: true, operation_id: packet.operation_id, input_sha256: "a".repeat(64) }));
    snapshot(changed);

    const original = { packet: { operation_id: "old-" + cid, calendar_context, changes: [
      { path: path("rabt"), base: { present: true, value: "pass" }, next: { present: true, value: "" } },
      { path: path("compensationFaces", "tue"), base: { present: false }, next: { present: true, value: 0 } },
    ] }, order: 3, dependencies: [], status: "conflict", message: planRequired };
    const id = original.packet.operation_id;
    persistent.setItem(box.prefix + "operation:" + id, JSON.stringify(original));
    const h = hooks();
    const { GradeSaveStatus } = load("src/components/GradeSaveStatus.tsx", {
      react: h.react, "react/jsx-runtime": jsx, "@/lib/mock-data": { loadStudents: () => [] },
      "@/lib/grade-sync": { currentGradeOutbox: () => box, gradeLocalSaveError: () => "" },
    });
    const ui = text(h.render(() => GradeSaveStatus()));
    assert.match(ui, /لم يؤكد الخادم حفظها/);
    assert.doesNotMatch(ui, /اعتماد مسودتي بعد المقارنة|compensationFaces/);
    assert.deepEqual(box.reviewChanges(id).map(c => c.path), [path("rabt")]);
    assert.throws(() => box.resolve(id, true), /مرتبطة بخطة/);
    assert.deepEqual(box.drafts().at(-1), original);
    box.resolve(id, false);
    assert.equal(box.view({})["synthetic-student"][10].days.sun.rabt, "pass");
    assert.deepEqual(box.drafts().at(-1).packet, original.packet, "the original local packet survives choosing the server value");
    for (const task of ["rabt", "muraja"]) for (const next of ["", "fail"]) {
      const calls = [];
      const view = PlanAwareTaskCell({ task, student: { levelType: "gold" }, hasPlan: true,
        passFailValue: "pass", onPassFailChange: v => calls.push(["grade-only", v]),
        onPlanPassFailChange: v => calls.push(["atomic", v]) });
      view.props.onChange(next);
      assert.deepEqual(calls, [["atomic", next]]);
    }
  }
  console.log("PASS: plan edits and reversals, old draft review, real zero edits and isolated tenant scopes");
})().catch(error => { console.error(error); process.exitCode = 1; });
