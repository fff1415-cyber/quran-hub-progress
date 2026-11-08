const assert = require("node:assert/strict");
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
const start = new Date();
start.setUTCHours(0,0,0,0);
start.setUTCDate(start.getUTCDate() - start.getUTCDay());
const end = new Date(start);
end.setUTCDate(end.getUTCDate() + 6);
const date = value => value.toISOString().slice(0,10);
const semester = { id: "test-semester", name: "فصل تجربة", start_date: date(start), weeks_count: 1, working_days: [0,1,2,3,4], excluded_dates: [], is_active: true };
const grades = Object.fromEntries(students.map(s => [s.id, { 1: { days: { sun: { attendance: "present", hifz: "one", rabt: "", muraja: "" } } } }]));
const calendar = { known: true, active_semester_id: semester.id };
const bodyFor = route => {
  if (route === "/tenant-info") return { id: 1, name: "مجمع تجربة", subdomain: "mm", is_active: true };
  if (route === "/students") return students;
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
      if (route === "/app-state") {
        if (url.searchParams.get("grade_protocol") === "1") data = { protocol: 1, context_complex_id: 1, cursor: "fixture", value: grades, calendar_context: calendar, versions: {} };
        else if (!url.searchParams.has("key")) data = [{ key: "grades", value: [] }];
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
    page.on("pageerror", error => errors.push(error.stack || error.message));
    page.on("console", msg => {
      if (msg.type() === "error" && /TypeError|ReferenceError|Minified React|Something went wrong/.test(msg.text())) errors.push(msg.text());
    });
    for (const group of halaqat) {
      errors = [];
      await page.goto(base + "/mm/teacher?h=" + group.id);
      try {
        await page.getByText(group.name, { exact: true }).first().waitFor({ timeout: 9000 });
        await page.getByText("طالب تجربة " + group.id, { exact: true }).first().waitFor({ timeout: 9000 });
      } catch (error) {
        const message = await page.locator("body").innerText();
        throw new Error("Fixture halaqa " + group.id + " failed: " + errors.join("\n") + "\n" + message.slice(0,900), { cause: error });
      }
      assert.deepEqual(errors, [], "No uncaught errors in halaqa " + group.id);
      console.log("PASS: browser rendered roster and grades for halaqa", group.id);
    }
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
