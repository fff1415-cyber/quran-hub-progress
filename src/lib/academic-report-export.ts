import * as XLSX from "xlsx";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FormalAcademicReport } from "@/components/role-workspace/FormalAcademicReport";
import type { AcademicReport, PeriodTotals, ReportFocus } from "@/lib/academic-reports";
import {
  attendancePct,
  completenessPct,
  hifzPct,
  resultPct,
  reportTitle,
} from "@/lib/academic-reports";

const pct = (n: number | null) => (n === null ? "لم يُرصد" : `${n}%`);
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

export function reportHtml(
  report: AcademicReport,
  brandName: string,
  logoUrl: string | null,
  approval: { by: string; at: string },
): string {
  const markup = renderToStaticMarkup(
    createElement(FormalAcademicReport, { report, brandName, logoUrl, approval }),
  );
  const title = reportTitle(report).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${title}</title></head><body>${markup}</body></html>`;
}

export function printApprovedReport(
  report: AcademicReport,
  brandName: string,
  logoUrl: string | null,
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
  doc.write(reportHtml(report, brandName, logoUrl, approval));
  doc.close();
  const images = Array.from(doc.images);
  void Promise.all(
    images.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            setTimeout(resolve, 5000);
          }),
    ),
  ).then(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60_000);
  });
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
