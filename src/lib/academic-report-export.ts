import * as XLSX from "xlsx";
import type { AcademicReport, PeriodTotals, ReportFocus } from "@/lib/academic-reports";
import { attendancePct, completenessPct, hifzPct, resultPct } from "@/lib/academic-reports";

const pct = (n: number | null) => (n === null ? "لم يُرصد" : `${n}%`);
const safe = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const included = (focus: ReportFocus, key: string) => focus === "all" || focus === key;

export function reportCards(t: PeriodTotals, focus: ReportFocus, isTalqeen: boolean) {
  return [
    ...(included(focus, "attendance")
      ? [
          {
            label: "نسبة الحضور",
            value: pct(attendancePct(t)),
            detail: `${t.present + t.late} حضور من ${t.recorded} يوم مرصود`,
          },
          {
            label: "اكتمال رصد الحضور",
            value: pct(completenessPct(t)),
            detail: `${t.expected - t.recorded} فرصة لم تُرصد`,
          },
        ]
      : []),
    ...(isTalqeen
      ? included(focus, "all")
        ? [
            {
              label: "الواجب",
              value: `${t.wajibDone} / ${t.wajibRecorded}`,
              detail: "من الأيام المرصودة",
            },
          ]
        : []
      : [
          ...(included(focus, "hifz")
            ? [
                {
                  label: "أوجه الحفظ",
                  value: String(t.hifzFaces),
                  detail: `المستهدف ${t.hifzTarget} وجه · ${pct(t.hifzRecorded ? hifzPct(t) : null)}`,
                },
              ]
            : []),
          ...(included(focus, "rabt")
            ? [
                {
                  label: "نجاح الربط",
                  value: pct(resultPct(t, "rabt")),
                  detail: `${t.rabtPass} ناجح، ${t.rabtFail} غير ناجح`,
                },
              ]
            : []),
          ...(included(focus, "muraja")
            ? [
                {
                  label: "نجاح المراجعة",
                  value: pct(resultPct(t, "muraja")),
                  detail: `${t.murajaPass} ناجح، ${t.murajaFail} غير ناجح`,
                },
              ]
            : []),
        ]),
  ];
}

export function reportTitle(r: AcademicReport): string {
  return r.options.scope === "student"
    ? `تقرير الطالب: ${r.halaqat[0]?.students[0]?.name ?? ""}`
    : r.options.scope === "halaqa"
      ? `تقرير الحلقة: ${r.halaqat[0]?.name ?? ""}`
      : r.options.halaqaId
        ? `تقرير الحلقة للداعم: ${r.halaqat[0]?.name ?? ""}`
        : "تقرير المجمع";
}

export function reportHtml(
  r: AcademicReport,
  brandName: string,
  approval: { by: string; at: string },
): string {
  const focus = r.options.focus;
  const oneTalqeen = r.halaqat.every((h) => h.isTalqeen);
  const cards = reportCards(r.totals, focus, oneTalqeen)
    .map(
      (card) =>
        `<div class="card"><small>${safe(card.label)}</small><b>${safe(card.value)}</b><span>${safe(card.detail)}</span></div>`,
    )
    .join("");
  const focusedValue = (t: PeriodTotals) =>
    focus === "attendance"
      ? pct(attendancePct(t))
      : focus === "hifz"
        ? `${t.hifzFaces} / ${t.hifzTarget}`
        : focus === "rabt"
          ? pct(resultPct(t, "rabt"))
          : pct(resultPct(t, "muraja"));
  const scopeDetails =
    r.options.scope === "student"
      ? `<section><h2>خلاصة الطالب</h2>${r.halaqat
          .flatMap((h) => h.students)
          .map(
            (s) =>
              `<p>الحضور ${s.period.present}، التأخر ${s.period.late}، الاستئذان ${s.period.excused}، الغياب ${s.period.absent}.</p>${s.recommendation ? `<p><strong>توصية المعلم:</strong> ${safe(s.recommendation)}</p>` : ""}`,
          )
          .join("")}</section>`
      : focus !== "all" && !r.options.named
        ? `<section><h2>تفصيل الحلقات</h2><table><thead><tr><th>الحلقة</th><th>الطلاب</th><th>${safe({ attendance: "الحضور", hifz: "الحفظ / المستهدف", rabt: "نجاح الربط", muraja: "نجاح المراجعة" }[focus])}</th></tr></thead><tbody>${r.halaqat.map((h) => `<tr><td>${safe(h.name)}</td><td>${h.students.length}</td><td>${h.isTalqeen && focus !== "attendance" ? "تلقين" : focusedValue(h.period)}</td></tr>`).join("")}</tbody></table></section>`
        : `<section><h2>تفصيل الحلقات</h2><table><thead><tr><th>الحلقة</th><th>الطلاب</th><th>الحضور</th><th>أوجه الحفظ</th><th>الربط</th><th>المراجعة</th></tr></thead><tbody>${r.halaqat.map((h) => `<tr><td>${safe(h.name)}</td><td>${h.students.length}</td><td>${pct(attendancePct(h.period))}</td><td>${h.isTalqeen ? "تلقين" : h.period.hifzFaces}</td><td>${h.isTalqeen ? "—" : pct(resultPct(h.period, "rabt"))}</td><td>${h.isTalqeen ? "—" : pct(resultPct(h.period, "muraja"))}</td></tr>`).join("")}</tbody></table></section>`;
  const details =
    r.options.named && r.options.scope !== "student"
      ? `<section><h2>تفاصيل الطلاب</h2><table><thead><tr><th>الطالب</th><th>الحلقة</th><th>حضور/مرصود</th><th>حفظ/مستهدف</th><th>ربط ✓/✗</th><th>مراجعة ✓/✗</th></tr></thead><tbody>${r.halaqat
          .flatMap((h) => h.students)
          .map(
            (s) =>
              `<tr><td>${safe(s.name)}</td><td>${safe(s.halaqaName)}</td><td>${s.period.present + s.period.late}/${s.period.recorded}</td><td>${s.isTalqeen ? "—" : `${s.period.hifzFaces}/${s.period.hifzTarget}`}</td><td>${s.isTalqeen ? "—" : `${s.period.rabtPass}/${s.period.rabtFail}`}</td><td>${s.isTalqeen ? "—" : `${s.period.murajaPass}/${s.period.murajaFail}`}</td></tr>`,
          )
          .join("")}</tbody></table></section>`
      : "";
  const comparisonParts = [
    ...(included(focus, "attendance")
      ? [`الحضور ${pct(attendancePct(r.prior!))} ← ${pct(attendancePct(r.totals))}`]
      : []),
    ...(included(focus, "hifz") ? [`الحفظ ${r.prior?.hifzFaces} ← ${r.totals.hifzFaces} وجه`] : []),
    ...(included(focus, "rabt")
      ? [`نجاح الربط ${pct(resultPct(r.prior!, "rabt"))} ← ${pct(resultPct(r.totals, "rabt"))}`]
      : []),
    ...(included(focus, "muraja")
      ? [
          `نجاح المراجعة ${pct(resultPct(r.prior!, "muraja"))} ← ${pct(resultPct(r.totals, "muraja"))}`,
        ]
      : []),
  ];
  const compare = r.prior
    ? `<p>مقارنة بالفترة ${r.priorFrom} – ${r.priorTo}: ${comparisonParts.join("، ")}${included(focus, "hifz") && r.improved !== null ? `، تحسّن ${r.improved} من الطلاب في تحقيق هدف الحفظ` : ""}.</p>`
    : "<p>لا تتوفر فترة سابقة كاملة للمقارنة.</p>";
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${safe(reportTitle(r))}</title><style>
    @page{size:A4;margin:15mm}*{box-sizing:border-box}body{font-family:Tahoma,Arial,sans-serif;color:#183447;line-height:1.6}header{border-bottom:3px solid #c6a86a;padding-bottom:14px}h1{margin:5px 0;color:#174463;font-size:25px}h2{color:#174463;font-size:18px}small,footer{color:#607586}.meta{font-size:12px}.cards{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:18px 0}.card{padding:13px;border:1px solid #d5dfdf;border-radius:10px;break-inside:avoid}.card b{font-size:23px;color:#174463;display:block}.card span{font-size:11px;display:block}section{margin:20px 0;break-inside:avoid}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border-bottom:1px solid #d8e2e4;padding:6px;text-align:right}thead{background:#eef4f5}footer{border-top:1px solid #ddd;margin-top:20px;padding-top:10px;font-size:11px}@media print{body{print-color-adjust:exact}}
    </style></head><body><header><small>${safe(brandName)}</small><h1>${safe(reportTitle(r))}</h1><div class="meta">${r.options.donorName ? `مقدم إلى ${safe(r.options.donorName)} · ` : ""}${safe(r.semesterName)} · من ${r.options.from} إلى ${r.options.to} · تاريخ الاعتماد ${safe(approval.at)}</div></header>
    <section><h2>الملخص</h2><p>${r.people} طالب، ${r.halaqat.length} حلقة. حالات الحضور: ${r.totals.present} حاضر، ${r.totals.late} متأخر، ${r.totals.excused} مستأذن، ${r.totals.absent} غائب.</p><div class="cards">${cards}</div></section>
    <section><h2>مقارنة الفترة</h2>${compare}</section>${scopeDetails}${details}<footer>نسبة الحضور = (حاضر + متأخر) ÷ الحالات المرصودة. الاستئذان والغياب عدم حضور. الحقول غير المرصودة: ${r.missingFields}. اعتمد التقرير: ${safe(approval.by)}.</footer></body></html>`;
}

export function printApprovedReport(
  r: AcademicReport,
  brandName: string,
  approval: { by: string; at: string },
) {
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc || !frame.contentWindow) {
    frame.remove();
    throw new Error("تعذّر فتح نافذة الطباعة");
  }
  doc.open();
  doc.write(reportHtml(r, brandName, approval));
  doc.close();
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1500);
  }, 350);
}

export function exportApprovedExcel(r: AcademicReport, approval: { by: string; at: string }) {
  const wb = XLSX.utils.book_new();
  const info = [
    [reportTitle(r)],
    ["الفصل", r.semesterName],
    ["من", r.options.from],
    ["إلى", r.options.to],
    ["اعتمده", approval.by],
    ["تاريخ الاعتماد", approval.at],
    ["الطلاب", r.people],
    ["الحلقات", r.halaqat.length],
    ["الحضور", r.totals.present + r.totals.late],
    ["عدم الحضور", r.totals.excused + r.totals.absent],
    ["أوجه الحفظ", r.totals.hifzFaces],
    ["المستهدف", r.totals.hifzTarget],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(info), "الملخص");
  const headers = [
    "الطالب",
    "الحلقة",
    "الفرص",
    "المرصود",
    "حاضر",
    "متأخر",
    "مستأذن",
    "غائب",
    "الحفظ أوجه",
    "الحفظ مستهدف",
    "الربط ناجح",
    "الربط غير ناجح",
    "المراجعة ناجح",
    "المراجعة غير ناجح",
  ];
  const rows = r.halaqat
    .flatMap((h) => h.students)
    .map((s) => [
      s.name,
      s.halaqaName,
      s.period.expected,
      s.period.recorded,
      s.period.present,
      s.period.late,
      s.period.excused,
      s.period.absent,
      s.period.hifzFaces,
      s.period.hifzTarget,
      s.period.rabtPass,
      s.period.rabtFail,
      s.period.murajaPass,
      s.period.murajaFail,
    ]);
  if (r.options.named || r.options.scope === "student")
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), "الطلاب");
  const groups = r.halaqat.map((h) => [
    h.name,
    h.students.length,
    h.period.expected,
    h.period.recorded,
    h.period.present + h.period.late,
    h.period.excused + h.period.absent,
    h.period.hifzFaces,
    h.period.hifzTarget,
    h.period.rabtPass,
    h.period.rabtFail,
    h.period.murajaPass,
    h.period.murajaFail,
  ]);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      [
        "الحلقة",
        "الطلاب",
        "الفرص",
        "المرصود",
        "حضور",
        "عدم حضور",
        "الحفظ",
        "المستهدف",
        "ربط ناجح",
        "ربط غير ناجح",
        "مراجعة ناجح",
        "مراجعة غير ناجح",
      ],
      ...groups,
    ]),
    "الحلقات",
  );
  XLSX.writeFile(wb, `تقرير_${r.options.scope}_${r.options.from}_${r.options.to}.xlsx`);
}
