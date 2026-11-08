const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { createServer } = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.QHP_PLAYWRIGHT);

const root = path.resolve("dist/client");
const server = createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const target = pathname.startsWith("/assets/") ? path.resolve(root, "." + pathname) : path.join(root, "index.html");
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target)) { res.writeHead(404).end(); return; }
  const types = { ".js": "application/javascript", ".css": "text/css", ".html": "text/html" };
  res.setHeader("Content-Type", types[path.extname(target)] || "application/octet-stream");
  fs.createReadStream(target).pipe(res);
});
const halaqat = Array.from({ length: 5 }, (_, i) => ({
  id: i + 1, name: "حلقة تجربة " + (i + 1), complex_id: 1, is_talqeen: i === 0 ? 1 : 0,
  teacher_name: "Fixture teacher", teacher_code: "synthetic", assistant_name: "Fixture assistant", assistant_code: "synthetic-assistant",
}));
const students = halaqat.map(h => ({ id: "fixture-" + h.id, halaqa_id: h.id, complex_id: 1, name: "طالب تجربة " + h.id, national_id: "", level: "1", level_type: "gold" }));
// 17 students with no saved record for the selected week: the old WeekTable
// attempts to enqueue more than 100 placeholder changes just by opening it.
const largeRoster = Array.from({ length: 17 }, (_, i) => ({
  ...students[1], id: i === 0 ? students[1].id : "fixture-large-" + i,
  name: i === 0 ? students[1].name : "طالب جديد " + i,
}));
const start = new Date();
start.setUTCHours(0,0,0,0);
start.setUTCDate(start.getUTCDate() - start.getUTCDay());
const end = new Date(start);
end.setUTCDate(end.getUTCDate() + 6);
const date = value => value.toISOString().slice(0,10);
const semester = { id: "test-semester", name: "فصل تجربة", start_date: date(start), weeks_count: 1, working_days: [0,1,2,3,4], excluded_dates: [], is_active: true };
const grades = Object.fromEntries(students.map(s => [s.id, { 1: { days: Object.fromEntries(
  ["sun", "mon", "tue", "wed", "thu"].map(day => [day, { attendance: day === "sun" ? "present" : "", hifz: day === "sun" ? "one" : "", rabt: "", muraja: "", wajib: false }]),
) } }]));
delete grades["fixture-2"];
const calendar = { known: true, active_semester_id: semester.id };
const receipts = new Map();
const scientific = { configs: Object.fromEntries(halaqat.slice(1, 4).map(h => [h.id, {
  visible: true, fields: { attendance: true, hifz: true, rabt: false, muraja: false },
}])), data: {} };
const bodyFor = route => {
  if (route === "/tenant-info") return { id: 1, name: "مجمع تجربة", subdomain: "mm", is_active: true };
  if (route === "/students") return [...students.filter(student => student.halaqa_id !== 2), ...largeRoster];
  if (route === "/halaqat") return halaqat;
  if (route === "/semesters/active") return { semester, weeks: [{ id: "wk", semester_id: semester.id, week_number: 1, start_date: date(start), end_date: date(end) }] };
  if (route === "/staff-tasks") return { items: [], actorId: "fixture", roster: [] };
  return [];
};
async function run() {
  await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1320, height: 900 } });
    await context.route("**/*", async intercepted => {
      const url = new URL(intercepted.request().url());
      if (url.origin !== base) { await intercepted.abort(); return; }
      if (url.pathname !== "/api/r.php") { await intercepted.continue(); return; }
      const route = url.searchParams.get("path");
      let data = bodyFor(route);
      if (route === "/plans/halaqa-status") {
        const id = Number(url.searchParams.get("halaqa_id"));
        data = { statuses: id === 1 ? [] : [{ student_id: "fixture-" + id, status: id === 5 ? "frozen" : "active", assignment_id: "plan-" + id }] };
      }
      if (route === "/app-state") {
        if (intercepted.request().method() === "POST") {
          const body = intercepted.request().postDataJSON();
          if (body.key !== "grades") { await intercepted.fulfill({ json: { ok: true } }); return; }
          assert.equal(body.grade_write_protocol, 1);
          const packet = body.value;
          const checksum = createHash("sha256").update(JSON.stringify(packet)).digest("hex");
          const replayed = receipts.has(packet.operation_id);
          if (!replayed) {
            for (const change of packet.changes) {
              assert.deepEqual(change.path, ["fixture-1", "1", "days", "sun", "attendance"]);
              assert.deepEqual(change.base, { present: true, value: "present" });
              assert.deepEqual(change.next, { present: true, value: "absent" });
              grades["fixture-1"][1].days.sun.attendance = change.next.value;
            }
            receipts.set(packet.operation_id, checksum);
          }
          assert.equal(receipts.get(packet.operation_id), checksum);
          data = { ok: true, operation_id: packet.operation_id, input_sha256: checksum, replayed };
        } else if (url.searchParams.get("grade_protocol") === "1") data = { protocol: 1, context_complex_id: 1, cursor: "fixture-" + receipts.size, value: grades, calendar_context: calendar, versions: {} };
        else if (!url.searchParams.has("key")) data = [{ key: "grades", value: [] }, { key: "scientific_grades", value: scientific }];
        else if (url.searchParams.get("key") === "scientific_grades") data = [{ key: "scientific_grades", value: scientific }];
      }
      await intercepted.fulfill({ json: data });
    });
    await context.addInitScript(() => {
      const token = btoa(JSON.stringify({ role:"manager", complexId:1, accountId:"fixture-manager", name:"Manager", exp:Date.now()+3600000 })) + ".fixture";
      localStorage.setItem("qs_token",token);
      localStorage.setItem("qs_role","manager");
      localStorage.setItem("qs_account","fixture-manager");
    });
    const page = await context.newPage();
    let errors = [];
    const record = error => {
      // Hostinger serves the prerendered home shell for deep URLs. React
      // recovers from this known hydration mismatch; still assert UI below.
      if (!error.includes("Minified React error #418")) errors.push(error);
    };
    page.on("pageerror", error => record(error.stack || error.message));
    page.on("console", msg => {
      if (msg.type() === "error" && /TypeError|ReferenceError|Minified React|Something went wrong/.test(msg.text())) record(msg.text());
    });
    await page.goto(base + "/mm/teacher?h=1");
    for (const group of halaqat) {
      errors = [];
      if (group.id !== 1) {
        await page.getByRole("button", { name: "القائمة", exact: true }).click();
        const selector = page.getByRole("button", { name: "إدارة الحلقات", exact: true });
        if (await selector.getAttribute("aria-expanded") === "false") await selector.click();
        await page.getByRole("link", { name: group.name, exact: true }).click();
      }
      try {
        await page.getByText(group.name, { exact: true }).first().waitFor({ timeout: 9000 });
        await page.getByText("طالب تجربة " + group.id, { exact: true }).first().waitFor({ timeout: 9000 });
        await page.waitForTimeout(450);
      } catch (error) {
        const message = await page.locator("body").innerText();
        throw new Error("Fixture halaqa " + group.id + " failed: " + errors.join("\n") + "\n" + message.slice(0,900), { cause: error });
      }
      assert.deepEqual(errors, [], "No uncaught errors in halaqa " + group.id);
      if (group.id === 2) await page.getByText("طالب جديد 16", { exact: true }).waitFor({ timeout: 9000 });
      const operationCount = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("qhp_grade_outbox_v1:") && key.includes(":operation:")).length);
      assert.equal(operationCount, group.id === 1 ? 0 : 1, "Opening a halaqa must not enqueue grade writes");
      if (group.id === 1) {
        const attendance = page.getByRole("row").filter({ hasText: "طالب تجربة 1" }).getByRole("combobox").first();
        await page.waitForFunction(() => Object.keys(localStorage).some(key => key.startsWith("qhp_grade_outbox_v1:") && key.endsWith(":snapshot")));
        assert.equal(await attendance.inputValue(), "present");
        await attendance.selectOption("absent");
        try { await page.getByText("أكد الخادم جميع عمليات تسجيل الدرجات المرسلة.").waitFor({ timeout: 10000 }); }
        catch (error) {
          console.error("Synthetic pending operations:", await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("qhp_grade_outbox_v1:") && key.includes(":operation:")).map(([,value]) => JSON.parse(value))));
          throw error;
        }
        assert.equal(receipts.size, 1);
        console.log("PASS: attendance edit used one atomic receipt before switching groups");
      }
      console.log("PASS: browser rendered roster and grades for halaqa", group.id);
    }
    await page.goto(base + "/mm/teacher?h=1");
    const attendance = page.getByRole("row").filter({ hasText: "طالب تجربة 1" }).getByRole("combobox").first();
    await attendance.waitFor({ timeout: 9000 });
    assert.equal(await attendance.inputValue(), "absent");
    assert.equal(receipts.size, 1);
    console.log("PASS: reopening the first halaqa shows the confirmed attendance without a duplicate write");
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
