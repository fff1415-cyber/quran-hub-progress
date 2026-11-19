import { useEffect, useState } from "react";
import { fetchActiveCalendar, resolveWeekForDate, type AcademicCalendar } from "@/lib/academic-context";
import { currentGradeOutbox, refreshConfirmedGrades } from "@/lib/grade-sync";
import { GRADES_CHANGED_EVENT, loadGrades, loadStudents, type GradesStore, type Student } from "@/lib/mock-data";
import { getCalendarDayKey, getCalendarIsoDate, isoDateToDayKey } from "@/lib/operational-date";

export type SecretaryAttendance = {
  rows: { s: Student; status: "absent" | "late" }[];
  todayKey: string;
  loading: boolean;
  error: boolean;
  date: string;
  selectedDate: string;
  minDate: string;
  maxDate: string;
  setDate: (date: string) => void;
};

export function secretaryAttendanceRows(students: Student[], grades: GradesStore, week: number, day: string): SecretaryAttendance["rows"] {
  return students.flatMap(s => {
    const status = grades[s.id]?.[week]?.days?.[day]?.attendance;
    return status === "absent" || status === "late" ? [{ s, status }] : [];
  });
}

/** Read-only refresh: never flush another user's drafts or write attendance. */
export function useSecretaryAttendance(): SecretaryAttendance {
  const [selectedDate, setDate] = useState("");
  const [view, setView] = useState<Omit<SecretaryAttendance, "selectedDate" | "setDate">>({
    rows: [], todayKey: getCalendarDayKey(), date: getCalendarIsoDate(), minDate: "", maxDate: getCalendarIsoDate(), loading: true, error: false,
  });
  useEffect(() => {
    let active = true, running = false;
    let calendar: AcademicCalendar | null = null;
    setView(previous => ({ ...previous, loading: true }));
    const show = (grades = loadGrades()) => {
      if (!active || !calendar?.semester) return;
      const date = selectedDate || getCalendarIsoDate();
      const maxDate = [getCalendarIsoDate(), calendar.weeks.at(-1)?.end_date || getCalendarIsoDate()].sort()[0];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < calendar.semester.start_date || date > maxDate) throw Error("Date outside semester");
      const todayKey = isoDateToDayKey(date);
      const week = resolveWeekForDate(calendar.weeks, date, calendar);
      setView(previous => ({ ...previous, date, todayKey, minDate: calendar!.semester!.start_date, maxDate,
        rows: secretaryAttendanceRows(loadStudents(), grades, week, todayKey) }));
    };
    const changed = () => { try { show(); } catch { /* A refresh reports an invalid date without reinterpreting it. */ } };
    const refresh = async () => {
      if (!active || running || document.visibilityState === "hidden") return;
      running = true;
      try {
        const nextCalendar = await fetchActiveCalendar();
        if (!nextCalendar.semester) throw Error("No active semester");
        const grades = await refreshConfirmedGrades();
        if (!active) return;
        if (currentGradeOutbox()?.snapshot()?.calendar_context.active_semester_id !== nextCalendar.semester.id) throw Error("Calendar does not match confirmed grades");
        calendar = nextCalendar;
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
  }, [selectedDate]);
  return { ...view, selectedDate: selectedDate || getCalendarIsoDate(), setDate };
}
