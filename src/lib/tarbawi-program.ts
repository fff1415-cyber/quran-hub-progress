/**
 * البرنامج التربوي — planning + approval + weekly execution.
 */
import { pushNotification } from "@/lib/mock-data";
import { hasAuthToken } from "@/lib/auth-session";

export interface TarbawiParagraphType {
  id: string;
  label: string;
}

/** Weeks 6–18, or the full semester. Stored numbers outside that range (legacy 2/4) still apply. */
export type TarbawiPlanSpan = "full" | number;

export type TarbawiPlanStatus = "draft" | "submitted" | "approved" | "rejected" | "needs_revision";

export type TarbawiItemReviewStatus = "pending" | "accepted" | "rejected";

export interface TarbawiContentChangeRequest {
  items: TarbawiPlanItem[];
  submittedAt: string;
  note?: string;
}

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
  reviewStatus?: TarbawiItemReviewStatus;
  rejectionNote?: string;
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
  contentChangeRequest?: TarbawiContentChangeRequest;
  /** itemId → rejection reason after partial content-change reject */
  contentRevisionNotes?: Record<string, string>;
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
    if (!Number.isFinite(id) || id <= 0) continue;
    if (v === "full") {
      out[id] = "full";
      continue;
    }
    const weeks = Number(v);
    if (Number.isFinite(weeks) && weeks > 0) out[id] = Math.round(weeks);
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

const PLAN_STATUS_RANK: Record<TarbawiPlanStatus, number> = {
  draft: 0,
  rejected: 1,
  needs_revision: 1,
  submitted: 2,
  approved: 3,
};

function pickMergedPlan(localPlan: TarbawiHalaqaPlan, cloudPlan: TarbawiHalaqaPlan): TarbawiHalaqaPlan {
  if (localPlan.updatedAt > cloudPlan.updatedAt) return localPlan;
  if (cloudPlan.updatedAt > localPlan.updatedAt) return cloudPlan;
  return PLAN_STATUS_RANK[localPlan.status] >= PLAN_STATUS_RANK[cloudPlan.status]
    ? localPlan
    : cloudPlan;
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
  if (hasAuthToken() && sessionStorage.getItem("qs_syncing") !== "1") {
    void pushTarbawiStoreCloud(store).catch((e) => {
      console.warn("tarbawi_program cloud sync failed:", e);
    });
  }
}

export async function pushTarbawiStoreCloud(store: TarbawiStore): Promise<void> {
  const { pushAppState, getToken } = await import("./cloud-sync");
  const token = getToken();
  if (!token) {
    await pushAppState("tarbawi_program", store);
    return;
  }
  try {
    const { secureListAppState } = await import("./secure-data.functions");
    const rows = await secureListAppState({ data: { token } });
    const row = rows.find((r) => r.key === "tarbawi_program");
    const cloud = (row?.value as TarbawiStore) ?? { settingsBySemester: {}, plans: {} };
    const { merged } = mergeTarbawiStores(store, cloud);
    await pushAppState("tarbawi_program", merged);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("qs_syncing", "1");
      localStorage.setItem(KEY_STORE, JSON.stringify(merged));
      sessionStorage.removeItem("qs_syncing");
    }
  } catch {
    await pushAppState("tarbawi_program", store);
  }
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
    if (!cloudPlan) {
      plans[key] = localPlan;
      pushToCloud = true;
    } else {
      const winner = pickMergedPlan(localPlan, cloudPlan);
      plans[key] = winner;
      if (winner === localPlan && localPlan.updatedAt >= cloudPlan.updatedAt) pushToCloud = true;
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
  return null;
}

export function validateTarbawiPlanDraft(
  plan: TarbawiHalaqaPlan,
  settings: TarbawiSettings,
  semesterWeeks: number,
): string | null {
  if (plan.items.length === 0) return "أضف فقرات للخطة أولاً";
  const spanWeeks = getHalaqaPlanSpan(settings, plan.halaqaId, semesterWeeks);
  for (let w = 1; w <= spanWeeks; w++) {
    const count = plan.items.filter((i) => i.weekNumber === w).length;
    if (count < settings.weeklyRequiredCount) {
      return `الأسبوع ${w}: مطلوب ${settings.weeklyRequiredCount} فقرات على الأقل (موجود ${count})`;
    }
  }
  return null;
}

export function moveTarbawiItemToWeek(
  plan: TarbawiHalaqaPlan,
  itemId: string,
  weekNumber: number,
): TarbawiHalaqaPlan {
  if (weekNumber < 1) return plan;
  return saveTarbawiPlan({
    ...plan,
    items: plan.items.map((i) => (i.id === itemId ? { ...i, weekNumber } : i)),
  });
}

export function submitTarbawiContentChange(
  plan: TarbawiHalaqaPlan,
  items: TarbawiPlanItem[],
  halaqaName: string,
): TarbawiHalaqaPlan {
  if (plan.status !== "approved") {
    throw new Error("التعديل على الفقرات متاح بعد اعتماد الخطة فقط");
  }
  const submittedIds = new Set(items.map((i) => i.id));
  const contentRevisionNotes = { ...(plan.contentRevisionNotes ?? {}) };
  for (const id of submittedIds) {
    delete contentRevisionNotes[id];
  }
  const next = saveTarbawiPlan({
    ...plan,
    items: plan.items,
    contentChangeRequest: {
      items: items.map((i) => ({ ...i })),
      submittedAt: new Date().toISOString(),
    },
    contentRevisionNotes:
      Object.keys(contentRevisionNotes).length > 0 ? contentRevisionNotes : undefined,
  });
  pushNotification({
    message: `تعديل فقرات البرنامج التربوي لحلقة «${halaqaName}» بانتظار الاعتماد`,
    type: "info",
    targetRole: "program_supervisor",
  });
  return next;
}

export function approveTarbawiContentChange(
  plan: TarbawiHalaqaPlan,
  approverName: string,
  halaqaName: string,
): TarbawiHalaqaPlan {
  const req = plan.contentChangeRequest;
  if (!req) throw new Error("لا يوجد طلب تعديل");
  const next = saveTarbawiPlan({
    ...plan,
    items: req.items.map((i) => ({ ...i, reviewStatus: "accepted", rejectionNote: undefined })),
    contentChangeRequest: undefined,
    contentRevisionNotes: undefined,
    approvedAt: new Date().toISOString(),
    approvedBy: approverName,
  });
  pushNotification({
    message: `تم اعتماد تعديل فقرات البرنامج التربوي لحلقة «${halaqaName}»`,
    type: "info",
    targetHalaqaId: plan.halaqaId,
  });
  return next;
}

export function rejectTarbawiContentChangeItem(
  plan: TarbawiHalaqaPlan,
  itemId: string,
  note: string,
  halaqaName: string,
  settings: TarbawiSettings,
): TarbawiHalaqaPlan {
  const req = plan.contentChangeRequest;
  if (!req) throw new Error("لا يوجد طلب تعديل");
  const proposed = req.items.find((i) => i.id === itemId);
  const current = plan.items.find((i) => i.id === itemId);
  const item = proposed ?? current;
  if (!item) throw new Error("الفقرة غير موجودة");
  const trimmed = note.trim() || "يُرجى مراجعة هذه الفقرة وتعديلها";
  const contentRevisionNotes = { ...(plan.contentRevisionNotes ?? {}), [itemId]: trimmed };
  const next = saveTarbawiPlan({
    ...plan,
    contentChangeRequest: undefined,
    contentRevisionNotes,
  });
  pushNotification({
    message: `رُفضت فقرة في تعديل البرنامج التربوي لحلقة «${halaqaName}»: ${formatTarbawiItemLabel(settings, item)} — ${trimmed}`,
    type: "info",
    targetHalaqaId: plan.halaqaId,
  });
  return next;
}

export function listContentChangeTarbawiPlans(semesterId: string): TarbawiHalaqaPlan[] {
  const store = readStore();
  return Object.values(store.plans).filter(
    (p) => p.semesterId === semesterId && p.status === "approved" && p.contentChangeRequest,
  );
}

export function submitTarbawiPlan(
  plan: TarbawiHalaqaPlan,
  settings: TarbawiSettings,
  semesterWeeks: number,
  halaqaName: string,
): TarbawiHalaqaPlan {
  if (plan.status === "needs_revision" || plan.status === "rejected") {
    const items = plan.items.map((i) => ({
      ...i,
      reviewStatus: "pending" as const,
      rejectionNote: undefined,
    }));
    const err = validateTarbawiPlanDraft({ ...plan, items }, settings, semesterWeeks);
    if (err) throw new Error(err);
    const next = saveTarbawiPlan({
      ...plan,
      items,
      status: "submitted",
      submittedAt: new Date().toISOString(),
      rejectionNote: undefined,
    });
    pushNotification({
      message: `خطة البرنامج التربوي لحلقة «${halaqaName}» بانتظار الاعتماد (بعد التعديل)`,
      type: "info",
      targetRole: "program_supervisor",
    });
    return next;
  }

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
  const reviewedItems = items.map((i) => ({
    ...i,
    reviewStatus: "pending" as const,
    rejectionNote: undefined,
  }));
  const next = saveTarbawiPlan({
    ...prepared,
    items: reviewedItems,
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
    items: plan.items.map((i) => ({
      ...i,
      reviewStatus: "accepted" as const,
      rejectionNote: undefined,
    })),
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

export function rejectTarbawiPlanItem(
  plan: TarbawiHalaqaPlan,
  itemId: string,
  note: string,
  halaqaName: string,
  settings: TarbawiSettings,
): TarbawiHalaqaPlan {
  const item = plan.items.find((i) => i.id === itemId);
  if (!item) throw new Error("الفقرة غير موجودة");
  const trimmed = note.trim() || "يُرجى مراجعة هذه الفقرة وتعديلها";
  const items = plan.items.map((i) =>
    i.id === itemId
      ? { ...i, reviewStatus: "rejected" as const, rejectionNote: trimmed }
      : i,
  );
  const next = saveTarbawiPlan({
    ...plan,
    status: plan.status === "submitted" ? "submitted" : "needs_revision",
    items,
    rejectionNote: undefined,
  });
  pushNotification({
    message: `رُفضت فقرة في خطة البرنامج التربوي لحلقة «${halaqaName}»: ${formatTarbawiItemLabel(settings, item)} — ${trimmed}`,
    type: "info",
    targetHalaqaId: plan.halaqaId,
  });
  return next;
}

export function sendTarbawiPlanRevisionToTeacher(
  plan: TarbawiHalaqaPlan,
  halaqaName: string,
): TarbawiHalaqaPlan {
  const rejected = rejectedTarbawiItems(plan);
  if (rejected.length === 0) {
    throw new Error("لا توجد فقرات مرفوضة لإرسالها");
  }
  const next = saveTarbawiPlan({
    ...plan,
    status: "needs_revision",
  });
  pushNotification({
    message: `خطة البرنامج التربوي لحلقة «${halaqaName}» تحتاج تعديل (${rejected.length} فقرة) — راجع الملاحظات`,
    type: "info",
    targetHalaqaId: plan.halaqaId,
  });
  return next;
}

export function pendingRejectedTarbawiItems(plan: TarbawiHalaqaPlan): TarbawiPlanItem[] {
  return plan.status === "submitted" ? rejectedTarbawiItems(plan) : [];
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

export function formatTarbawiItemLabel(settings: TarbawiSettings, item: TarbawiPlanItem): string {
  const type = paragraphTypeLabel(settings, item.paragraphTypeId);
  const week =
    item.weekNumber >= 1 ? `الأسبوع ${item.weekNumber}` : "فقرة";
  const topic = item.topic.trim() || "بدون موضوع";
  return `${week} · ${type} — ${topic}`;
}

export function rejectedTarbawiItems(plan: TarbawiHalaqaPlan): TarbawiPlanItem[] {
  return plan.items.filter((i) => i.reviewStatus === "rejected");
}

export function contentRevisionItemIds(plan: TarbawiHalaqaPlan): string[] {
  return Object.keys(plan.contentRevisionNotes ?? {});
}

export const PLAN_SPAN_MIN_WEEKS = 6;
export const PLAN_SPAN_MAX_WEEKS = 18;

export function formatWeekCountLabel(weeks: number): string {
  if (weeks === 1) return "أسبوع واحد";
  if (weeks === 2) return "أسبوعان";
  if (weeks >= 3 && weeks <= 10) return `${weeks} أسابيع`;
  return `${weeks} أسبوعاً`;
}

export const PLAN_SPAN_OPTIONS: { value: TarbawiPlanSpan; label: string }[] = [
  ...Array.from({ length: PLAN_SPAN_MAX_WEEKS - PLAN_SPAN_MIN_WEEKS + 1 }, (_, i) => {
    const weeks = PLAN_SPAN_MIN_WEEKS + i;
    return { value: weeks, label: formatWeekCountLabel(weeks) };
  }),
  { value: "full", label: "كامل الفصل" },
];

/** Include a saved legacy span (e.g. 2 or 4 weeks) so the dropdown still shows the current value. */
export function planSpanSelectOptions(current: TarbawiPlanSpan | undefined): { value: TarbawiPlanSpan; label: string }[] {
  if (current === undefined || current === "full") return PLAN_SPAN_OPTIONS;
  const weeks = Number(current);
  if (!Number.isFinite(weeks) || PLAN_SPAN_OPTIONS.some((o) => o.value === weeks)) return PLAN_SPAN_OPTIONS;
  return [{ value: weeks, label: formatWeekCountLabel(weeks) }, ...PLAN_SPAN_OPTIONS];
}

export function formatPlanSpanLabel(
  spanSetting: TarbawiPlanSpan | undefined,
  spanWeeks: number,
  semesterWeeks: number,
): string {
  if (spanSetting === "full" || spanWeeks >= semesterWeeks) return "كامل الفصل";
  const opt = PLAN_SPAN_OPTIONS.find((o) => o.value === spanSetting);
  if (opt) return opt.label;
  return formatWeekCountLabel(spanWeeks);
}
