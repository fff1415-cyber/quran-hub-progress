import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  loadStudents, loadHalaqat, loadGrades, loadAttendanceArchive, loadSardHistory,
  studentStats, weekPercentage, HIFZ_LABELS, DAYS,
  type Student,
} from "@/lib/mock-data";
import { weekLabel } from "@/lib/arabic-numbers";
import { Download, Search, FileSpreadsheet, User } from "lucide-react";
import { toast } from "sonner";

const ATT_LABEL: Record<string, string> = {
  present: "حاضر", late: "متأخر", excused: "مستأذن", absent: "غائب", "": "—",
};

export function GradesExport() {
  const [fromWeek, setFromWeek] = useState(1);
  const [toWeek, setToWeek] = useState(18);
  const [halaqaId, setHalaqaId] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  const halaqat = loadHalaqat();
  const students = loadStudents();
  const grades = loadGrades();
  const archive = loadAttendanceArchive();
  const sardHistory = loadSardHistory();

  const filteredForSearch = useMemo(() => {
    const q = search.trim();
    if (!q) return [];
    return students.filter((s) => s.name.includes(q) || s.nationalId.includes(q)).slice(0, 12);
  }, [search, students]);

  const exportGrades = () => {
    const lo = Math.min(fromWeek, toWeek);
    const hi = Math.max(fromWeek, toWeek);
    const list = halaqaId === "all" ? students : students.filter((s) => s.halaqaId === halaqaId);
    if (list.length === 0) { toast.error("لا يوجد طلاب"); return; }

    const wb = XLSX.utils.book_new();

    // Sheet 1: Summary per student per week
    const summary: (string | number)[][] = [["الطالب", "الحلقة", "المستوى", "النوع", "الأسبوع", "النسبة %", "غياب", "تأخر", "استئذان", "حفظ", "مراجعة ✓", "مراجعة ✗", "ربط ✓", "ربط ✗"]];
    list.forEach((s) => {
      const h = halaqat.find((x) => x.id === s.halaqaId);
      for (let w = lo; w <= hi; w++) {
        const week = grades[s.id]?.[w];
        if (!week) continue;
        const pct = weekPercentage(week, !!h?.isTalqeen);
        let abs=0, late=0, exc=0, hifz=0, mp=0, mf=0, rp=0, rf=0;
        DAYS.forEach((d) => {
          const e = week.days[d.key]; if (!e) return;
          if (e.attendance === "absent") abs++;
          else if (e.attendance === "late") late++;
          else if (e.attendance === "excused") exc++;
          if (e.hifz) hifz++;
          if (e.muraja === "pass") mp++; else if (e.muraja === "fail") mf++;
          if (e.rabt === "pass") rp++; else if (e.rabt === "fail") rf++;
        });
        summary.push([s.name, h?.name || "—", s.level, s.levelType === "gold" ? "ذهبي" : "فضي", weekLabel(w), pct, abs, late, exc, hifz, mp, mf, rp, rf]);
      }
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "ملخص الأسابيع");

    // Sheet 2: Daily details (attendance, hifz, rabt, muraja per day)
    const daily: (string | number)[][] = [["الطالب", "الحلقة", "الأسبوع", "اليوم", "الحضور", "الحفظ", "الربط", "المراجعة"]];
    list.forEach((s) => {
      const h = halaqat.find((x) => x.id === s.halaqaId);
      for (let w = lo; w <= hi; w++) {
        const week = grades[s.id]?.[w]; if (!week) continue;
        DAYS.forEach((d) => {
          const e = week.days[d.key]; if (!e) return;
          if (!e.attendance && !e.hifz && !e.rabt && !e.muraja) return;
          daily.push([
            s.name, h?.name || "—", weekLabel(w), d.label,
            ATT_LABEL[e.attendance] || "—",
            HIFZ_LABELS[e.hifz] || "—",
            e.rabt === "pass" ? "✓" : e.rabt === "fail" ? "✗" : "—",
            e.muraja === "pass" ? "✓" : e.muraja === "fail" ? "✗" : "—",
          ]);
        });
      }
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(daily), "تفاصيل يومية");

    const fname = `درجات_من_${weekLabel(lo)}_إلى_${weekLabel(hi)}.xlsx`;
    XLSX.writeFile(wb, fname);
    toast.success("تم تصدير الملف");
  };

  const exportStudentReport = (s: Student) => {
    const h = halaqat.find((x) => x.id === s.halaqaId);
    const st = studentStats(s.id, grades);
    const wb = XLSX.utils.book_new();

    const info: (string | number)[][] = [
      ["تقرير الطالب"],
      ["الاسم", s.name],
      ["الحلقة", h?.name || "—"],
      ["المستوى", `${s.levelType === "gold" ? "ذهبي" : "فضي"} - ${s.level}`],
      ["رقم الهوية", s.nationalId],
      ["ولي الأمر", s.parentPhone],
      [],
      ["الإحصائيات"],
      ["عدد الأسابيع المسجلة", st.weeksRecorded],
      ["عدد مرات الحفظ", st.hifzCount],
      ["عدد مرات الغياب", st.absentCount],
      ["عدد مرات التأخر", st.lateCount],
      ["عدد مرات الاستئذان", st.excusedCount],
      ["مراجعة ناجحة", st.murajaPass],
      ["مراجعة راسبة", st.murajaFail],
      ["ربط ناجح", st.rabtPass],
      ["ربط راسب", st.rabtFail],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(info), "معلومات");

    // Weekly breakdown
    const weekRows: (string | number)[][] = [["الأسبوع", "النسبة %", "غياب", "تأخر", "حفظ", "مراجعة ✓/✗", "ربط ✓/✗"]];
    const weeks = grades[s.id] || {};
    Object.keys(weeks).map(Number).sort((a, b) => a - b).forEach((w) => {
      const week = weeks[w];
      let abs=0, late=0, hifz=0, mp=0, mf=0, rp=0, rf=0;
      DAYS.forEach((d) => {
        const e = week.days[d.key]; if (!e) return;
        if (e.attendance === "absent") abs++;
        else if (e.attendance === "late") late++;
        if (e.hifz) hifz++;
        if (e.muraja === "pass") mp++; else if (e.muraja === "fail") mf++;
        if (e.rabt === "pass") rp++; else if (e.rabt === "fail") rf++;
      });
      weekRows.push([weekLabel(w), weekPercentage(week, !!h?.isTalqeen), abs, late, hifz, `${mp}/${mf}`, `${rp}/${rf}`]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(weekRows), "الأسابيع");

    // Attendance archive for this student
    const attRows: (string | number)[][] = [["النوع", "التاريخ", "اليوم"]];
    archive.filter((a) => a.studentId === s.id).forEach((a) => {
      attRows.push([a.type === "absent" ? "غياب" : a.type === "late" ? "تأخر" : "استئذان", a.date, a.dayKey]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(attRows), "سجل الحضور");

    // Sard history
    const sardRows: (string | number)[][] = [["الأسبوع", "المحاولة", "النتيجة", "النسبة %", "التاريخ"]];
    sardHistory.filter((x) => x.studentId === s.id).forEach((x) => {
      sardRows.push([weekLabel(x.week), x.attempt, x.result === "passed" ? "ناجح" : "راسب", x.percent, new Date(x.at).toLocaleDateString("ar")]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sardRows), "سجل السرد");

    XLSX.writeFile(wb, `تقرير_${s.name}.xlsx`);
    toast.success("تم تصدير التقرير");
  };

  const selectedStats = selectedStudent ? studentStats(selectedStudent.id, grades) : null;
  const selectedH = selectedStudent ? halaqat.find((x) => x.id === selectedStudent.halaqaId) : null;

  return (
    <div className="glass-card rounded-2xl p-6 mb-6">
      <h2 className="text-lg font-bold text-primary mb-4 flex items-center gap-2">
        <FileSpreadsheet className="w-5 h-5" /> تصدير الدرجات إلى Excel
      </h2>

      <div className="grid sm:grid-cols-4 gap-3 mb-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">من أسبوع</label>
          <input type="number" min={1} max={18} value={fromWeek} onChange={(e) => setFromWeek(parseInt(e.target.value) || 1)}
            className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">إلى أسبوع</label>
          <input type="number" min={1} max={18} value={toWeek} onChange={(e) => setToWeek(parseInt(e.target.value) || 1)}
            className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-muted-foreground block mb-1">الحلقة</label>
          <select value={halaqaId} onChange={(e) => setHalaqaId(e.target.value === "all" ? "all" : parseInt(e.target.value))}
            className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm">
            <option value="all">جميع الحلقات</option>
            {halaqat.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>
      </div>
      <button onClick={exportGrades} className="px-4 py-2 rounded-lg gold-gradient text-primary-foreground font-bold flex items-center gap-2">
        <Download className="w-4 h-4" /> تصدير (حضور · حفظ · ربط · مراجعة)
      </button>

      <div className="mt-6 pt-6 border-t border-border">
        <h3 className="font-bold text-primary mb-3 flex items-center gap-2">
          <Search className="w-4 h-4" /> البحث عن طالب وإصدار تقرير كامل
        </h3>
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setSelectedStudent(null); }}
          placeholder="ابحث بالاسم أو رقم الهوية..."
          className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm mb-2"
        />
        {filteredForSearch.length > 0 && !selectedStudent && (
          <div className="space-y-1 mb-3 max-h-60 overflow-auto">
            {filteredForSearch.map((s) => {
              const h = halaqat.find((x) => x.id === s.halaqaId);
              return (
                <button key={s.id} onClick={() => setSelectedStudent(s)}
                  className="w-full text-right p-2 rounded bg-secondary/40 hover:bg-primary/10 text-sm flex justify-between">
                  <span className="font-bold">{s.name}</span>
                  <span className="text-xs text-muted-foreground">{h?.name}</span>
                </button>
              );
            })}
          </div>
        )}
        {selectedStudent && selectedStats && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-start justify-between flex-wrap gap-2 mb-3">
              <div>
                <div className="font-bold flex items-center gap-2"><User className="w-4 h-4" />{selectedStudent.name}</div>
                <div className="text-xs text-muted-foreground">{selectedH?.name} · {selectedStudent.levelType === "gold" ? "ذهبي" : "فضي"} - مستوى {selectedStudent.level}</div>
              </div>
              <button onClick={() => exportStudentReport(selectedStudent)}
                className="px-3 py-2 rounded-lg gold-gradient text-primary-foreground font-bold flex items-center gap-1 text-sm">
                <Download className="w-4 h-4" /> تصدير التقرير
              </button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center text-xs">
              <Mini label="أسابيع" v={selectedStats.weeksRecorded} />
              <Mini label="حفظ" v={selectedStats.hifzCount} />
              <Mini label="غياب" v={selectedStats.absentCount} tone="destructive" />
              <Mini label="تأخر" v={selectedStats.lateCount} tone="warning" />
              <Mini label="استئذان" v={selectedStats.excusedCount} />
              <Mini label="مراجعة ✓" v={selectedStats.murajaPass} tone="success" />
              <Mini label="مراجعة ✗" v={selectedStats.murajaFail} tone="destructive" />
              <Mini label="ربط ✓" v={selectedStats.rabtPass} tone="success" />
              <Mini label="ربط ✗" v={selectedStats.rabtFail} tone="destructive" />
            </div>
          </div>
        )}
        {search && filteredForSearch.length === 0 && !selectedStudent && (
          <p className="text-xs text-muted-foreground text-center py-3">لا توجد نتائج</p>
        )}
      </div>
    </div>
  );
}

function Mini({ label, v, tone }: { label: string; v: number; tone?: "destructive" | "warning" | "success" }) {
  const c = tone === "destructive" ? "bg-destructive/10 text-destructive"
    : tone === "warning" ? "bg-warning/10 text-warning"
    : tone === "success" ? "bg-success/10 text-success"
    : "bg-secondary/50";
  return <div className={`rounded-lg p-2 ${c}`}><div className="text-base font-bold">{v}</div><div className="text-[10px] opacity-80">{label}</div></div>;
}
