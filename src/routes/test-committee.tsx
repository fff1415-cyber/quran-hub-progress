import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getSessionName, getSessionRole } from "@/lib/session-role";
import { loadHalaqat } from "@/lib/mock-data";
import { syncFromCloud } from "@/lib/cloud-sync";
import { fetchActiveCalendar, type AcademicCalendar } from "@/lib/academic-context";
import { ensureWeeklyTestsSemester } from "@/lib/weekly-tests";
import { AppHeader } from "@/components/AppHeader";
import { TeacherWeeklyTestsPanel } from "@/components/TeacherWeeklyTestsPanel";
import { CommitteeTestsReport } from "@/components/CommitteeTestsReport";
import { StaffAttendancePromptDialog } from "@/components/StaffAttendancePromptDialog";
import { COMPLEX_STAFF_HALAQA_ID, COMPLEX_STAFF_HALAQA_NAME } from "@/lib/staff-attendance";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { Toaster } from "sonner";

export const Route = createFileRoute("/test-committee")({ component: TestCommitteePage });

export function TestCommitteePage() {
  const role = getSessionRole();
  const name = getSessionName();
  const chair = role === "test_chair";
  const [calendar, setCalendar] = useState<AcademicCalendar | null>(null);
  const [halaqat, setHalaqat] = useState(() => loadHalaqat());
  const [halaqaId, setHalaqaId] = useState(0);
  const [weekNum, setWeekNum] = useState(0);
  const [view, setView] = useState<"tests" | "reports">("tests");
  const [error, setError] = useState("");

  useEffect(() => {
    if (role !== "test_member" && role !== "test_chair") return;
    let active = true;
    void syncFromCloud({ force: true })
      .then(async () => {
        const cal = await fetchActiveCalendar(true);
        if (!active) return;
        ensureWeeklyTestsSemester(cal.semester?.id ?? null);
        setHalaqat(loadHalaqat());
        setCalendar(cal);
        setWeekNum(cal.currentWeekNumber);
      })
      .catch(() => {
        if (active) setError("تعذر تحميل بيانات الاختبارات. حاول تحديث الصفحة.");
      });
    return () => {
      active = false;
    };
  }, [role]);

  if (role !== "test_member" && role !== "test_chair") {
    return <div className="p-8 text-center">هذه الصفحة مخصصة للجنة الاختبارات فقط.</div>;
  }

  const halaqa = halaqat.find((item) => item.id === halaqaId);
  return (
    <div className="min-h-screen">
      <Toaster position="top-center" richColors />
      {chair && name && (
        <StaffAttendancePromptDialog
          role={role}
          name={name}
          halaqaId={COMPLEX_STAFF_HALAQA_ID}
          halaqaName={COMPLEX_STAFF_HALAQA_NAME}
        />
      )}
      <AppHeader title="لجنة الاختبارات" subtitle={chair ? "رئيس اللجنة" : "عضو اللجنة"} />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        <header className="glass-card rounded-2xl p-5 flex gap-3 items-center">
          <ClipboardCheck className="text-primary" />
          <div>
            <h1 className="text-xl font-bold">مرحبًا {name}</h1>
            <p className="text-sm text-muted-foreground">
              {chair ? "الاختبارات ونتائج أعضاء اللجنة" : "اختر الحلقة لإجراء الاختبارات"}
            </p>
          </div>
        </header>
        {chair && (
          <div className="flex gap-2">
            <button
              type="button"
              className={`px-4 py-2 rounded-lg ${view === "tests" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
              onClick={() => setView("tests")}
            >
              الاختبارات
            </button>
            <button
              type="button"
              className={`px-4 py-2 rounded-lg ${view === "reports" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
              onClick={() => setView("reports")}
            >
              النتائج والتقارير
            </button>
          </div>
        )}
        {error && <p className="text-destructive">{error}</p>}
        {!calendar && !error && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> جاري تحميل الاختبارات...
          </div>
        )}
        {calendar && view === "tests" && (
          <>
            <label className="glass-card rounded-xl p-4 flex flex-wrap items-center gap-3 font-bold">
              اختر الحلقة
              <select
                value={halaqaId}
                onChange={(e) => setHalaqaId(Number(e.target.value))}
                className="p-2 min-w-[240px] rounded-lg bg-input border border-border"
                aria-label="الحلقة"
              >
                <option value={0}>— اختر الحلقة —</option>
                {halaqat.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            {halaqa && (
              <TeacherWeeklyTestsPanel
                key={halaqa.id}
                halaqaId={halaqa.id}
                halaqaName={halaqa.name}
                isTalqeen={halaqa.isTalqeen}
                calendar={calendar}
                weekNum={weekNum}
                onWeekChange={setWeekNum}
                viewerRole="manager"
              />
            )}
          </>
        )}
        {calendar && chair && view === "reports" && <CommitteeTestsReport chair />}
      </main>
    </div>
  );
}
