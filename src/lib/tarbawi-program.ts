/**
 * البرنامج التربوي — planning + approval + weekly execution.
 */
import { pushNotification } from "@/lib/mock-data";

export interface TarbawiParagraphType {
  id: string;
  label: string;
}

export type TarbawiPlanSpan = "full" | 2 | 4 | 6 | 8 | 10 | 12;

export type TarbawiPlanStatus = "draft" | "submitted" | "approved" | "rejected";

export interface TarbawiSettings {
  semesterId: string;
  paragraphTypes: TarbawiParagraphType[];
  weeklyRequiredCount: number;
  /** halaqaId → plan span in weeks (or full semester) */
  halaqaSpans: Record<number, TarbawiPlanSpan>;
  updatedAt?: string;
}

export interface TarbawiPlanItem {
  id: string;
  weekNumber: number;
  paragraphTypeId: string;
  topic: string;
  executed: boolean;
  executor: string;
  beneficiaries: number;
}

export interface TarbawiHalaqaPlan {
  halaqaId: number;
  semesterId: string;
  status: TarbawiPlanStatus;
  items: TarbawiPlanItem[];
  submittedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectionNote?: string;
  updatedAt: string;
}

export interface TarbawiStore {
  settingsBySemester: Record<string, TarbawiSettings>;
  plans: Record<string, TarbawiHalaqaPlan>;
}

export interface TarbawiWeekStats {
  weekNumber: number;
  planned: number;
  executed: number;
  pct: number;
}

export interface TarbawiPlanStats {
  total: number;
  executed: number;
  pct: number;
  byWeek: TarbawiWeekStats[];
}

const KEY_STORE = "qshatawi_tarbawi_program_v1";
const KEY_SEMESTER = "qshatawi_tarbawi_semester_v1";

export const DEFAULT_PARAGRAPH_TYPES: TarbawiParagraphType[] = [
  { id: "story", label: "قصة" },
  { id: "speech", label: "كلمة" },
  { id: "benefit", label: "فائدة" },
  { id: "tafsir", label: "تفسير" },
  { id: "trip", label: "رحلة" },
  { id: "contest", label: "مسابقة" },
  { id: "maani", label: "معاني (منهج الجمعية)" },
];

function uid(): string {
  return `tw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function planKey(semesterId: string, halaqaId: number): string {
  return `${semesterId}:${halaqaId}`;
}

function normalizeHalaqaSpans(
  raw: Record<string | number, TarbawiPlanSpan> | undefined,
): Record<number, TarbawiPlanSpan> {
  if (!raw) return {};
  const out: Record<number, TarbawiPlanSpan> = {};
  for (const [k, v] of Object.entries(raw)) {
    const id = Number(k);
    if (Number.isFinite(id) && id > 0 && v) out[id] = v as TarbawiPlanSpan;
  }
  return out;
}

function normalizeSettings(raw: TarbawiSettings): TarbawiSettings {
  return {
    semesterId: raw.semesterId,
    paragraphTypes: (raw.paragraphTypes ?? DEFAULT_PARAGRAPH_TYPES).filter((t) => t?.label?.trim()),
    weeklyRequiredCount: Math.max(1, Math.min(10, Math.round(raw.weeklyRequiredCount) || 2)),
    halaqaSpans: normalizeHalaqaSpans(raw.halaqaSpans as Record<string, TarbawiPlanSpan>),
    updatedAt: raw.updatedAt,
  };
}

function normalizeStore(raw: TarbawiStore): TarbawiStore {
  const settingsBySemester: Record<string, TarbawiSettings> = {};
  for (const [semId, s] of Object.entries(raw.settingsBySemester ?? {})) {
    if (s) settingsBySemester[semId] = normalizeSettings({ ...s, semesterId: semId });
  }
  return { settingsBySemester, plans: raw.plans ?? {} };
}

function readStore(): TarbawiStore {
  if (typeof window === "undefined") return { settingsBySemester: {}, plans: {} };
  const raw = localStorage.getItem(KEY_STORE);
  if (!raw) return { settingsBySemester: {}, plans: {} };
  try {
    return normalizeStore(JSON.parse(raw) as TarbawiStore);
  } catch {
    return { settingsBySemester: {}, plans: {} };
  }
}

function writeStore(store: TarbawiStore): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_STORE, JSON.stringify(store));
  if (sessionStorage.getItem("qs_token") && sessionStorage.getItem("qs_syncing") !== "1") {
    void pushTarbawiStoreCloud(store).catch((e) => {
      console.warn("tarbawi_program cloud sync failed:", e);
    });
  }
}

export async function pushTarbawiStoreCloud(store: TarbawiStore): Promise<void> {
  const { pushAppState } = await import("./cloud-sync");
  await pushAppState("tarbawi_program", store);
}

export function ensureTarbawiSemester(semesterId: string | null): boolean {
  if (typeof window === "undefined" || !semesterId) return false;
  const prev = localStorage.getItem(KEY_SEMESTER);
  if (prev && prev !== semesterId) {
    localStorage.setItem(KEY_SEMESTER, semesterId);
    writeStore({ settingsBySemester: {}, plans: {} });
    return true;
  }
  if (!prev) localStorage.setItem(KEY_SEMESTER, semesterId);
  return false;
}

export function saveTarbawiStore(store: TarbawiStore): void {
  writeStore(store);
}

export function loadTarbawiStore(): TarbawiStore {
  return readStore();
}

/** Merge local + cloud — local wins when newer; never silently drop unsynced local edits. */
export function mergeTarbawiStores(
  local: TarbawiStore,
  cloud: TarbawiStore,
): { merged: TarbawiStore; pushToCloud: boolean } {
  const l = normalizeStore(local);
  const c = normalizeStore(cloud);
  const settingsBySemester: Record<string, TarbawiSettings> = { ...c.settingsBySemester };
  const plans: Record<string, TarbawiHalaqaPlan> = { ...c.plans };
  let pushToCloud = false;

  for (const [semId, localSettings] of Object.entries(l.settingsBySemester)) {
    const cloudSettings = c.settingsBySemester[semId];
    const localTs = localSettings.updatedAt ?? "";
    const cloudTs = cloudSettings?.updatedAt ?? "";
    if (!cloudSettings || localTs >= cloudTs) {
      settingsBySemester[semId] = localSettings;
      if (!cloudSettings || localTs > cloudTs) pushToCloud = true;
    }
  }

  for (const [key, localPlan] of Object.entries(l.plans)) {
    const cloudPlan = c.plans[key];
    if (!cloudPlan || localPlan.updatedAt > cloudPlan.updatedAt) {
      plans[key] = localPlan;
      pushToCloud = true;
    }
  }

  return { merged: { settingsBySemester, plans }, pushToCloud };
}

export function defaultTarbawiSettings(semesterId: string): TarbawiSettings {
  return {
    semesterId,
    paragraphTypes: DEFAULT_PARAGRAPH_TYPES.map((t) => ({ ...t })),
    weeklyRequiredCount: 2,
    halaqaSpans: {},
  };
}

export function getTarbawiSettings(semesterId: string): TarbawiSettings {
  const store = readStore();
  const saved = store.settingsBySemester[semesterId];
  if (saved) return { ...saved };
  return defaultTarbawiSettings(semesterId);
}

export function saveTarbawiSettings(settings: TarbawiSettings): TarbawiSettings {
  const store = readStore();
  const normalized = normalizeSettings({
    ...settings,
    semesterId: settings.semesterId,
    updatedAt: new Date().toISOString(),
  });
  store.settingsBySemester[settings.semesterId] = normalized;
  writeStore(store);
  return normalized;
}

export function planSpanWeeks(span: TarbawiPlanSpan, semesterWeeks: number): number {
  if (span === "full") return Math.max(1, semesterWeeks);
  return Math.min(span, Math.max(1, semesterWeeks));
}

export function getHalaqaPlanSpan(
  settings: TarbawiSettings,
  halaqaId: number,
  semesterWeeks: number,
): number {
  const span = settings.halaqaSpans[halaqaId] ?? "full";
  return planSpanWeeks(span, semesterWeeks);
}

export function emptyTarbawiPlan(semesterId: string, halaqaId: number): TarbawiHalaqaPlan {
  return {
    halaqaId,
    semesterId,
    status: "draft",
    items: [],
    updatedAt: new Date().toISOString(),
  };
}

export function getTarbawiPlan(semesterId: string, halaqaId: number): TarbawiHalaqaPlan {
  const store = readStore();
  const key = planKey(semesterId, halaqaId);
  return store.plans[key] ?? emptyTarbawiPlan(semesterId, halaqaId);
}

export function saveTarbawiPlan(plan: TarbawiHalaqaPlan): TarbawiHalaqaPlan {
  const store = readStore();
  const key = planKey(plan.semesterId, plan.halaqaId);
  const next = { ...plan, updatedAt: new Date().toISOString() };
  store.plans[key] = next;
  writeStore(store);
  return next;
}

/** Unassigned during bulk entry — assigned on distribute */
export const UNASSIGNED_WEEK = 0;

export function newTarbawiItem(weekNumber = UNASSIGNED_WEEK): TarbawiPlanItem {
  return {
    id: uid(),
    weekNumber,
    paragraphTypeId: DEFAULT_PARAGRAPH_TYPES[0]?.id ?? "story",
    topic: "",
    executed: false,
    executor: "",
    beneficiaries: 0,
  };
}

export function requiredTarbawiItemCount(spanWeeks: number, weeklyRequiredCount: number): number {
  return spanWeeks * weeklyRequiredCount;
}

export function isPlanDistributed(plan: TarbawiHalaqaPlan): boolean {
  return plan.items.length > 0 && plan.items.every((i) => i.weekNumber >= 1);
}

export function clearItemWeekAssignments(items: TarbawiPlanItem[]): TarbawiPlanItem[] {
  return items.map((i) => ({ ...i, weekNumber: UNASSIGNED_WEEK }));
}

/** Distribute by entry order: N items per week (N = weeklyRequiredCount). */
export function distributeTarbawiItems(
  items: TarbawiPlanItem[],
  spanWeeks: number,
  weeklyRequiredCount: number,
): TarbawiPlanItem[] {
  const required = requiredTarbawiItemCount(spanWeeks, weeklyRequiredCount);
  return items.slice(0, required).map((item, index) => ({
    ...item,
    weekNumber: Math.floor(index / weeklyRequiredCount) + 1,
  }));
}

export function validateTarbawiPlanEntry(
  plan: TarbawiHalaqaPlan,
  settings: TarbawiSettings,
  semesterWeeks: number,
): string | null {
  const spanWeeks = getHalaqaPlanSpan(settings, plan.halaqaId, semesterWeeks);
  const required = requiredTarbawiItemCount(spanWeeks, settings.weeklyRequiredCount);
  if (plan.items.length < required) {
    return `أكمل ${required} فقرة للمدة المحددة (موجود ${plan.items.length})`;
  }
  const emptyTopic = plan.items.slice(0, required).find((i) => !i.topic.trim());
  if (emptyTopic) return "أكمل موضوع كل الفقرات قبل التوزيع";
  return null;
}

export function validateTarbawiPlanDraft(
  plan: TarbawiHalaqaPlan,
  settings: TarbawiSettings,
  semesterWeeks: number,
): string | null {
  if (plan.items.length === 0) return "أضف فقرات للخطة أولاً";
  const emptyTopic = plan.items.find((i) => !i.topic.trim());
  if (emptyTopic) return "أكمل موضوع كل الفقرات قبل الإرسال";
  const spanWeeks = getHalaqaPlanSpan(settings, plan.halaqaId, semesterWeeks);
  for (let w = 1; w <= spanWeeks; w++) {
    const count = plan.items.filter((i) => i.weekNumber === w).length;
    if (count < settings.weeklyRequiredCount) {
      return `الأسبوع ${w}: مطلوب ${settings.weeklyRequiredCount} فقرات على الأقل (موجود ${count})`;
    }
  }
  return null;
}

export function submitTarbawiPlan(
  plan: TarbawiHalaqaPlan,
  settings: TarbawiSettings,
  semesterWeeks: number,
  halaqaName: string,
): TarbawiHalaqaPlan {
  const spanWeeks = getHalaqaPlanSpan(settings, plan.halaqaId, semesterWeeks);
  let items = plan.items;
  if (!isPlanDistributed(plan)) {
    const entryErr = validateTarbawiPlanEntry(plan, settings, semesterWeeks);
    if (entryErr) throw new Error(entryErr);
    items = distributeTarbawiItems(plan.items, spanWeeks, settings.weeklyRequiredCount);
  }
  const prepared = { ...plan, items };
  const err = validateTarbawiPlanDraft(prepared, settings, semesterWeeks);
  if (err) throw new Error(err);
  const next = saveTarbawiPlan({
    ...prepared,
    status: "submitted",
    submittedAt: new Date().toISOString(),
    rejectionNote: undefined,
  });
  pushNotification({
    message: `خطة البرنامج التربوي لحلقة «${halaqaName}» بانتظار الاعتماد`,
    type: "info",
    targetRole: "program_supervisor",
  });
  return next;
}

export function approveTarbawiPlan(
  plan: TarbawiHalaqaPlan,
  approverName: string,
  halaqaName: string,
): TarbawiHalaqaPlan {
  const next = saveTarbawiPlan({
    ...plan,
    status: "approved",
    approvedAt: new Date().toISOString(),
    approvedBy: approverName,
    rejectionNote: undefined,
  });
  pushNotification({
    message: `تم اعتماد خطة البرنامج التربوي لحلقة «${halaqaName}» — يمكنك البدء بالتنفيذ`,
    type: "info",
    targetHalaqaId: plan.halaqaId,
  });
  return next;
}

export function rejectTarbawiPlan(
  plan: TarbawiHalaqaPlan,
  note: string,
  halaqaName: string,
): TarbawiHalaqaPlan {
  const next = saveTarbawiPlan({
    ...plan,
    status: "rejected",
    items: clearItemWeekAssignments(plan.items),
    rejectionNote: note.trim() || "يُرجى مراجعة الخطة وتعديلها",
  });
  pushNotification({
    message: `خطة البرنامج التربوي لحلقة «${halaqaName}» تحتاج تعديل: ${next.rejectionNote}`,
    type: "info",
    targetHalaqaId: plan.halaqaId,
  });
  return next;
}

export function computeTarbawiStats(
  plan: TarbawiHalaqaPlan,
  spanWeeks: number,
  upToWeek?: number,
): TarbawiPlanStats {
  const cap = upToWeek ?? spanWeeks;
  const items = plan.items.filter((i) => i.weekNumber >= 1 && i.weekNumber <= cap);
  const total = items.length;
  const executed = items.filter((i) => i.executed).length;
  const byWeek: TarbawiWeekStats[] = [];
  for (let w = 1; w <= cap; w++) {
    const weekItems = items.filter((i) => i.weekNumber === w);
    const wTotal = weekItems.length;
    const wExec = weekItems.filter((i) => i.executed).length;
    byWeek.push({
      weekNumber: w,
      planned: wTotal,
      executed: wExec,
      pct: wTotal > 0 ? Math.round((wExec / wTotal) * 1000) / 10 : 0,
    });
  }
  return {
    total,
    executed,
    pct: total > 0 ? Math.round((executed / total) * 1000) / 10 : 0,
    byWeek,
  };
}

export function listSubmittedTarbawiPlans(semesterId: string): TarbawiHalaqaPlan[] {
  const store = readStore();
  return Object.values(store.plans).filter(
    (p) => p.semesterId === semesterId && p.status === "submitted",
  );
}

export function paragraphTypeLabel(settings: TarbawiSettings, typeId: string): string {
  return settings.paragraphTypes.find((t) => t.id === typeId)?.label ?? typeId;
}

export const PLAN_SPAN_OPTIONS: { value: TarbawiPlanSpan; label: string }[] = [
  { value: 2, label: "أسبوعان" },
  { value: 4, label: "4 أسابيع" },
  { value: 6, label: "6 أسابيع" },
  { value: 8, label: "8 أسابيع" },
  { value: 10, label: "10 أسابيع" },
  { value: 12, label: "12 أسبوعاً" },
  { value: "full", label: "كامل الفصل" },
];
