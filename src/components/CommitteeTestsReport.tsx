import { useEffect, useMemo, useState } from "react";
import { getToken } from "@/lib/auth-session";
import { buildRphpUrl } from "@/lib/api-base";
import { secureListAppState } from "@/lib/secure-data.functions";
import { loadHalaqat, loadStudents } from "@/lib/mock-data";
import {
  getStudentWeeklyTests,
  loadWeeklyTests,
  loadWeeklyTestsSettings,
  type WeeklyTestsStore,
  type WeeklyTestResult,
  WEEKLY_TESTS_CHANGED,
} from "@/lib/weekly-tests";
import { WeeklyTestsOverviewPanel } from "@/components/WeeklyTestsOverviewPanel";

type Member = { id: string; name: string };
type Entry = {
  studentId: string;
  student: string;
  halaqa: string;
  week: number;
  test: string;
  result: Exclude<WeeklyTestResult, "">;
  byId?: string;
  byName: string;
  at?: string;
};

export function CommitteeTestsReport({ chair = false }: { chair?: boolean }) {
  const [store, setStore] = useState<WeeklyTestsStore>(() => loadWeeklyTests());
  const [members, setMembers] = useState<Member[]>([]);
  const [memberId, setMemberId] = useState("all");
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const settings = loadWeeklyTestsSettings();
  const students = loadStudents();
  const halaqat = loadHalaqat();

  useEffect(() => {
    let active = true;
    const localRefresh = () => setStore(loadWeeklyTests());
    window.addEventListener(WEEKLY_TESTS_CHANGED, localRefresh);
    const token = getToken();
    if (token) {
      void secureListAppState({ data: { token, key: "weekly_tests" } })
        .then((rows) => {
          const remote = rows.find((row) => row.key === "weekly_tests")?.value;
          if (active && remote && typeof remote === "object" && !Array.isArray(remote))
            setStore(remote as WeeklyTestsStore);
        })
        .catch(() => {
          if (active)
            setError("تعذر تحديث النتائج من الخادم؛ تُعرض البيانات المحفوظة على هذا الجهاز.");
        });
      if (chair) {
        void fetch(buildRphpUrl("/test-committee/members"), {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then(async (response) => {
            if (!response.ok) throw new Error();
            return response.json() as Promise<Member[]>;
          })
          .then((rows) => {
            if (active) setMembers(rows);
          })
          .catch(() => {
            if (active) setError("تعذر تحميل أعضاء اللجنة.");
          });
      }
    }
    return () => {
      active = false;
      window.removeEventListener(WEEKLY_TESTS_CHANGED, localRefresh);
    };
  }, [chair, refreshKey]);

  const entries = useMemo(() => {
    const all: Entry[] = [];
    for (const student of students) {
      for (const week of Object.keys(store[student.id] ?? {})) {
        const weekNum = Number(week);
        const row = getStudentWeeklyTests(store, student.id, weekNum, settings);
        const add = (
          test: string,
          result: WeeklyTestResult,
          index: number,
          kind: "muraja" | "rabt",
        ) => {
          if (!result) return;
          const meta = row.attribution?.[kind]?.[index];
          all.push({
            studentId: student.id,
            student: student.name,
            halaqa: halaqat.find((h) => h.id === student.halaqaId)?.name ?? "—",
            week: weekNum,
            test,
            result,
            byId: meta?.byId,
            byName: meta?.byName || "غير محدد",
            at: meta?.at,
          });
        };
        row.muraja.forEach((result, index) => add(`مراجعة ${index + 1}`, result, index, "muraja"));
        if (Array.isArray(row.rabt))
          row.rabt.forEach((result, index) => add(`ربط ${index + 1}`, result, index, "rabt"));
        else add("ربط", row.rabt, 0, "rabt");
      }
    }
    return all.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  }, [store, students, halaqat, settings]);

  const visible = memberId === "all" ? entries : entries.filter((entry) => entry.byId === memberId);

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-warning">{error}</p>}
      {chair && (
        <section className="glass-card rounded-2xl p-5 space-y-3">
          <h2 className="text-lg font-bold text-primary">ملخص أعضاء لجنة الاختبارات</h2>
          <p className="text-xs text-muted-foreground">
            عدد الطلاب فريد لكل عضو؛ النجاح والرسوب يُحسبان لكل خانة اختبار مسجلة. النتائج السابقة
            التي لا تحمل اسم مختبر تُعرض في الجدول دون نسبتها إلى عضو.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="border-b">
                  <th className="p-2 text-right">العضو</th>
                  <th>طلاب اختبرهم</th>
                  <th>ناجح</th>
                  <th>راسب</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const own = entries.filter((entry) => entry.byId === member.id);
                  return (
                    <tr key={member.id} className="border-b border-border/40">
                      <td className="p-2">{member.name}</td>
                      <td className="text-center">
                        {new Set(own.map((entry) => entry.studentId)).size}
                      </td>
                      <td className="text-center text-success">
                        {own.filter((entry) => entry.result === "pass").length}
                      </td>
                      <td className="text-center text-destructive">
                        {own.filter((entry) => entry.result === "fail").length}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <section className="glass-card rounded-2xl p-5 space-y-3">
        <div className="flex justify-between gap-3 flex-wrap items-center">
          <h2 className="text-lg font-bold text-primary">نتائج الاختبارات</h2>
          <button type="button" onClick={() => setRefreshKey((n) => n + 1)} className="px-3 py-2 rounded-lg border border-border text-sm">تحديث النتائج</button>
          {chair && (
            <select
              aria-label="تصفية حسب عضو اللجنة"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              className="p-2 rounded-lg bg-input border border-border"
            >
              <option value="all">جميع الأعضاء</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد نتائج مسجلة</p>
        ) : (
          <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
            <table className="w-full min-w-[650px] text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2 text-right">الطالب والحلقة</th>
                  <th>الأسبوع</th>
                  <th>الاختبار</th>
                  <th>النتيجة</th>
                  <th>المختبر</th>
                  <th>تاريخ الاختبار</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((entry, index) => (
                  <tr
                    key={`${entry.studentId}-${entry.week}-${entry.test}-${index}`}
                    className="border-b border-border/40"
                  >
                    <td className="p-2">
                      {entry.student}
                      <div className="text-xs text-muted-foreground">{entry.halaqa}</div>
                    </td>
                    <td className="text-center">{entry.week}</td>
                    <td className="text-center">{entry.test}</td>
                    <td
                      className={`text-center ${entry.result === "pass" ? "text-success" : "text-destructive"}`}
                    >
                      {entry.result === "pass" ? "ناجح" : "راسب"}
                    </td>
                    <td className="text-center">{entry.byName}</td>
                    <td className="text-center">
                      {entry.at ? new Date(entry.at).toLocaleString("ar-SA") : "غير مسجل"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <WeeklyTestsOverviewPanel storeOverride={store} />
    </div>
  );
}
