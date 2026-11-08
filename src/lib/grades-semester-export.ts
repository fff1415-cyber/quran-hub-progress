import * as XLSX from "xlsx";
import {
  loadStudents,
  loadHalaqat,
  loadGrades,
  weekPercentage,
  HIFZ_LABELS,
  DAYS,
} from "@/lib/mock-data";
import { weekLabel } from "@/lib/arabic-numbers";

const ATT_LABEL: Record<string, string> = {
  present: "حاضر",
  late: "متأخر",
  excused: "مستأذن",
  absent: "غائب",
  "": "—",
};

function safeFilePart(name: string): string {
  return name.replace(/[^\w\u0600-\u06FF-]+/g, "_").replace(/_+/g, "_").slice(0, 80) || "فصل";
}

/** Export all students' grades for weeks 1..weekCount (full previous semester archive). */
export function exportSemesterGradesExcel(semesterName: string, weekCount: number): boolean {
  const students = loadStudents();
  const halaqat = loadHalaqat();
  const grades = loadGrades();

  if (students.length === 0) return false;

  const lo = 1;
  const hi = Math.max(1, weekCount);
  const wb = XLSX.utils.book_new();

  const summary: (string | number)[][] = [
    ["الطالب", "الحلقة", "المستوى", "النوع", "الأسبوع", "النسبة %", "غياب", "تأخر", "استئذان", "حفظ", "مراجعة ✓", "مراجعة ✗", "ربط ✓", "ربط ✗"],
  ];

  students.forEach((s) => {
    const h = halaqat.find((x) => x.id === s.halaqaId);
    for (let w = lo; w <= hi; w++) {
      const week = grades[s.id]?.[w];
      if (!week) continue;
      const pct = weekPercentage(week, !!h?.isTalqeen, s.levelType);
      let abs = 0;
      let late = 0;
      let exc = 0;
      let hifz = 0;
      let mp = 0;
      let mf = 0;
      let rp = 0;
      let rf = 0;
      DAYS.forEach((d) => {
        const e = week.days[d.key];
        if (!e) return;
        if (e.attendance === "absent") abs++;
        else if (e.attendance === "late") late++;
        else if (e.attendance === "excused") exc++;
        if (e.hifz) hifz++;
        if (e.muraja === "pass") mp++;
        else if (e.muraja === "fail") mf++;
        if (e.rabt === "pass") rp++;
        else if (e.rabt === "fail") rf++;
      });
      summary.push([
        s.name,
        h?.name || "—",
        s.level,
        s.levelType === "gold" ? "ذهبي" : "فضي",
        weekLabel(w),
        pct,
        abs,
        late,
        exc,
        hifz,
        mp,
        mf,
        rp,
        rf,
      ]);
    }
  });

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "ملخص الأسابيع");

  const daily: (string | number)[][] = [
    ["الطالب", "الحلقة", "الأسبوع", "اليوم", "الحضور", "الحفظ", "الربط", "المراجعة"],
  ];

  students.forEach((s) => {
    const h = halaqat.find((x) => x.id === s.halaqaId);
    for (let w = lo; w <= hi; w++) {
      const week = grades[s.id]?.[w];
      if (!week) continue;
      DAYS.forEach((d) => {
        const e = week.days[d.key];
        if (!e) return;
        if (!e.attendance && !e.hifz && !e.rabt && !e.muraja) return;
        daily.push([
          s.name,
          h?.name || "—",
          weekLabel(w),
          d.label,
          ATT_LABEL[e.attendance] || "—",
          HIFZ_LABELS[e.hifz] || "—",
          e.rabt === "pass" ? "✓" : e.rabt === "fail" ? "✗" : "—",
          e.muraja === "pass" ? "✓" : e.muraja === "fail" ? "✗" : "—",
        ]);
      });
    }
  });

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(daily), "تفاصيل يومية");

  const fname = `درجات_${safeFilePart(semesterName)}_${weekLabel(hi)}.xlsx`;
  XLSX.writeFile(wb, fname);
  return true;
}
