const assert = require("node:assert/strict");
const { load, storage, jsx, hooks, text, find, deferred, flush } = require("./independent-test-support.cjs");
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
    const request = deferred();
    let reads = 0, writes = 0;
    const sync = { currentGradeOutbox: () => box, gradeLocalSaveError: () => "",
      refreshConfirmedGrades: () => { reads++; return request.promise; },
      flushConfirmedGrades: () => { writes++; },
    };
    const { GradeSaveStatus } = load("src/components/GradeSaveStatus.tsx", {
      react: h.react, "react/jsx-runtime": jsx, "@/lib/mock-data": { loadStudents: () => [] },
      "@/lib/grade-sync": sync,
    });
    const render = () => h.render(GradeSaveStatus);
    const reviewButton = () => find(render(), el => el.type === "button" && Object.hasOwn(el.props, "aria-expanded"))[0];
    assert.equal(reviewButton().props["aria-expanded"], false);
    assert.doesNotMatch(text(render()), /مسودتك:|تحديث القيم للمقارنة/);
    reviewButton().props.onClick();
    const refreshButton = () => find(render(), el => el.type === "button" && /تحديث القيم للمقارنة/.test(text(el)))[0];
    const ui = text(render());
    assert.match(ui, /لم يؤكد الخادم حفظها/);
    assert.match(ui, /الأسبوع 10 · الأحد · الربط — مسودتك: فارغ، المحفوظ: مجتاز/);
    assert.doesNotMatch(ui, /اعتماد مسودتي بعد المقارنة|compensationFaces/);
    const firstClick = refreshButton().props.onClick;
    firstClick();
    firstClick();
    assert.equal(reads, 1);
    assert.equal(refreshButton().props.disabled, true);
    assert.match(text(render()), /جارٍ تحديث القيم/);
    request.resolve();
    await flush();
    assert.match(text(render()), /تم التحقق من القيم المحفوظة/);
    assert.equal(refreshButton().props.disabled, false);
    sync.refreshConfirmedGrades = async () => { throw Error("انتهت مهلة القراءة"); };
    refreshButton().props.onClick();
    await flush();
    assert.match(text(render()), /تعذّر تحديث القيم للمقارنة؛ بقيت المسودات كما هي/);
    assert.equal(writes, 0);
    reviewButton().props.onClick();
    assert.doesNotMatch(text(render()), /مسودتك:/);
    assert.deepEqual(box.drafts().at(-1), original);
    assert.deepEqual(box.reviewChanges(id).map(c => c.path), [path("rabt")]);
    assert.throws(() => box.resolve(id, true), /مرتبطة بخطة/);
    assert.deepEqual(box.drafts().at(-1), original);
    box.resolve(id, false);
    assert.equal(box.view({})["synthetic-student"][10].days.sun.rabt, "pass");
    assert.deepEqual(box.drafts().at(-1).packet, original.packet, "the original local packet survives choosing the server value");
    const attendanceId = "old-attendance-" + cid;
    const attendanceDraft = { ...original, packet: { ...original.packet, operation_id: attendanceId, changes: [
      { path: path("attendance"), base: { present: false }, next: { present: true, value: "present" } },
      original.packet.changes[1],
    ] }, order: 4 };
    persistent.setItem(box.prefix + "operation:" + attendanceId, JSON.stringify(attendanceDraft));
    assert.equal(box.reviewRequiresPlan(attendanceId), false, "the rejection was caused by a placeholder only");
    box.resolve(attendanceId, true);
    assert.deepEqual(box.drafts().at(-1).packet.changes.map(c => c.path), [path("attendance")]);
    assert.deepEqual(box.drafts().find(d => d.packet.operation_id === attendanceId).packet, attendanceDraft.packet);
    const legacyEmpty = { path: path("hifz", "mon"), base: { present: false }, next: { present: true, value: "" } };
    const addDraft = (suffix, changes, status = "conflict", extra = {}) => {
      const id = cid + "-" + suffix;
      const packet = { operation_id: id, calendar_context, changes, ...extra };
      persistent.setItem(box.prefix + "operation:" + id, JSON.stringify({ packet, order: 8, dependencies: [], status }));
      return id;
    };
    const empty = addDraft("empty", [legacyEmpty, original.packet.changes[1]]);
    const realClear = addDraft("clear", [original.packet.changes[0]]);
    const knownPlan = addDraft("plan", [legacyEmpty], "conflict", { plan: effect });
    const uncertainReceipt = addDraft("pending", [legacyEmpty], "pending");
    const priorSemester = addDraft("prior-semester", [legacyEmpty], "conflict", {
      calendar_context: { known: true, active_semester_id: "previous" },
    });
    snapshot(changed);
    const byId = id => box.drafts().find(d => d.packet.operation_id === id);
    assert.equal(byId(empty).status, "reconciled");
    assert.deepEqual(byId(empty).packet.changes[0], legacyEmpty);
    assert.equal(byId(realClear).status, "archived");
    assert.deepEqual(byId(realClear).packet.changes, [original.packet.changes[0]]);
    assert.equal(box.view({})["synthetic-student"][10].days.sun.rabt, "pass");
    for (const id of [knownPlan, priorSemester]) assert.equal(byId(id).status, "conflict");
    assert.equal(byId(uncertainReceipt).status, "pending");
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
