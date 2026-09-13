import * as XLSX from "xlsx";
import type { Halaqa } from "@/lib/mock-data";
import {
  COMPLEX_STAFF_HALAQA_ID,
  COMPLEX_STAFF_HALAQA_NAME,
  STAFF_CHECKIN_ROLES,
  STAFF_STATUS_LABEL,
  canStaffCheckIn,
  formatTime12,
  getCalendarIsoDate,
  isHalaqaBoundStaffRole,
  loadStaffCheckIns,
  staffRoleLabel,
  staffUserKey,
  type StaffCheckIn,
} from "@/lib/staff-attendance";

export interface ExpectedStaffMember {
  userKey: string;
  role: string;
  name: string;
  halaqaId: number;
  halaqaName: string;
}

export interface StaffReportFilters {
  fromIso: string;
  toIso: string;
  role: string;
  halaqaId: number | "all";
  nameQuery: string;
}

export interface StaffSummaryRow {
  userKey: string;
  name: string;
  role: string;
  halaqaName: string;
  checkInDays: number;
  presentDays: number;
  lateDays: number;
  absentDays: number;
}

export interface StaffReportStats {
  totalCheckIns: number;
  presentCount: number;
  lateCount: number;
  uniqueStaff: number;
  absentSlots: number;
  daysInRange: number;
}

export function datesBetweenInclusive(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  const d = new Date(`${fromIso}T12:00:00`);
  const last = new Date(`${toIso}T12:00:00`);
  if (Number.isNaN(d.getTime()) || Number.isNaN(last.getTime())) return out;
  while (d <= last) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function clampReportEndDate(toIso: string, today = getCalendarIsoDate()): string {
  return toIso > today ? today : toIso;
}

export function defaultReportFromDate(daysBack = 7, today = getCalendarIsoDate()): string {
  const d = new Date(`${today}T12:00:00`);
  d.setDate(d.getDate() - Math.max(0, daysBack - 1));
  return d.toISOString().slice(0, 10);
}

export function buildExpectedStaffRoster(
  halaqat: Halaqa[],
  roleAccounts: { role: string; name: string }[] = [],
): ExpectedStaffMember[] {
  const rows: ExpectedStaffMember[] = [];
  const seen = new Set<string>();

  const push = (role: string, name: string, halaqaId: number, halaqaName: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === "—") return;
    const userKey = staffUserKey(role, halaqaId, trimmed);
    if (seen.has(userKey)) return;
    seen.add(userKey);
    rows.push({ userKey, role, name: trimmed, halaqaId, halaqaName });
  };

  for (const h of halaqat) {
    push("teacher", h.teacherName ?? "", h.id, h.name);
    push("assistant", h.assistantName ?? "", h.id, h.name);
  }

  for (const acc of roleAccounts) {
    if (!canStaffCheckIn(acc.role)) continue;
    if (isHalaqaBoundStaffRole(acc.role)) continue;
    push(acc.role, acc.name, COMPLEX_STAFF_HALAQA_ID, COMPLEX_STAFF_HALAQA_NAME);
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

export function filterCheckIns(
  checkIns: StaffCheckIn[],
  filters: StaffReportFilters,
): StaffCheckIn[] {
  const cappedTo = clampReportEndDate(filters.toIso);
  const q = filters.nameQuery.trim();
  return checkIns
    .filter((c) => c.date >= filters.fromIso && c.date <= cappedTo)
    .filter((c) => filters.role === "all" || c.role === filters.role)
    .filter((c) => filters.halaqaId === "all" || c.halaqaId === filters.halaqaId)
    .filter((c) => !q || c.name.includes(q))
    .sort((a, b) => b.date.localeCompare(a.date) || a.checkedInAt.localeCompare(b.checkedInAt));
}

export function buildStaffSummaryRows(
  filtered: StaffCheckIn[],
  expected: ExpectedStaffMember[],
  fromIso: string,
  toIso: string,
  today = getCalendarIsoDate(),
): StaffSummaryRow[] {
  const cappedTo = clampReportEndDate(toIso, today);
  const dates = datesBetweenInclusive(fromIso, cappedTo).filter((d) => d <= today);
  const byUserKey = new Map<string, StaffSummaryRow>();

  for (const member of expected) {
    byUserKey.set(member.userKey, {
      userKey: member.userKey,
      name: member.name,
      role: member.role,
      halaqaName: member.halaqaName,
      checkInDays: 0,
      presentDays: 0,
      lateDays: 0,
      absentDays: 0,
    });
  }

  for (const c of filtered) {
    let row = byUserKey.get(c.userKey);
    if (!row) {
      row = {
        userKey: c.userKey,
        name: c.name,
        role: c.role,
        halaqaName: c.halaqaName || "—",
        checkInDays: 0,
        presentDays: 0,
        lateDays: 0,
        absentDays: 0,
      };
      byUserKey.set(c.userKey, row);
    }
    row.checkInDays += 1;
    if (c.status === "late") row.lateDays += 1;
    else row.presentDays += 1;
  }

  const checkInByDay = new Map<string, Set<string>>();
  for (const c of filtered) {
    const dayKey = `${c.userKey}:${c.date}`;
    if (!checkInByDay.has(c.userKey)) checkInByDay.set(c.userKey, new Set());
    checkInByDay.get(c.userKey)!.add(c.date);
  }

  for (const member of expected) {
    const row = byUserKey.get(member.userKey);
    if (!row) continue;
    const checkedDates = checkInByDay.get(member.userKey) ?? new Set<string>();
    row.absentDays = dates.filter((d) => !checkedDates.has(d)).length;
  }

  return Array.from(byUserKey.values()).sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

export function computeStaffReportStats(
  filtered: StaffCheckIn[],
  summary: StaffSummaryRow[],
  fromIso: string,
  toIso: string,
): StaffReportStats {
  const cappedTo = clampReportEndDate(toIso);
  const daysInRange = datesBetweenInclusive(fromIso, cappedTo).length;
  return {
    totalCheckIns: filtered.length,
    presentCount: filtered.filter((c) => c.status === "present").length,
    lateCount: filtered.filter((c) => c.status === "late").length,
    uniqueStaff: new Set(filtered.map((c) => c.userKey)).size,
    absentSlots: summary.reduce((n, r) => n + r.absentDays, 0),
    daysInRange,
  };
}

export function loadFilteredStaffReport(filters: StaffReportFilters) {
  const all = loadStaffCheckIns();
  const filtered = filterCheckIns(all, filters);
  return { all, filtered };
}

function safeFilePart(s: string): string {
  return s.replace(/[^\w\u0600-\u06FF-]+/g, "_").slice(0, 40) || "report";
}

export function downloadStaffAttendanceWorkbook(input: {
  filtered: StaffCheckIn[];
  summary: StaffSummaryRow[];
  fromIso: string;
  toIso: string;
  brandName?: string;
}) {
  const { filtered, summary, fromIso, toIso, brandName } = input;
  const cappedTo = clampReportEndDate(toIso);
  const wb = XLSX.utils.book_new();

  const summarySheet: (string | number)[][] = [
    ["تقرير حضور العاملين"],
    ["المجمع", brandName ?? "—"],
    ["من", fromIso, "إلى", cappedTo],
    [],
    ["الاسم", "الدور", "الحلقة", "أيام التسجيل", "حاضر", "متأخر", "غياب (أيام)"],
  ];
  for (const r of summary) {
    summarySheet.push([
      r.name,
      staffRoleLabel(r.role),
      r.halaqaName,
      r.checkInDays,
      r.presentDays,
      r.lateDays,
      r.absentDays,
    ]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summarySheet), "الملخص");

  const detailSheet: (string | number)[][] = [
    ["التاريخ", "الاسم", "الدور", "الحلقة", "الحالة", "وقت التسجيل", "بداية الحلقة", "العصر"],
  ];
  for (const c of filtered) {
    detailSheet.push([
      c.date,
      c.name,
      staffRoleLabel(c.role),
      c.halaqaName || "—",
      STAFF_STATUS_LABEL[c.status],
      new Date(c.checkedInAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }),
      formatTime12(c.scheduledStart),
      formatTime12(c.asrTime),
    ]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detailSheet), "التفاصيل");

  const dailySheet: (string | number)[][] = [["التاريخ", "عدد المسجّلين", "حاضر", "متأخر"]];
  const byDate = new Map<string, StaffCheckIn[]>();
  for (const c of filtered) {
    if (!byDate.has(c.date)) byDate.set(c.date, []);
    byDate.get(c.date)!.push(c);
  }
  for (const date of datesBetweenInclusive(fromIso, cappedTo)) {
    const rows = byDate.get(date) ?? [];
    dailySheet.push([
      date,
      rows.length,
      rows.filter((r) => r.status === "present").length,
      rows.filter((r) => r.status === "late").length,
    ]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dailySheet), "يومي");

  XLSX.writeFile(wb, `حضور_العاملين_${fromIso}_${cappedTo}.xlsx`);
}

export const STAFF_ROLE_FILTER_OPTIONS = [
  { value: "all", label: "كل الأدوار" },
  ...STAFF_CHECKIN_ROLES.map((role) => ({
    value: role,
    label: staffRoleLabel(role),
  })),
];
