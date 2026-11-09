import type { GradesStore } from "./mock-data";

type Cell = { present: false } | { present: true; value: unknown };
type Stamp = { ancestors: (string | null)[]; subtree: string | null };
type Change = { path: string[]; base: Cell; next: Cell; stamp: Stamp };
type GradeEdit = Omit<Change, "stamp">;
type Calendar = { known: boolean; active_semester_id: string | null };
export type PlanEffect = { student_id: string; expected_assignment_id: string; task_type: "hifz" | "rabt" | "muraja"; action: "record" | "undo" | "compensation"; tap: "half" | "one" | "two"; completed_at: string; cell_path: string[] };
export type GradePacket = { operation_id: string; calendar_context: Calendar; changes: Change[]; plan?: PlanEffect };
export type GradeSnapshot<T = GradesStore> = { protocol: 1; context_complex_id: number; cursor?: string; value: T; calendar_context: Calendar; versions: Record<string, { direct_version: string | null; subtree_version: string | null }> };
export type GradeSnapshotResult<T = GradesStore> = GradeSnapshot<T> | { protocol: 1; context_complex_id: number; cursor: string; unchanged: true };
export type GradeDraft = { packet: GradePacket; order: number; dependencies: string[]; status: "pending" | "unbased" | "conflict" | "confirmed" | "superseded" | "discarded" | "reconciled" | "archived"; message?: string; observed?: boolean };
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
  return !!draft.packet.plan || (draft.message === planRequiredMessage && draft.packet.changes.some(change =>
    !isEmptyCompensationDefault(change) && ["hifz", "rabt", "muraja", "compensationFaces"].includes(change.path.at(-1) ?? "")));
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
function stamp(snapshot: GradeSnapshot<unknown>, path: string[]): Stamp {
  return { ancestors: path.map((_, i) => snapshot.versions[JSON.stringify(path.slice(0, i))]?.direct_version ?? null), subtree: snapshot.versions[JSON.stringify(path)]?.subtree_version ?? null };
}
const active = (draft: GradeDraft) => ["pending", "unbased", "conflict"].includes(draft.status);
const namespace = "qhp_grade_outbox_v1:";
const quotaMessage = "امتلأ تخزين المتصفح. بقيت المسودة في الصفحة فقط. لا تغلقها قبل تأكيد الحفظ أو تنزيل المسودة.";
const isQuotaError = (error: unknown) => object(error) &&
  (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED" || error.code === 22 || error.code === 1014);
type StorageState = {
  snapshots: Map<string, GradeSnapshot<unknown>>;
  fallback: Map<string, GradeDraft>;
  indexed: Set<string>;
  dirty: Set<string>;
  loading: Map<string, Promise<void>>;
  writes: Promise<void>;
};
const storageStates = new WeakMap<Storage, StorageState>();
let draftDatabase: Promise<IDBDatabase> | undefined;
function keepDraftPageOpen(event: BeforeUnloadEvent) {
  event.preventDefault();
  event.returnValue = "";
}

function openDraftDatabase(): Promise<IDBDatabase> {
  if (!draftDatabase) {
    draftDatabase = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("qhp-grade-draft-fallback", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("drafts");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(Error(quotaMessage));
    }).catch(error => { draftDatabase = undefined; throw error; });
  }
  return draftDatabase;
}

function fallbackTransaction(database: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => void) {
  return new Promise<void>((resolve, reject) => {
    const tx = database.transaction("drafts", mode);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? Error(quotaMessage));
    run(tx.objectStore("drafts"));
  });
}
export const cancelsDayGrade = (draft: GradeDraft): boolean => draft.packet.changes.some(({path,base,next}) =>
  path.length===5 && path[2]==="days" && ["attendance","hifz","rabt","muraja"].includes(path[4]) &&
  base.present && base.value!=="" && (!next.present || next.value==="" ||
    (["rabt","muraja"].includes(path[4]) && base.value==="pass" && next.value==="fail")));

/** Each immutable packet has its own storage key: two tabs cannot replace each other's queues. */
export class GradeOutbox<T extends Record<string, unknown> = GradesStore> {
  readonly prefix: string;
  private state: StorageState;
  constructor(private storage: Storage, scope: string, private id = () => crypto.randomUUID(), private changed = () => {}) {
    this.prefix = namespace + encodeURIComponent(scope) + ":";
    let state = storageStates.get(storage);
    if (!state) {
      state = { snapshots: new Map(), fallback: new Map(), indexed: new Set(), dirty: new Set(), loading: new Map(), writes: Promise.resolve() };
      storageStates.set(storage, state);
    }
    this.state = state;
  }
  snapshot(): GradeSnapshot<T> | null {
    const cached = this.state.snapshots.get(this.prefix);
    if (cached) return cached as GradeSnapshot<T>;
    const raw = this.storage.getItem(this.prefix + "snapshot");
    if (!raw) return null;
    let snapshot: GradeSnapshot<T>;
    try { snapshot = JSON.parse(raw) as GradeSnapshot<T>; }
    catch { return null; }
    if (!snapshot || snapshot.protocol !== 1 || !object(snapshot.value) || !object(snapshot.versions)) return null;
    this.state.snapshots.set(this.prefix, snapshot);
    return snapshot;
  }
  private get operationPrefix() { return this.prefix + "operation:"; }
  volatileDrafts(): GradeDraft[] {
    return [...this.state.dirty].filter(key => key.startsWith(this.operationPrefix))
      .map(key => this.state.fallback.get(key)!);
  }
  async hydrate() {
    if (typeof indexedDB === "undefined") return;
    let pending = this.state.loading.get(this.prefix);
    if (!pending) {
      pending = openDraftDatabase().then(database => fallbackTransaction(database, "readonly", store => {
        const range = IDBKeyRange.bound(this.operationPrefix, this.operationPrefix + "\uffff");
        const request = store.openCursor(range);
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          const key = String(cursor.key);
          this.state.indexed.add(key);
          if (!this.state.dirty.has(key)) this.state.fallback.set(key, cursor.value as GradeDraft);
          cursor.continue();
        };
      })).then(() => this.changed()).catch(() => undefined);
      this.state.loading.set(this.prefix, pending);
    }
    await pending;
  }
  async persistVolatile() {
    const persist = async () => {
      const keys = [...this.state.dirty].filter(key => key.startsWith(this.operationPrefix));
      if (!keys.length) return;
      try {
        const entries: [string, GradeDraft][] = [];
        for (const key of keys) {
          const draft = this.state.fallback.get(key)!;
          if (!this.state.indexed.has(key)) {
            try {
              this.storage.setItem(key, JSON.stringify(draft));
              this.state.dirty.delete(key);
              this.state.fallback.delete(key);
              continue;
            } catch { /* The alternate store may still be available. */ }
          }
          entries.push([key, draft]);
        }
        if (entries.length) {
          const database = await openDraftDatabase();
          await fallbackTransaction(database, "readwrite", store => {
            for (const [key, draft] of entries) store.put(draft, key);
          });
          for (const [key, draft] of entries) {
            this.state.indexed.add(key);
            if (this.state.fallback.get(key) === draft) this.state.dirty.delete(key);
          }
        }
        if (!this.state.dirty.size && typeof window !== "undefined") window.removeEventListener("beforeunload", keepDraftPageOpen);
        this.changed();
      } catch { throw Error(quotaMessage); }
    };
    const pending = this.state.writes.then(persist, persist);
    this.state.writes = pending.catch(() => undefined);
    await pending;
  }
  drafts(): GradeDraft[] {
    const result = new Map<string, GradeDraft>();
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      const raw = key?.startsWith(this.operationPrefix) ? this.storage.getItem(key) : null;
      if (key && raw) result.set(key, JSON.parse(raw));
    }
    for (const [key, draft] of this.state.fallback) if (key.startsWith(this.operationPrefix)) result.set(key, draft);
    return [...result.values()].sort((a, b) => a.order - b.order || a.packet.operation_id.localeCompare(b.packet.operation_id));
  }
  private write(draft: GradeDraft) {
    const key = this.operationPrefix + draft.packet.operation_id;
    if (!this.state.fallback.has(key)) {
      const raw = JSON.stringify(draft);
      try {
        this.storage.setItem(key, raw);
        this.changed();
        return;
      } catch (error) {
        if (!isQuotaError(error)) throw error;
        // Older releases cached full grades and all revision paths for each account.
        this.snapshot();
        const caches: string[] = [];
        for (let i = 0; i < this.storage.length; i++) {
          const item = this.storage.key(i);
          if (item?.startsWith(namespace) && /^[^:]+:snapshot$/.test(item.slice(namespace.length))) caches.push(item);
        }
        for (const item of caches) this.storage.removeItem(item);
        try {
          this.storage.setItem(key, raw);
          this.changed();
          return;
        } catch (retryError) { if (!isQuotaError(retryError)) throw retryError; }
      }
    }
    this.state.fallback.set(key, draft);
    this.state.dirty.add(key);
    if (typeof window !== "undefined") window.addEventListener("beforeunload", keepDraftPageOpen);
    this.changed();
    void this.persistVolatile().catch(() => this.changed());
  }
  accept(snapshot: GradeSnapshot<T>) {
    if (snapshot.protocol !== 1 || !object(snapshot.value) || !object(snapshot.versions) || !snapshot.calendar_context || typeof snapshot.calendar_context.known !== "boolean") throw Error("لم يؤكد الخادم بروتوكول الحفظ؛ بقيت المسودات محفوظة");
    this.state.snapshots.set(this.prefix, snapshot);
    this.storage.removeItem(this.prefix + "snapshot");
    const drafts = this.drafts();
    const referenced = new Set(drafts.filter(active).flatMap(draft => draft.dependencies));
    for (const draft of drafts) {
      if (draft.status !== "confirmed") continue;
      const visible = equal(draft.packet.calendar_context, snapshot.calendar_context) &&
        draft.packet.changes.every(change => stamp(snapshot, change.path).subtree === draft.packet.operation_id ||
          equal(at(snapshot.value, change.path), change.next));
      const key = this.operationPrefix + draft.packet.operation_id;
      if ((draft.observed || visible) && !referenced.has(draft.packet.operation_id) && !this.state.fallback.has(key)) {
        this.storage.removeItem(key);
      } else if (!draft.observed) this.write({ ...draft, observed: true });
    }
    this.reconcile(snapshot);
    this.changed();
  }
  private reconciliationStatus(draft: GradeDraft, snapshot: GradeSnapshot<T>): "reconciled" | "archived" | undefined {
    const { packet } = draft;
    if (!equal(packet.calendar_context, snapshot.calendar_context)) return;
    const decisions = packet.changes.map(change => {
        const saved = at(snapshot.value, change.path);
        if (equal(saved, change.next) || (!saved.present && isEmptyCompensationDefault(change))) return "same";
        if (!saved.present && !change.base.present && change.next.present && change.next.value === "" &&
          change.path.length === 5 && change.path[2] === "days" &&
          ["hifz", "rabt", "muraja"].includes(change.path[4])) return "same";
        // A real change to a previously empty cell still needs review. The
        // absence of a saved grade does not prove that this edit is obsolete.
        return saved.present || change.base.present ? "server" : "unresolved";
    });
    if (decisions.every(decision => decision === "same") && !packet.plan) return "reconciled";
    if (!cancelsDayGrade(draft) && decisions.includes("server") && !decisions.includes("unresolved")) return "archived";
  }
  reconcile(snapshot: GradeSnapshot<T>) {
    if (!snapshot.calendar_context.known) return;
    const drafts = this.drafts();
    const confirmed = new Set(drafts.filter(draft => draft.status === "confirmed").map(draft => draft.packet.operation_id));
    for (const root of drafts) {
      if ((root.status !== "conflict" && root.status !== "unbased") ||
          root.dependencies.some(id => !confirmed.has(id))) continue;
      const chain = this.reviewChain(root.packet.operation_id);
      const blocked = new Set<string>();
      const settled: GradeDraft[] = [];
      for (const draft of chain) {
        // A child of a rejected or unbased packet cannot have been sent:
        // flush requires every predecessor to be confirmed. Leave previously
        // attempted requests alone even if an old queue contains such a child.
        if (draft.status === "pending" && (draft.message || !draft.dependencies.some(id => blocked.has(id)))) break;
        if (draft.dependencies.some(id => !confirmed.has(id) && !blocked.has(id))) break;
        const status = this.reconciliationStatus(draft, snapshot);
        if (!status) break;
        blocked.add(draft.packet.operation_id);
        settled.push({ ...draft, status });
      }
      // Settle children first so an interrupted local write cannot leave
      // a pending child permanently waiting for an archived parent.
      if (settled.length === chain.length) for (const draft of settled.reverse()) this.write(draft);
    }
  }
  view(fallback: T): T {
    const value = clone(this.snapshot()?.value ?? fallback);
    for (const draft of this.drafts().filter(d => active(d) || d.status === "confirmed" && !d.observed)) for (const change of draft.packet.changes) set(value, change.path, change.next);
    return value;
  }
  edit(before: T, after: T, plan?: PlanEffect) {
    const edits = changesBetween(before, after).filter(change =>
      !isEmptyCompensationDefault(change) || !!plan && equal(change.path, plan.cell_path));
    this.enqueueEdits(edits, plan);
  }
  editCell(before: T, path: string[], value: string) {
    const base = at(before, path);
    const next: Cell = value ? { present: true, value } : { present: false };
    if (!equal(base, next)) this.enqueueEdits([{ path, base, next }]);
  }
  private enqueueEdits(edits: GradeEdit[], plan?: PlanEffect) {
    if (!edits.length) return;
    if (edits.length > 100) throw Error("التعديل كبير؛ احفظ دفعات أصغر دون إغلاق الصفحة");
    const snapshot = this.snapshot(), drafts = this.drafts(), dependencies = new Set<string>();
    let based = !!snapshot?.calendar_context.known;
    const changes = edits.map(change => {
      let expected = snapshot ? stamp(snapshot, change.path) : { ancestors: change.path.map(() => null), subtree: null };
      const predecessor = [...drafts].reverse().find(d =>
        (active(d) || d.status==="confirmed" && !d.observed &&
          expected.subtree!==d.packet.operation_id) &&
        d.packet.changes.some(c => equal(c.path, change.path)));
      if (predecessor) { dependencies.add(predecessor.packet.operation_id); expected = { ...expected, subtree: predecessor.packet.operation_id }; }
      else if (!snapshot || !equal(at(snapshot.value, change.path), change.base)) based = false;
      return { ...change, stamp: expected };
    });
    this.write({ packet: { operation_id: this.id(), calendar_context: snapshot?.calendar_context ?? { known: false, active_semester_id: null }, changes, ...(plan ? { plan } : {}) }, order: Math.max(0, ...drafts.map(d => d.order)) + 1, dependencies: [...dependencies], status: based && (!plan || !!plan.expected_assignment_id) ? "pending" : "unbased" });
  }
  async flush(send: (packet: GradePacket) => Promise<{ ok: boolean; operation_id: string; input_sha256: string }>, current = () => true) {
    await this.hydrate();
    await this.persistVolatile();
    for (const initial of this.drafts().filter(d => d.status === "pending")) {
      if (!current()) return;
      const drafts = this.drafts(), draft = drafts.find(d => d.packet.operation_id === initial.packet.operation_id);
      if (draft?.status !== "pending" || draft.dependencies.some(id => {
        const parent = drafts.find(d => d.packet.operation_id === id);
        return parent ? parent.status !== "confirmed" : !draft.packet.changes.some(change => change.stamp.subtree === id);
      })) continue;
      try {
        const receipt = await send(clone(draft.packet));
        if (!receipt.ok || receipt.operation_id !== draft.packet.operation_id || !/^[a-f0-9]{64}$/.test(receipt.input_sha256)) throw Error("لم يؤكد الخادم هوية الحفظ؛ بقي الطلب معلقًا");
      } catch (error) {
        const conflict = object(error) && error.status === 409;
        this.write({ ...draft, status: conflict ? "conflict" : "pending", message: error instanceof Error ? error.message : "لم يتأكد الحفظ" });
        if (!conflict) throw error;
        continue;
      }
      this.write({ ...draft, status: "confirmed", message: undefined });
      await this.persistVolatile();
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
