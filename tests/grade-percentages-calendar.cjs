const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const modules = new Map();
function load(name) {
  if (name.endsWith("grade-sync")) return { gradeView: (value) => value };
  if (name.endsWith("auth-session")) return { hasAuthToken: () => false };
  const file = path.join(__dirname, "../src/lib", name.split("/").at(-1) + ".ts");
  if (modules.has(file)) return modules.get(file);
  const result = {};
  modules.set(file, result);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "exports", code)(load, result);
  return result;
}

const grades = load("semester-grading");
const weeklyTests = load("weekly-tests");
const { dayScore, weekPercentage } = load("mock-data");
const { buildWeeklyReport } = load("weekly-report-history");
const { buildCombinedProgramTotals, elapsedProgramDays } = load("halaqa-program-combined-totals");

const complete = { attendance: "present", hifz: "one", rabt: "pass", muraja: "pass", wajib: false };
const calendar = {
  semester: { id: "fixture", name: "Fixture", start_date: "2026-09-20", weeks_count: 2,
    working_days: [0, 1, 2, 3, 4], excluded_dates: [{date:"2026-09-23"},{date:"2026-09-24"}] },
  weeks: [{week_number:1,start_date:"2026-09-20",end_date:"2026-09-24"}],
  operationalDate: "2026-09-24", currentWeekNumber: 1, currentDayKey: "thu",
};
const store = { S: { 1: { days: { sun:complete, mon:complete, tue:complete, wed:complete } } } };
const before = JSON.stringify(store);
assert.equal(weekPercentage(store.S[1],false,"gold"),80);
assert.equal(grades.studentWeekOverallPercentage("S",false,store,1,"gold",calendar),100);
assert.equal(grades.studentWeekReportPercentages("S","gold",false,store,calendar).weekOverall,100);
assert.equal(grades.studentReportPercentages("S","gold",false,store,calendar).overall,100);
const archivePreview=buildWeeklyReport(calendar,1,[{id:7,name:"Fixture"}],[{id:"S",name:"Fixture",halaqaId:7,levelType:"gold"}],store);
assert.equal(archivePreview.halaqat[0].percentage,100);
assert.equal(archivePreview.honorBoard[0].percentage,100);
assert.equal(JSON.stringify(store),before);

const attendanceOnly = { attendance: "present" };
assert.deepEqual(grades.dayScoreBreakdown(attendanceOnly,"gold",false),{earned:15,max:65});
assert.equal(dayScore(attendanceOnly,false,"gold"),15);
const sparse = { S: { 1: { days: { sun:attendanceOnly } } } };
const firstDay = {...calendar,operationalDate:"2026-09-20"};
assert.equal(grades.studentWeekOverallPercentage("S",false,sparse,1,"gold",firstDay),23);
assert.equal(grades.semesterOverallPercentage("S","gold",false,sparse,firstDay),23.1);
assert.equal(grades.semesterComponentPercentages("S","gold",false,sparse,firstDay).hifz,0);
assert.equal(grades.semesterDayCompletionReport("S",false,sparse,firstDay).dayCounts.hifzDays,0);
assert.deepEqual(grades.dayScoreBreakdown({...attendanceOnly,wajib:true},"silver",true),{earned:30,max:30});
assert.equal(grades.dayScoreBreakdown({...attendanceOnly,hifz:"half"},"silver",false).earned,30);
assert.equal(grades.semesterOverallPercentage("S","gold",false,sparse,{...calendar,operationalDate:"2026-09-19"}),0);
assert.equal(grades.studentWeekOverallPercentage("S",false,store,3,"gold",calendar),0);

const compensation = { S: { 1: { days: {
  sun:{...complete,compensationFaces:0.5}, mon:{...complete,compensationFaces:1},
  wed:{...complete,compensationFaces:2},
} } } };
assert.equal(grades.semesterOverallPercentage("S","gold",false,compensation,firstDay),115.4);
assert.equal(grades.studentWeekOverallPercentage("S",false,compensation,1,"gold",firstDay),115);
const legacyCompensation = { S: { 1: { days:{sun:complete},compensationFaces:2 } } };
assert.equal(grades.semesterOverallPercentage("S","gold",false,legacyCompensation,firstDay),100);
assert.equal(grades.semesterOverallPercentage("S","gold",false,legacyCompensation,calendar),53.8);
const saturdayCalendar = {...calendar,operationalDate:"2026-09-26",semester:{...calendar.semester,working_days:[6],excluded_dates:[]}};
const saturday = { S: { 1: { days:{sat:{...complete,compensationFaces:0.5}} } } };
assert.equal(grades.studentWeekOverallPercentage("S",false,saturday,1,"gold",saturdayCalendar),115);

// Points 25, 25 and seven zero weeks: rounding each week first gives 12.4%.
const weekly = { S: { 1:{muraja:["pass"],rabt:"pass"}, 2:{muraja:["pass"],rabt:["pass"]} } };
assert.equal(weeklyTests.scoreWeeklyTests(weekly.S[1]).percent,55.6);
assert.equal(weeklyTests.cumulativeWeeklyTestsPercent(weekly,"S",9),12.3);

const scientific = { S: {
  1: { sun: { hifz: "10" }, mon: { hifz: "10" }, tue: { hifz: "10" }, wed: { hifz: "10" } },
  2: { sun: { hifz: "0" }, mon: { hifz: "10" } },
} };
const programCalendar = { ...calendar, operationalDate: "2026-09-27" };
const config = { visible: true, fields: { hifz: true }, defaultScores: { hifz: "10" } };
const elapsed = elapsedProgramDays(programCalendar, [1, 2]);
assert.deepEqual(elapsed, { 1: ["sun", "mon", "tue"], 2: ["sun"] });
const originalScientific = JSON.stringify(scientific);
const programTotals = weeks => buildCombinedProgramTotals([], {}, "S", weeks, scientific, ["hifz"], elapsed, config);
assert.equal(programTotals([1]).percent, 100, "earlier scores remain visible; a holiday is excluded from both sides");
assert.equal(programTotals([2]).percent, 0, "future scores do not contribute");
assert.equal(programTotals([2]).hasData, true, "an actual zero is still a recorded grade");
assert.deepEqual([...programTotals([2]).scientificRecordedFields], ["hifz"]);
assert.equal(programTotals([3]).scientificRecordedFields.size, 0, "missing weeks have no recorded zero");
assert.equal(programTotals([1, 2]).percent, 75);
assert.equal(JSON.stringify(scientific), originalScientific);
console.log("PASS: calendar, holidays, sparse grades, compensation, reports and weekly test rounding; grade inputs unchanged");
