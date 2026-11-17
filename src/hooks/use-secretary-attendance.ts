import { useEffect, useState } from "react";
import { fetchActiveCalendar } from "@/lib/academic-context";
import { refreshConfirmedGrades } from "@/lib/grade-sync";
import { GRADES_CHANGED_EVENT, loadGrades, loadStudents, type GradesStore, type Student } from "@/lib/mock-data";
import { getCalendarDayKey } from "@/lib/operational-date";

export type SecretaryAttendance = {
  rows: { s: Student; status: "absent" | "late" }[];
  todayKey: string;
  loading: boolean;
  error: boolean;
};

export function secretaryAttendanceRows(students: Student[], grades: GradesStore, week: number, day: string): SecretaryAttendance["rows"] {
  return students.flatMap(s => {
    const status = grades[s.id]?.[week]?.days?.[day]?.attendance;
    return status === "absent" || status === "late" ? [{ s, status }] : [];
  });
}

/** Read-only refresh: never flush another user's drafts or write attendance. */
export function useSecretaryAttendance(): SecretaryAttendance {
  const [view, setView] = useState<SecretaryAttendance>({ rows: [], todayKey: getCalendarDayKey(), loading: true, error: false });
  useEffect(() => {
    let active = true, running = false;
    let week: number | null = null;
    const show = (grades = loadGrades()) => {
      if (!active || week === null) return;
      const todayKey = getCalendarDayKey();
      setView(previous => ({ ...previous, todayKey, rows: secretaryAttendanceRows(loadStudents(), grades, week!, todayKey) }));
    };
    const changed = () => show();
    const refresh = async () => {
      if (!active || running || document.visibilityState === "hidden") return;
      running = true;
      try {
        const calendar = await fetchActiveCalendar();
        if (!calendar.semester) throw Error("No active semester");
        const grades = await refreshConfirmedGrades();
        if (!active) return;
        week = calendar.currentWeekNumber;
        show(grades);
        setView(previous => ({ ...previous, loading: false, error: false }));
      } catch {
        if (active) setView(previous => ({ ...previous, loading: false, error: true }));
      } finally { running = false; }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 60_000);
    window.addEventListener(GRADES_CHANGED_EVENT, changed);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener(GRADES_CHANGED_EVENT, changed);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return view;
}
