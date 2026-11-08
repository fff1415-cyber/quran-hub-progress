import type { GradesStore } from "./mock-data";

type Cell = { present: false } | { present: true; value: unknown };
type Stamp = { ancestors: (string | null)[]; subtree: string | null };
type Change = { path: string[]; base: Cell; next: Cell; stamp: Stamp };
type GradeEdit = Omit<Change, "stamp">;
type Calendar = { known: boolean; active_semester_id: string | null };
export type PlanEffect = { student_id: string; expected_assignment_id: string; task_type: "hifz" | "rabt" | "muraja"; action: "record" | "undo" | "compensation"; tap: "half" | "one" | "two"; completed_at: string; cell_path: string[] };
export type GradePacket = { operation_id: string; calendar_context: Calendar; changes: Change[]; plan?: PlanEffect };
export type GradeSnapshot = { protocol: 1; context_complex_id: number; cursor?: string; value: GradesStore; calendar_context: Calendar; versions: Record<string, { direct_version: string | null; subtree_version: string | null }> };
export type GradeSnapshotResult = GradeSnapshot | { protocol: 1; context_complex_id: number; cursor: string; unchanged: true };
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
// Empty weeks populate these numeric fields with zero for display. A zero
// replacing an actual value is an edit and must still be sent.
function isEmptyCompensationDefault(edit: GradeEdit): boolean {
  const { path, base, next } = edit;
  return !base.present && next.present && next.value === 0 && (
    (path.length === 3 && ["compensationFaces", "compensationMurajaFaces"].includes(path[2])) ||
    (path.length === 5 && path[2] === "days" && path[4] === "compensationFaces")
  );
}
const planRequiredMessage = "هذه الدرجة مرتبطة بخطة؛ يلزم تسجيل الدرجة والإنجاز معًا، ولم يُحفظ جزء منفرد";
function requiresPlanReview(draft: GradeDraft): boolean {
  return !!draft.packet.plan || draft.message === planRequiredMessage;
}
function changesBetween(before: unknown, after: unknown, path: string[] = []): GradeEdit[] {
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
function stamp(snapshot: GradeSnapshot, path: string[]): Stamp {
  return { ancestors: path.map((_, i) => snapshot.versions[JSON.stringify(path.slice(0, i))]?.direct_version ?? null), subtree: snapshot.versions[JSON.stringify(path)]?.subtree_version ?? null };
}
const active = (draft: GradeDraft) => ["pending", "unbased", "conflict"].includes(draft.status);

/** Each immutable packet has its own storage key: two tabs cannot replace each other's queues. */
export class GradeOutbox {
  readonly prefix: string;
  constructor(private storage: Storage, scope: string, private id = () => crypto.randomUUID(), private changed = () => {}) { this.prefix = "qhp_grade_outbox_v1:" + encodeURIComponent(scope) + ":"; }
  snapshot(): GradeSnapshot | null { const raw = this.storage.getItem(this.prefix + "snapshot"); return raw ? JSON.parse(raw) : null; }
  drafts(): GradeDraft[] {
    const result: GradeDraft[] = [];
    for (let i = 0; i < this.storage.length; i++) { const key = this.storage.key(i); if (key?.startsWith(this.prefix + "operation:")) result.push(JSON.parse(this.storage.getItem(key)!)); }
    return result.sort((a, b) => a.order - b.order || a.packet.operation_id.localeCompare(b.packet.operation_id));
  }
  private write(draft: GradeDraft) { this.storage.setItem(this.prefix + "operation:" + draft.packet.operation_id, JSON.stringify(draft)); this.changed(); }
  accept(snapshot: GradeSnapshot) {
    if (snapshot.protocol !== 1 || !object(snapshot.value) || !object(snapshot.versions) || !snapshot.calendar_context || typeof snapshot.calendar_context.known !== "boolean") throw Error("لم يؤكد الخادم بروتوكول الحفظ؛ بقيت المسودات محفوظة");
    this.storage.setItem(this.prefix + "snapshot", JSON.stringify(snapshot));
    for (const draft of this.drafts()) if (draft.status === "confirmed" && !draft.observed) this.write({ ...draft, observed: true });
    this.changed();
  }
  view(fallback: GradesStore): GradesStore {
    const value = clone(this.snapshot()?.value ?? fallback);
    for (const draft of this.drafts().filter(d => active(d) || d.status === "confirmed" && !d.observed)) for (const change of draft.packet.changes) set(value, change.path, change.next);
    return value;
  }
  edit(before: GradesStore, after: GradesStore, plan?: PlanEffect) {
    const edits = changesBetween(before, after).filter(change =>
      !isEmptyCompensationDefault(change) || !!plan && equal(change.path, plan.cell_path));
    if (!edits.length) return;
    if (edits.length > 100) throw Error("التعديل كبير؛ احفظ دفعات أصغر دون إغلاق الصفحة");
    const snapshot = this.snapshot(), drafts = this.drafts(), pending = drafts.filter(active), dependencies = new Set<string>();
    let based = !!snapshot?.calendar_context.known;
    const changes = edits.map(change => {
      let expected = snapshot ? stamp(snapshot, change.path) : { ancestors: change.path.map(() => null), subtree: null };
      const predecessor = [...pending].reverse().find(d => d.packet.changes.some(c => equal(c.path, change.path)));
      if (predecessor) { dependencies.add(predecessor.packet.operation_id); expected = { ...expected, subtree: predecessor.packet.operation_id }; }
      else if (!snapshot || !equal(at(snapshot.value, change.path), change.base)) based = false;
      return { ...change, stamp: expected };
    });
    this.write({ packet: { operation_id: this.id(), calendar_context: snapshot?.calendar_context ?? { known: false, active_semester_id: null }, changes, ...(plan ? { plan } : {}) }, order: Math.max(0, ...drafts.map(d => d.order)) + 1, dependencies: [...dependencies], status: based && (!plan || !!plan.expected_assignment_id) ? "pending" : "unbased" });
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
    for (const draft of this.reviewChain(id)) for (const change of draft.packet.changes) {
      if (!isEmptyCompensationDefault(change) || equal(change.path, draft.packet.plan?.cell_path)) {
        latest.set(JSON.stringify(change.path), change);
      }
    }
    return [...latest.values()];
  }
  reviewRequiresPlan(id: string): boolean {
    return this.reviewChain(id).some(requiresPlanReview);
  }
  resolve(id: string, useDraft: boolean) {
    const all = this.drafts(), draft = all.find(d => d.packet.operation_id === id), snapshot = this.snapshot();
    if (!draft || !["conflict", "unbased"].includes(draft.status) || !snapshot?.calendar_context.known) throw Error("حدّث البيانات قبل مراجعة التعارض");
    const chain = this.reviewChain(id), changes = this.reviewChanges(id);
    if (useDraft && chain.some(requiresPlanReview)) throw Error("هذه المسودة مرتبطة بخطة؛ راجع التعيين والإنجاز قبل إعادة تسجيلها، دون إسنادها لخطة جديدة تلقائيًا");
    if (useDraft && chain.some(d => !equal(d.packet.calendar_context, snapshot.calendar_context))) throw Error("تغيّر الفصل؛ لن تُنقل المسودة إلى فصل آخر بالتخمين");
    if (useDraft && (!changes.length || changes.length > 100)) throw Error("لا توجد تعديلات قابلة للإرسال في هذه المسودة، أو أن الدفعة أكبر من الحد المسموح");
    if (useDraft) this.write({ ...draft, packet: { operation_id: this.id(), calendar_context: snapshot.calendar_context, changes: changes.map(c => ({ ...c, base: at(snapshot.value, c.path), stamp: stamp(snapshot, c.path) })) }, order: Math.max(...all.map(d => d.order)) + 1, status: "pending", dependencies: [] });
    for (const member of chain) this.write({ ...member, status: useDraft ? "superseded" : "discarded" });
  }
}
