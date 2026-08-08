import * as XLSX from "xlsx";
import type { AcademicCalendar } from "@/lib/academic-context";
import type { AcademicPhaseRecord } from "@/lib/academic-record";
import {
  loadGrades,
  loadHalaqat,
  loadSardHistory,
  weekPercentage,
  type Student,
} from "@/lib/mock-data";
import {
  enabledScientificFields,
  loadScientificConfig,
  loadScientificData,
  SCIENTIFIC_FIELD_LABELS,
  studentScientificPeriodTotals,
  type ScientificGradeField,
} from "@/lib/scientific-grades";
import {
  fallbackWeeklyAverage,
  studentReportPercentages,
  studentReportPercentRows,
  type StudentReportPercentages,
} from "@/lib/semester-grading";
import {
  attendanceTypeLabel,
  buildStudentProfileData,
  dayKeyLabel,
  formatProfileDate,
  transferStatusLabel,
  violationCategoryLabel,
  type AttendanceRow,
  type StudentViolationRow,
} from "@/lib/student-profile-data";
import { weekLabel } from "@/lib/arabic-numbers";

export interface StudentScientificReport {
  enabled: boolean;
  fields: ScientificGradeField[];
  totals: Record<ScientificGradeField, number> & { total: number };
}

export interface StudentFullReport {
  student: Student;
  halaqaName: string;
  isTalqeen: boolean;
  semesterName: string;
  percentages: StudentReportPercentages;
  profile: ReturnType<typeof buildStudentProfileData>;
  scientific: StudentScientificReport;
  weeklyRows: { week: number; percent: number }[];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPercentages(
  student: Student,
  isTalqeen: boolean,
  calendar: AcademicCalendar | null,
): StudentReportPercentages {
  const grades = loadGrades();
  if (calendar) {
    return studentReportPercentages(student.id, student.levelType, isTalqeen, grades, calendar);
  }
  const weeks = grades[student.id] || {};
  const weekNums = Object.keys(weeks).map(Number);
  const lastWeek = weekNums.length ? Math.max(...weekNums) : 0;
  return {
    overall: fallbackWeeklyAverage(student.id, isTalqeen, grades, student.levelType),
    weekOverall: lastWeek
      ? weekPercentage(weeks[lastWeek], isTalqeen, student.levelType)
      : 0,
    components: { attendance: 0, hifz: 0, muraja: 0, rabt: 0, wajib: 0 },
  };
}

function buildScientificReport(student: Student): StudentScientificReport {
  const cfg = loadScientificConfig(student.halaqaId);
  const fields = enabledScientificFields(cfg.fields);
  if (!cfg.visible || fields.length === 0) {
    return {
      enabled: false,
      fields: [],
      totals: { attendance: 0, hifz: 0, rabt: 0, muraja: 0, total: 0 },
    };
  }
  const data = loadScientificData(student.halaqaId);
  const grades = loadGrades();
  const weekNums = Object.keys(grades[student.id] || {}).map(Number).sort((a, b) => a - b);
  const totals = studentScientificPeriodTotals(data, student.id, weekNums, fields);
  return { enabled: true, fields, totals };
}

export function buildStudentFullReport(
  student: Student,
  calendar: AcademicCalendar | null,
): StudentFullReport {
  const halaqat = loadHalaqat();
  const h = halaqat.find((x) => x.id === student.halaqaId);
  const isTalqeen = !!h?.isTalqeen;
  const grades = loadGrades();
  const weeks = grades[student.id] || {};
  const weeklyRows = Object.keys(weeks)
    .map(Number)
    .sort((a, b) => a - b)
    .map((w) => ({
      week: w,
      percent: weekPercentage(weeks[w], isTalqeen, student.levelType),
    }));

  return {
    student,
    halaqaName: h?.name ?? "—",
    isTalqeen,
    semesterName: calendar?.semester?.name ?? "—",
    percentages: buildPercentages(student, isTalqeen, calendar),
    profile: buildStudentProfileData(student.id, calendar),
    scientific: buildScientificReport(student),
    weeklyRows,
  };
}

function attendanceRowsForExport(rows: AttendanceRow[]): (string | number)[][] {
  const out: (string | number)[][] = [["النوع", "التاريخ", "اليوم", "الأسبوع"]];
  rows.forEach((a) => {
    out.push([
      attendanceTypeLabel(a.type),
      a.date ? formatProfileDate(a.date) : "—",
      dayKeyLabel(a.dayKey),
      a.week ? weekLabel(a.week) : "—",
    ]);
  });
  return out;
}

function formatActionsSummary(actions: StudentViolationRow["actions"]): string {
  if (actions.length === 0) return "—";
  return actions
    .map((a) => `${a.role} (${a.byName}): ${a.text}`)
    .join(" · ");
}

function violationRowsForExport(rows: StudentViolationRow[]): (string | number)[][] {
  const out: (string | number)[][] = [
    ["تاريخ المخالفة", "السبب", "المعلم", "الأسبوع", "الحالة", "الإجراءات"],
  ];
  rows.forEach((v) => {
    out.push([
      formatProfileDate(v.date),
      v.type,
      v.fromName,
      weekLabel(v.week),
      transferStatusLabel(v.status),
      formatActionsSummary(v.actions),
    ]);
  });
  return out;
}

function violationActionDetailRows(rows: StudentViolationRow[]): (string | number)[][] {
  const out: (string | number)[][] = [
    ["تاريخ المخالفة", "السبب", "الدور", "من نفّذ", "الإجراء", "تاريخ الإجراء"],
  ];
  rows.forEach((v) => {
    if (v.actions.length === 0) {
      out.push([formatProfileDate(v.date), v.type, "—", "—", "—", "—"]);
      return;
    }
    v.actions.forEach((a) => {
      out.push([
        formatProfileDate(v.date),
        v.type,
        a.role,
        a.byName,
        a.text,
        formatProfileDate(a.at),
      ]);
    });
  });
  return out;
}

function scientificRowsForExport(report: StudentFullReport): (string | number)[][] {
  if (!report.scientific.enabled) {
    return [["الدرجات العلمية", "غير مفعّلة لهذه الحلقة"]];
  }
  const rows: (string | number)[][] = [["البند", "المجموع"]];
  for (const field of report.scientific.fields) {
    rows.push([SCIENTIFIC_FIELD_LABELS[field], report.scientific.totals[field]]);
  }
  rows.push(["الإجمالي", report.scientific.totals.total]);
  return rows;
}

function academicRowsForExport(records: AcademicPhaseRecord[]): (string | number)[][] {
  const rows: (string | number)[][] = [["المرحلة", "النتيجة", "النسبة %", "التاريخ"]];
  records.forEach((r) => {
    const label = r.planTitle ?? (r.levelNumber ? `مرحلة ${r.levelNumber}` : `أسبوع ${r.week}`);
    rows.push([
      label,
      r.result === "passed" ? "ناجح" : "راسب",
      r.percent ?? "—",
      r.testDate ? formatProfileDate(r.testDate) : "—",
    ]);
  });
  return rows;
}

export function exportStudentReportExcel(report: StudentFullReport): void {
  const s = report.student;
  const wb = XLSX.utils.book_new();

  const info: (string | number)[][] = [
    ["تقرير الطالب الشامل"],
    ["الاسم", s.name],
    ["الحلقة", report.halaqaName],
    ["الفصل", report.semesterName],
    ["المستوى", `${s.levelType === "gold" ? "ذهبي" : "فضي"} - ${s.level}`],
    ["رقم الهوية", s.nationalId],
    ["ولي الأمر", s.parentPhone],
    [],
    ...studentReportPercentRows(report.percentages, report.isTalqeen),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(info), "معلومات");

  const weekRows: (string | number)[][] = [["الأسبوع", "النسبة %"]];
  report.weeklyRows.forEach((w) => weekRows.push([weekLabel(w.week), w.percent]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(weekRows), "الأسابيع");

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(attendanceRowsForExport(report.profile.attendance)),
    "الغياب والتأخر",
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(violationRowsForExport(report.profile.violations)),
    "المخالفات",
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(violationActionDetailRows(report.profile.violations)),
    "تفاصيل الإجراءات",
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(scientificRowsForExport(report)),
    "الدرجات العلمية",
  );

  const sardRows: (string | number)[][] = [["الأسبوع", "المحاولة", "النتيجة", "النسبة %", "التاريخ"]];
  loadSardHistory()
    .filter((x) => x.studentId === s.id)
    .forEach((x) => {
      sardRows.push([
        weekLabel(x.week),
        x.attempt,
        x.result === "passed" ? "ناجح" : "راسب",
        x.percent,
        formatProfileDate(x.at),
      ]);
    });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sardRows), "سجل السرد");

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(academicRowsForExport(report.profile.academic)),
    "المراحل",
  );

  XLSX.writeFile(wb, `تقرير_${s.name}.xlsx`);
}

function reportPrintStyles(): string {
  return `
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", Tahoma, Arial, sans-serif;
      margin: 0;
      padding: 16px;
      color: #0f172a;
      background: #fff;
      font-size: 13px;
      line-height: 1.5;
    }
    h1 { margin: 0 0 4px; font-size: 20px; color: #1e3a5f; }
    h2 {
      margin: 20px 0 8px;
      font-size: 15px;
      color: #1e3a5f;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
    }
    .meta { color: #64748b; font-size: 12px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: right; }
    th { background: #f8fafc; font-weight: 700; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 12px; }
    .stat {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 8px 10px;
      background: #f8fafc;
    }
    .stat .label { font-size: 11px; color: #64748b; }
    .stat .value { font-size: 18px; font-weight: 700; color: #1e3a5f; }
    .empty { color: #94a3b8; font-style: italic; padding: 8px 0; }
    @media print {
      body { padding: 0; }
      h2 { break-after: avoid; }
      tr { break-inside: avoid; }
    }
  `;
}

function tableHtml(headers: string[], rows: string[][]): string {
  if (rows.length === 0) {
    return `<p class="empty">لا توجد بيانات</p>`;
  }
  const head = `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;
  const body = rows
    .map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(String(c))}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function buildReportHtml(report: StudentFullReport, brandName: string): string {
  const s = report.student;
  const p = report.percentages;
  const comps = report.isTalqeen
    ? [
        ["نسبة الواجب", `${p.components.wajib}%`],
      ]
    : [
        ["نسبة الحفظ", `${p.components.hifz}%`],
        ["نسبة المراجعة", `${p.components.muraja}%`],
        ["نسبة الربط", `${p.components.rabt}%`],
      ];

  const stats = [
    ["النسبة الكلية", `${p.overall}%`],
    ["نسبة الأسبوع الحالي", `${p.weekOverall}%`],
    ["نسبة الحضور", `${p.components.attendance}%`],
    ...comps,
  ];

  const statsHtml = stats
    .map(
      ([label, value]) =>
        `<div class="stat"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`,
    )
    .join("");

  const attendanceTable = tableHtml(
    ["النوع", "التاريخ", "اليوم", "الأسبوع"],
    report.profile.attendance.map((a) => [
      attendanceTypeLabel(a.type),
      a.date ? formatProfileDate(a.date) : "—",
      dayKeyLabel(a.dayKey),
      a.week ? weekLabel(a.week) : "—",
    ]),
  );

  const violationsTable = tableHtml(
    ["تاريخ المخالفة", "السبب", "المعلم", "الأسبوع", "الحالة", "الإجراءات"],
    report.profile.violations.map((v) => [
      formatProfileDate(v.date),
      v.type,
      v.fromName,
      weekLabel(v.week),
      transferStatusLabel(v.status),
      formatActionsSummary(v.actions),
    ]),
  );

  const violationActionsHtml = report.profile.violations
    .flatMap((v) =>
      v.actions.map((a) => `
        <tr>
          <td>${escapeHtml(formatProfileDate(v.date))}</td>
          <td>${escapeHtml(v.type)}</td>
          <td>${escapeHtml(a.role)}</td>
          <td>${escapeHtml(a.byName)}</td>
          <td>${escapeHtml(a.text)}</td>
          <td>${escapeHtml(formatProfileDate(a.at))}</td>
        </tr>`),
    )
    .join("");
  const violationActionsSection = violationActionsHtml
    ? `<h2>تفاصيل الإجراءات</h2>
       <table><thead><tr>
         <th>تاريخ المخالفة</th><th>السبب</th><th>الدور</th><th>من نفّذ</th><th>الإجراء</th><th>تاريخ الإجراء</th>
       </tr></thead><tbody>${violationActionsHtml}</tbody></table>`
    : "";

  const weeklyTable = tableHtml(
    ["الأسبوع", "النسبة %"],
    report.weeklyRows.map((w) => [weekLabel(w.week), String(w.percent)]),
  );

  let scientificSection = `<p class="empty">الدرجات العلمية غير مفعّلة</p>`;
  if (report.scientific.enabled) {
    const sciRows = report.scientific.fields.map((f) => [
      SCIENTIFIC_FIELD_LABELS[f],
      String(report.scientific.totals[f]),
    ]);
    sciRows.push(["الإجمالي", String(report.scientific.totals.total)]);
    scientificSection = tableHtml(["البند", "المجموع"], sciRows);
  }

  const sardRows = loadSardHistory()
    .filter((x) => x.studentId === s.id)
    .map((x) => [
      weekLabel(x.week),
      String(x.attempt),
      x.result === "passed" ? "ناجح" : "راسب",
      String(x.percent),
      formatProfileDate(x.at),
    ]);

  const academicRows = report.profile.academic.map((r) => [
    r.planTitle ?? (r.levelNumber ? `مرحلة ${r.levelNumber}` : `أسبوع ${r.week}`),
    r.result === "passed" ? "ناجح" : "راسب",
    r.percent != null ? String(r.percent) : "—",
    r.testDate ? formatProfileDate(r.testDate) : "—",
  ]);

  const body = `
    <h1>تقرير الطالب — ${escapeHtml(s.name)}</h1>
    <p class="meta">
      ${escapeHtml(brandName)} · ${escapeHtml(report.halaqaName)} · ${escapeHtml(report.semesterName)}<br/>
      ${s.levelType === "gold" ? "ذهبي" : "فضي"} — مستوى ${escapeHtml(s.level)}
      ${s.nationalId ? ` · الهوية: ${escapeHtml(s.nationalId)}` : ""}
    </p>

    <h2>النسب التراكمية</h2>
    <div class="grid">${statsHtml}</div>

    <h2>الأسابيع</h2>
    ${weeklyTable}

    <h2>سجل الغياب والتأخر</h2>
    ${attendanceTable}

    <h2>المخالفات (${escapeHtml(violationCategoryLabel())})</h2>
    <p class="meta">تاريخ المخالفة = يوم إرسال المعلم (تلقائي) — المعلم يكتب السبب فقط</p>
    ${violationsTable}
    ${violationActionsSection}

    <h2>الدرجات العلمية</h2>
    ${scientificSection}

    <h2>سجل السرد</h2>
    ${tableHtml(["الأسبوع", "المحاولة", "النتيجة", "النسبة %", "التاريخ"], sardRows)}

    <h2>المراحل الأكاديمية</h2>
    ${tableHtml(["المرحلة", "النتيجة", "النسبة %", "التاريخ"], academicRows)}
  `;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>تقرير ${escapeHtml(s.name)}</title>
  <style>${reportPrintStyles()}</style>
</head>
<body>${body}</body>
</html>`;
}

function printViaHiddenIframe(html: string): boolean {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  document.body.appendChild(iframe);

  const frameWin = iframe.contentWindow;
  const doc = iframe.contentDocument ?? frameWin?.document;
  if (!doc || !frameWin) {
    iframe.remove();
    return false;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const cleanup = () => setTimeout(() => iframe.remove(), 1500);
  const runPrint = () => {
    try {
      frameWin.focus();
      frameWin.print();
    } catch {
      /* user can print manually */
    }
    cleanup();
  };

  if (doc.readyState === "complete") {
    setTimeout(runPrint, 300);
  } else {
    frameWin.addEventListener("load", () => setTimeout(runPrint, 300), { once: true });
  }
  return true;
}

export function printStudentReportPdf(report: StudentFullReport, brandName = "مجمع تحفيظ القرآن"): void {
  const html = buildReportHtml(report, brandName);
  if (!printViaHiddenIframe(html)) {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }
}
