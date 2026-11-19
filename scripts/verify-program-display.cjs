const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {load, storage} = require(path.resolve("tests/independent-test-support.cjs"));
const fixture = JSON.parse(fs.readFileSync(0, "utf8"));
const modules = new Map();
function lib(name) {
  if (name.endsWith("auth-session")) return {hasAuthToken: () => false};
  if (name.endsWith("grade-sync")) return {gradeView: value => value};
  const short = name.split("/").at(-1);
  if (!modules.has(short)) {
    const dependencies = new Proxy({}, {has: () => true, get: (_, key) => lib(key)});
    modules.set(short, load(path.join("src/lib", short + ".ts"), dependencies));
  }
  return modules.get(short);
}
global.window = new EventTarget();
global.localStorage = storage();
localStorage.setItem("qshatawi_scientific_grades_v1", JSON.stringify(fixture.scientific));
const scientific = lib("scientific-grades");
const {buildCombinedProgramTotals, elapsedProgramDays} = lib("halaqa-program-combined-totals");
const {filterStandardPrograms} = lib("scientific-grades-program");
const {studentAllProgramsWeekTotals} = lib("halaqa-programs");
const sem = fixture.calendar.semester;
const date = new Intl.DateTimeFormat("sv-SE", {timeZone:"Asia/Riyadh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const start = Date.parse(sem.start_date + "T00:00:00Z");
const sunday = start - new Date(start).getUTCDay()*86400000;
const keys = ["sun","mon","tue","wed","thu","fri","sat"];
const holidays = new Set((sem.excluded_dates ?? []).map(value => typeof value === "string" ? value : value.date));
const actualWeeks = Math.min(sem.weeks_count, Math.floor((Date.parse(date+"T00:00:00Z")-sunday)/604800000)+1);
const weeks = Array.from({length:actualWeeks}, (_,i)=>i+1);
const referenceDays = {};
for (const week of weeks) {
  referenceDays[week] = keys.filter((_,i) => {
    const iso = new Date(sunday+((week-1)*7+i)*86400000).toISOString().slice(0,10);
    return iso >= sem.start_date && iso <= date && sem.working_days.includes(i) && !holidays.has(iso);
  });
}
const dayMap = elapsedProgramDays({semester:sem,operationalDate:date}, weeks);
assert.deepEqual(dayMap, referenceDays);
const checked = Object.fromEntries(weeks.map(w => [w,{studentRows:0,withStoredScores:0,positiveRows:0,recordedZeroFields:0,missingFields:0}]));
for (const student of fixture.students) {
  const h = student.halaqa_id;
  const config = scientific.loadScientificConfig(h);
  if (!scientific.isScientificProgramEnabled(config)) continue;
  const fields = scientific.enabledScientificFields(config.fields);
  const data = scientific.loadScientificData(h);
  const standard = filterStandardPrograms(fixture.programs[h] ?? []);
  const grades = fixture.grades[h] ?? {};
  let cumulativeEarned = 0, cumulativeMax = 0;
  for (const week of weeks) {
    const record = checked[week];
    const expected = {};
    for (const day of referenceDays[week]) {
      for (const field of fields) {
        const raw = fixture.scientific.data?.[h]?.[student.id]?.[week]?.[day]?.[field];
        if (raw == null || String(raw).trim()==="") continue;
        const value = Number.parseFloat(String(raw).replace(",","."));
        if (Number.isFinite(value)) expected[field] = (expected[field] ?? 0) + value;
      }
    }
    const result = buildCombinedProgramTotals(standard,grades,student.id,[week],data,fields,dayMap,config);
    record.studentRows++;
    for (const field of fields) {
      assert.equal(result.scientificRecordedFields.has(field), Object.hasOwn(expected,field));
      if (Object.hasOwn(expected,field)) {
        assert.equal(result.sciTotals[field], expected[field]);
        if (expected[field]===0) record.recordedZeroFields++;
      } else record.missingFields++;
    }
    const earned = Object.values(expected).reduce((sum,v)=>sum+v,0);
    assert.ok(Math.abs(result.sciTotals.total-earned)<1e-8);
    if (Object.keys(expected).length) record.withStoredScores++;
    if (earned>0) record.positiveRows++;
    const standardWeek = studentAllProgramsWeekTotals(standard,grades,student.id,week);
    const maximum = standardWeek.maxPossible + referenceDays[week].length*scientific.scientificDailyMaxPossible(config);
    const overall = standardWeek.earned + earned;
    assert.equal(result.percent, maximum ? Math.round(overall/maximum*100) : 0);
    cumulativeEarned += overall;
    cumulativeMax += maximum;
    const cumulative = buildCombinedProgramTotals(standard,grades,student.id,weeks.slice(0,week),data,fields,dayMap,config);
    assert.equal(cumulative.percent,cumulativeMax ? Math.round(cumulativeEarned/cumulativeMax*100) : 0);
  }
}
assert.ok(checked[1].positiveRows > 0 && checked[10].positiveRows > 0);
console.log(JSON.stringify({isolated_program_display_matches_stored_values:checked}));
