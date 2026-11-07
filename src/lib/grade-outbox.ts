import type { GradesStore } from "./mock-data";

type Cell = { present: false } | { present: true; value: unknown };
type Stamp = { ancestors: (string | null)[]; subtree: string | null };
type Change = { path: string[]; base: Cell; next: Cell; stamp: Stamp };
export type GradeStoreKey = "grades" | "weekly_tests" | "scientific_grades";
export const GRADE_ORIGIN = Symbol("confirmed-grade-period");
type Calendar = { known: boolean; active_semester_id: string | null };
export type PlanEffect = { student_id: string; expected_assignment_id: string; task_type: "hifz" | "rabt" | "muraja"; action: "record" | "undo" | "compensation"; tap: "half" | "one" | "two"; completed_at: string; cell_path: string[] };
export type GradePacket = { operation_id: string; calendar_context: Calendar; changes: Change[]; store_key?: GradeStoreKey; semester_scoped?: true; plan?: PlanEffect };
export type GradeSnapshot<T extends object = GradesStore> = { store_key?: GradeStoreKey; semester_scoped?: boolean; protocol: 1; context_complex_id: number; cursor?: string; value: T; calendar_context: Calendar; versions: Record<string, { direct_version: string | null; subtree_version: string | null }> };
export type GradeSnapshotResult<T extends object = GradesStore> = GradeSnapshot<T> | { protocol: 1; context_complex_id: number; cursor: string; unchanged: true };
export type GradeDraft = { packet: GradePacket; order: number; dependencies: string[]; status: "pending" | "unbased" | "conflict" | "confirmed" | "superseded" | "discarded"; message?: string; observed?: boolean };
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
function clone<T>(v: T): T { return structuredClone(v); }
function at(value: unknown, path: string[]): Cell {
  for (const part of path) { if (!object(value) || !Object.hasOwn(value, part)) return { present: false }; value = value[part]; }
  return { present: true, value };
}
function set(value: Record<string, unknown>, path: string[], cell: Cell) {
  let node = value;
  for (const part of path.slice(0, -1)) { const child = node[part]; if (object(child)) node = child; else { const created: Record<string, unknown> = {}; node[part] = created; node = created; } }
  const key = path[path.length - 1]; if (cell.present) node[key] = clone(cell.value); else delete node[key];
}
function weeklySlot(key: GradeStoreKey, path: string[]): boolean { return key === "weekly_tests" && path.length === 4 && ["muraja", "rabt"].includes(path[2]) && /^[0-5]$/.test(path[3]); }
function sharedCell(key: GradeStoreKey, value: unknown, path: string[]): Cell {
  if (!weeklySlot(key, path)) return at(value, path);
  const row = at(value, path.slice(0, 2));
  const values = row.present && object(row.value) ? row.value[path[2]] : undefined;
  return { present: true, value: Array.isArray(values) ? values[Number(path[3])] ?? "" : Number(path[3]) === 0 ? values ?? "" : "" };
}
function setSharedCell(key: GradeStoreKey, value: Record<string, unknown>, path: string[], cell: Cell) {
  if (!weeklySlot(key, path)) { set(value, path, cell); return; }
  const old = at(value, path.slice(0, 3));
  const values = old.present ? Array.isArray(old.value) ? [...old.value] : [old.value] : [];
  while (values.length <= Number(path[3])) values.push("");
  values[Number(path[3])] = cell.present ? cell.value : "";
  set(value, path.slice(0, 3), { present: true, value: values });
}
function changesBetween(before: unknown, after: unknown, path: string[] = []): { path: string[]; base: Cell; next: Cell }[] {
  if (equal(before, after)) return [];
  if (object(after) && (object(before) || before === undefined)) {
    const result: ReturnType<typeof changesBetween> = [];
    for (const key of new Set([...Object.keys(before ?? {}), ...Object.keys(after)])) {
      if (["touchedAt", "fieldTouchedAt"].includes(key)) continue; // Advisory device clocks never decide shared writes.
      if (["__proto__", "constructor", "prototype"].includes(key)) throw Error("مسار درجة غير صالح");
      result.push(...changesBetween(object(before) ? before[key] : undefined, after[key], [...path, key]));
    }
    return result;
  }
  // Empty defaults introduced by ensureWeekDays are not edits to remote neighbours.
  if (before === undefined && (after === "" || after === false || Array.isArray(after) && after.length === 0)) return [];
  return [{ path, base: before === undefined ? { present: false } : { present: true, value: before }, next: after === undefined ? { present: false } : { present: true, value: after } }];
}
function stamp(snapshot: GradeSnapshot<object>, path: string[]): Stamp {
  return { ancestors: path.map((_, i) => snapshot.versions[JSON.stringify(path.slice(0, i))]?.direct_version ?? null), subtree: snapshot.versions[JSON.stringify(path)]?.subtree_version ?? null };
}
const active = (draft: GradeDraft) => ["pending", "unbased", "conflict"].includes(draft.status);
const sameGradeStore = (packet: GradePacket, snapshot: GradeSnapshot<object>) =>
  !!packet.semester_scoped === !!snapshot.semester_scoped && equal(packet.calendar_context, snapshot.calendar_context);

/** Each immutable packet has its own storage key: two tabs cannot replace each other's queues. */
export class GradeOutbox<T extends object = GradesStore> {
  readonly prefix: string;
  constructor(private storage: Storage, scope: string, private id = () => crypto.randomUUID(), private changed = () => {}, readonly storeKey: GradeStoreKey = "grades") { this.prefix = "qhp_grade_outbox_v1:" + encodeURIComponent(scope) + ":" + (storeKey === "grades" ? "" : storeKey + ":"); }
  snapshot(): GradeSnapshot<T> | null { const raw = this.storage.getItem(this.prefix + "snapshot"); return raw ? JSON.parse(raw) : null; }
  drafts(): GradeDraft[] {
    const result: GradeDraft[] = [];
    for (let i = 0; i < this.storage.length; i++) { const key = this.storage.key(i); if (key?.startsWith(this.prefix + "operation:")) result.push(JSON.parse(this.storage.getItem(key)!)); }
    return result.sort((a, b) => a.order - b.order || a.packet.operation_id.localeCompare(b.packet.operation_id));
  }
  private write(draft: GradeDraft) { this.storage.setItem(this.prefix + "operation:" + draft.packet.operation_id, JSON.stringify(draft)); this.changed(); }
  accept(snapshot: GradeSnapshot<T>) {
    if ((snapshot.store_key ?? "grades") !== this.storeKey || snapshot.protocol !== 1 || !object(snapshot.value) || !object(snapshot.versions) || !snapshot.calendar_context || typeof snapshot.calendar_context.known !== "boolean") throw Error("لم يؤكد الخادم بروتوكول الحفظ؛ بقيت المسودات محفوظة");
    this.storage.setItem(this.prefix + "snapshot", JSON.stringify(snapshot));
    for (const draft of this.drafts()) if (draft.status === "confirmed" && !draft.observed) this.write({ ...draft, observed: true });
    this.changed();
  }
  view(fallback: T): T {
    const snapshot = this.snapshot(), value = clone(snapshot?.value ?? fallback);
    if (!object(value)) throw Error("صيغة مخزن الدرجات غير صالحة");
    for (const draft of this.drafts().filter(d => (active(d) || d.status === "confirmed" && !d.observed) && (!snapshot || sameGradeStore(d.packet, snapshot)))) for (const change of draft.packet.changes) setSharedCell(this.storeKey, value, change.path, change.next);
    if (snapshot) Object.defineProperty(value, GRADE_ORIGIN, { value: snapshot.calendar_context, enumerable: true });
    return value;
  }
  edit(before: T, after: T, plan?: PlanEffect, expectedSemester?: string | null) {
    this.checkPeriod(after, expectedSemester);
    this.queue(changesBetween(before, after), plan);
  }
  editWeeklyResult(student: string, week: number, kind: "muraja" | "rabt", index: number, result: "" | "pass" | "fail", expectedSemester: string | null) {
    if (this.storeKey !== "weekly_tests") throw Error("مخزن الاختبار غير صالح");
    this.checkPeriod({}, expectedSemester);
    const path = [student, String(week), kind, String(index)], base = sharedCell(this.storeKey, this.view({} as T), path), next: Cell = { present: true, value: result };
    if (!equal(base, next)) this.queue([{ path, base, next }]);
  }
  private checkPeriod(after: object, expectedSemester?: string | null) {
    const snapshot = this.snapshot();
    if (!snapshot?.semester_scoped) return;
    const origin = expectedSemester !== undefined ? { known: true, active_semester_id: expectedSemester } : (after as { [GRADE_ORIGIN]?: Calendar })[GRADE_ORIGIN];
    if (!origin || !equal(origin, snapshot.calendar_context)) throw Error("تغيّر الفصل أو لم يُثبت سياق الشاشة؛ أعد تحميل بيانات الفصل قبل التسجيل. لم تُنقل درجات قديمة");
  }
  private queue(edits: { path: string[]; base: Cell; next: Cell }[], plan?: PlanEffect) {
    if (!edits.length) return;
    if (edits.length > 100) throw Error("التعديل كبير؛ احفظ دفعات أصغر دون إغلاق الصفحة");
    const snapshot = this.snapshot(), drafts = this.drafts(), calendar = snapshot?.calendar_context ?? { known: false, active_semester_id: null }, pending = drafts.filter(d => active(d) && (snapshot ? sameGradeStore(d.packet, snapshot) : !d.packet.semester_scoped && equal(d.packet.calendar_context, calendar))), dependencies = new Set<string>();
    let based = !!snapshot?.calendar_context.known;
    const changes = edits.map(change => {
      let expected = snapshot ? stamp(snapshot, change.path) : { ancestors: change.path.map(() => null), subtree: null };
      const predecessor = [...pending].reverse().find(d => d.packet.changes.some(c => equal(c.path, change.path)));
      if (predecessor) { dependencies.add(predecessor.packet.operation_id); expected = { ...expected, subtree: predecessor.packet.operation_id }; }
      else if (!snapshot || !equal(sharedCell(this.storeKey, snapshot.value, change.path), change.base)) based = false;
      return { ...change, stamp: expected };
    });
    this.write({ packet: { operation_id: this.id(), calendar_context: calendar, changes, ...(this.storeKey === "grades" ? {} : { store_key: this.storeKey }), ...(snapshot?.semester_scoped ? { semester_scoped: true } : {}), ...(plan ? { plan } : {}) }, order: Math.max(0, ...drafts.map(d => d.order)) + 1, dependencies: [...dependencies], status: based && (!plan || !!plan.expected_assignment_id) ? "pending" : "unbased" });
  }
  async flush(send: (packet: GradePacket) => Promise<{ ok: boolean; operation_id: string; input_sha256: string }>, current = () => true) {
    for (const initial of this.drafts().filter(d => d.status === "pending")) {
      if (!current()) return;
      const drafts = this.drafts(), draft = drafts.find(d => d.packet.operation_id === initial.packet.operation_id)!;
      if (draft.status !== "pending" || draft.dependencies.some(id => drafts.find(d => d.packet.operation_id === id)?.status !== "confirmed")) continue;
      try {
        const receipt = await send(clone(draft.packet));
        if (!receipt.ok || receipt.operation_id !== draft.packet.operation_id || !/^[a-f0-9]{64}$/.test(receipt.input_sha256)) throw Error("لم يؤكد الخادم هوية الحفظ؛ بقي الطلب معلقًا");
        // Update only this operation. A concurrent tap/tab remains an independent durable packet.
        this.write({ ...draft, status: "confirmed", message: undefined });
      } catch (error) {
        const conflict = object(error) && error.status === 409;
        this.write({ ...draft, status: conflict ? "conflict" : "pending", message: error instanceof Error ? error.message : "لم يتأكد الحفظ" });
        if (!conflict) throw error;
      }
    }
  }
  /** Explicit user decision creates a new request; an old operation ID is never repurposed. */
  reviewChain(id: string): GradeDraft[] {
    const included = new Set([id]), drafts = this.drafts().filter(active);
    for (let pass = 0; pass < drafts.length; pass++) for (const draft of drafts) if (draft.dependencies.some(parent => included.has(parent))) included.add(draft.packet.operation_id);
    return drafts.filter(d => included.has(d.packet.operation_id));
  }
  reviewChanges(id: string): Change[] {
    const latest = new Map<string, Change>();
    for (const draft of this.reviewChain(id)) for (const change of draft.packet.changes) latest.set(JSON.stringify(change.path), change);
    return [...latest.values()];
  }
  resolve(id: string, useDraft: boolean) {
    const all = this.drafts(), draft = all.find(d => d.packet.operation_id === id), snapshot = this.snapshot();
    if (!draft || !["conflict", "unbased"].includes(draft.status) || !snapshot?.calendar_context.known) throw Error("حدّث البيانات قبل مراجعة التعارض");
    const chain = this.reviewChain(id), changes = this.reviewChanges(id);
    if (useDraft && chain.some(d => d.packet.plan)) throw Error("هذه المسودة مرتبطة بخطة؛ راجع التعيين والإنجاز قبل إعادة تسجيلها، دون إسنادها لخطة جديدة تلقائيًا");
    if (useDraft && chain.some(d => !sameGradeStore(d.packet, snapshot))) throw Error("تغيّر الفصل أو مخزن التسجيل؛ راجع المسودة وسجّلها يدويًا في سياقها الصحيح");
    if (changes.length > 100) throw Error("المسودة المرتبطة كبيرة؛ يلزم تقسيمها قبل الحسم");
    if (useDraft) this.write({ ...draft, packet: { operation_id: this.id(), ...(this.storeKey === "grades" ? {} : { store_key: this.storeKey }), ...(snapshot.semester_scoped ? { semester_scoped: true } : {}), calendar_context: snapshot.calendar_context, changes: changes.map(c => ({ ...c, base: sharedCell(this.storeKey, snapshot.value, c.path), stamp: stamp(snapshot, c.path) })) }, order: Math.max(...all.map(d => d.order)) + 1, status: "pending", dependencies: [] });
    for (const member of chain) this.write({ ...member, status: useDraft ? "superseded" : "discarded" });
  }
}
