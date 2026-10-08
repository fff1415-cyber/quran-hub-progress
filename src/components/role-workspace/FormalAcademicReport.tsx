import type { CSSProperties } from "react";
import {
  attendancePct,
  reportTitle,
  resultPct,
  type AcademicReport,
  type PeriodTotals,
} from "@/lib/academic-reports";

const percent = (value: number | null) => (value === null ? "لم يُرصد" : `${value}%`);
const palette = { navy: "#092c45", gold: "#bc965c", muted: "#617485" };

const shell: CSSProperties = {
  fontFamily: "Tahoma, Arial, sans-serif",
  direction: "rtl",
  background: "#f8f6f0",
  color: palette.navy,
  maxWidth: 900,
  margin: "0 auto",
  lineHeight: 1.6,
};

function metricRows(report: AcademicReport) {
  const t = report.totals;
  const focus = report.options.focus;
  const show = (key: string) => focus === "all" || focus === key;
  const allTalqeen = report.halaqat.every((h) => h.isTalqeen);
  return [
    ...(!allTalqeen && show("hifz")
      ? [
          {
            label: "أوجه الحفظ",
            value: `${t.hifzFaces} وجه`,
            detail: `المستهدف ${t.hifzTarget} وجه`,
          },
        ]
      : []),
    ...(!allTalqeen && show("rabt")
      ? [
          {
            label: "نجاح الربط",
            value: percent(resultPct(t, "rabt")),
            detail: `${t.rabtPass} ناجح من ${t.rabtPass + t.rabtFail} نتيجة`,
          },
        ]
      : []),
    ...(!allTalqeen && show("muraja")
      ? [
          {
            label: "نجاح المراجعة",
            value: percent(resultPct(t, "muraja")),
            detail: `${t.murajaPass} ناجح من ${t.murajaPass + t.murajaFail} نتيجة`,
          },
        ]
      : []),
    ...(focus === "all" && t.wajibRecorded > 0
      ? [{ label: "واجب التلقين", value: `${t.wajibDone} / ${t.wajibRecorded}`, detail: "" }]
      : []),
  ];
}

function circleValue(
  t: PeriodTotals,
  focus: Exclude<AcademicReport["options"]["focus"], "all">,
  isTalqeen: boolean,
) {
  if (focus === "attendance") return percent(attendancePct(t));
  if (isTalqeen) return "تلقين";
  if (focus === "hifz") return `${t.hifzFaces} وجه`;
  if (focus === "rabt") return percent(resultPct(t, "rabt"));
  if (focus === "muraja") return percent(resultPct(t, "muraja"));
  return "—";
}

export function FormalAcademicReport({
  report,
  brandName,
  logoUrl,
  approval,
}: {
  report: AcademicReport;
  brandName: string;
  logoUrl: string | null;
  approval?: { by: string; at: string } | null;
}) {
  const t = report.totals;
  const rows = metricRows(report);
  const isStudent = report.options.scope === "student";
  const isComplex = report.options.scope === "complex";
  const student = isStudent ? report.halaqat[0]?.students[0] : null;
  const reportLogoUrl = logoUrl ?? (brandName.includes("الشتيوي") ? "/shtaiwi-logo.png" : null);
  const columns: Exclude<AcademicReport["options"]["focus"], "all">[] =
    report.options.focus === "all"
      ? ["attendance", "hifz", "rabt", "muraja"]
      : [report.options.focus];
  const columnLabels = {
    attendance: "الحضور",
    hifz: "أوجه الحفظ",
    rabt: "الربط",
    muraja: "المراجعة",
  };

  return (
    <article style={shell} className="formal-academic-report">
      <style>{`
        .formal-academic-report * { box-sizing: border-box; }
        .formal-academic-report .report-header { display:flex; justify-content:space-between; align-items:center; gap:24px; background:${palette.navy}; color:white; border-bottom:6px solid ${palette.gold}; padding:30px 36px; }
        .formal-academic-report .report-logo { width:124px; height:124px; flex:none; padding:9px; background:white; border-radius:16px; object-fit:contain; }
        .formal-academic-report .report-body { padding:34px 38px 40px; }
        .formal-academic-report .report-summary { background:white; border:1px solid #e4dfd5; border-radius:16px; padding:25px 27px; margin-bottom:24px; }
        .formal-academic-report .report-kpis { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:13px; margin-bottom:32px; }
        .formal-academic-report .report-kpi { background:white; border:1px solid #e4dfd5; border-radius:15px; padding:18px 20px; min-width:0; }
        .formal-academic-report .report-table { width:100%; border-collapse:collapse; background:white; text-align:right; }
        .formal-academic-report .report-table th { background:#ecdfc9; font-weight:bold; }
        .formal-academic-report .report-table th, .formal-academic-report .report-table td { padding:13px 17px; border-bottom:1px solid #e7dfd5; vertical-align:top; }
        .formal-academic-report .report-section { margin:26px 0 0; break-inside:avoid; }
        .formal-academic-report .report-section h3 { font-size:22px; margin:0 0 14px; }
        .formal-academic-report .report-table-wrap { border:1px solid #e4dfd5; border-radius:15px; overflow:hidden; }
        @media(max-width:650px) { .formal-academic-report .report-header { padding:20px; } .formal-academic-report .report-logo { width:90px; height:90px; } .formal-academic-report .report-body { padding:22px 16px; } .formal-academic-report .report-kpis { gap:6px; } .formal-academic-report .report-kpi { padding:12px 8px; } .formal-academic-report .report-table th, .formal-academic-report .report-table td { padding:8px; } }
        @media print { @page { size:A4; margin:12mm; } body { margin:0; } .formal-academic-report { max-width:none !important; print-color-adjust:exact; -webkit-print-color-adjust:exact; } .formal-academic-report .report-header { break-inside:avoid; } .formal-academic-report .report-section { break-inside:auto; } .formal-academic-report .report-table-wrap { overflow:visible; border-radius:0; } .formal-academic-report .report-table thead { display:table-header-group; } .formal-academic-report .report-table tr { break-inside:avoid; } }
      `}</style>
      <header className="report-header">
        <div>
          <h1 style={{ fontSize: 30, margin: 0 }}>{reportTitle(report)}</h1>
          <p style={{ color: "#dbc5a7", margin: "6px 0" }}>{brandName}</p>
          <div style={{ fontSize: 14, color: "#e1e9ee" }}>
            {report.semesterName} · {report.options.from} – {report.options.to}
            {report.options.donorName && <> · مقدم إلى {report.options.donorName}</>}
          </div>
          <div style={{ fontSize: 12, color: "#e1e9ee", marginTop: 8 }}>
            {approval ? `اعتمده ${approval.by} · ${approval.at}` : "مسودة غير معتمدة"}
          </div>
        </div>
        {reportLogoUrl ? (
          <img className="report-logo" src={reportLogoUrl} alt={`شعار ${brandName}`} />
        ) : (
          <div
            className="report-logo"
            aria-label={brandName}
            style={{
              color: palette.navy,
              display: "grid",
              placeItems: "center",
              textAlign: "center",
              fontWeight: "bold",
            }}
          >
            {brandName}
          </div>
        )}
      </header>

      <div className="report-body">
        <section className="report-summary">
          <h2 style={{ margin: "0 0 12px", fontSize: 24 }}>الملخص التنفيذي</h2>
          <strong style={{ fontSize: 21 }}>
            {isStudent
              ? `${student?.name ?? ""} · ${report.halaqat[0]?.name ?? ""}`
              : `${report.people} طالب${isComplex ? ` من ${report.halaqat.length} حلقة` : ` في ${report.halaqat[0]?.name ?? "الحلقة"}`}`}
          </strong>
        </section>

        <div className="report-kpis">
          {[
            {
              label: isStudent ? "الحضور" : "الطلاب",
              value: isStudent ? String(t.present + t.late) : String(report.people),
              detail: isStudent ? "يوم" : "طالب",
            },
            {
              label: isStudent ? "عدم الحضور" : isComplex ? "الحلقات" : "الحضور",
              value: isStudent
                ? String(t.excused + t.absent)
                : isComplex
                  ? String(report.halaqat.length)
                  : String(t.present + t.late),
              detail: isStudent ? "يوم" : isComplex ? "حلقة" : "حالة",
            },
            {
              label: "نسبة الحضور",
              value: percent(attendancePct(t)),
              detail: `${t.present + t.late} من ${t.recorded} حالة مرصودة`,
            },
          ].map((item) => (
            <div className="report-kpi" key={item.label}>
              <div style={{ color: "#7b6e60", fontSize: 15 }}>{item.label}</div>
              <strong style={{ display: "block", color: palette.navy, fontSize: 28, marginTop: 5 }}>
                {item.value}
              </strong>
              <small style={{ color: palette.muted, fontSize: 12 }}>{item.detail}</small>
            </div>
          ))}
        </div>

        {rows.length > 0 && (
          <section className="report-section">
            <h3>الإنجاز القرآني</h3>
            <div className="report-table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>المؤشر</th>
                    <th>النتيجة</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.label}>
                      <td style={{ fontWeight: "bold" }}>{row.label}</td>
                      <td>
                        <strong style={{ color: "#a27636", fontSize: 20 }}>{row.value}</strong>
                        {row.detail && (
                          <div style={{ color: palette.muted, fontSize: 12 }}>{row.detail}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {report.options.focus === "attendance" && (
          <section className="report-section">
            <h3>تفاصيل الحضور</h3>
            <div className="report-table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>حاضر</th>
                    <th>متأخر</th>
                    <th>مستأذن</th>
                    <th>غائب</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{t.present}</td>
                    <td>{t.late}</td>
                    <td>{t.excused}</td>
                    <td>{t.absent}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        )}

        {isStudent && student?.recommendation && (
          <section className="report-section">
            <h3>توصية المعلم</h3>
            <div className="report-summary">{student.recommendation}</div>
          </section>
        )}

        {isComplex && (
          <section className="report-section">
            <h3>الحلقات</h3>
            <div className="report-table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>الحلقة</th>
                    <th>الطلاب</th>
                    {columns.map((column) => (
                      <th key={column}>{columnLabels[column]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.halaqat.map((h) => (
                    <tr key={h.id}>
                      <td>{h.name}</td>
                      <td>{h.students.length}</td>
                      {columns.map((column) => (
                        <td key={column}>{circleValue(h.period, column, h.isTalqeen)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {report.options.named && !isStudent && (
          <section className="report-section">
            <h3>تفاصيل الطلاب</h3>
            <div className="report-table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>الطالب</th>
                    <th>الحلقة</th>
                    <th>الحضور</th>
                    <th>الحفظ</th>
                    <th>الربط</th>
                    <th>المراجعة</th>
                  </tr>
                </thead>
                <tbody>
                  {report.halaqat
                    .flatMap((h) => h.students)
                    .map((s) => (
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td>{s.halaqaName}</td>
                        <td>
                          {s.period.present + s.period.late}/{s.period.recorded}
                        </td>
                        <td>
                          {s.isTalqeen ? "—" : `${s.period.hifzFaces}/${s.period.hifzTarget}`}
                        </td>
                        <td>{s.isTalqeen ? "—" : percent(resultPct(s.period, "rabt"))}</td>
                        <td>{s.isTalqeen ? "—" : percent(resultPct(s.period, "muraja"))}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </article>
  );
}
