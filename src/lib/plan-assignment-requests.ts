/** Durable transport requests only. Student plans/history remain on their existing server paths. */
export type AssignmentRequestContext = { session: string; owner: string };
export type AssignmentReceipt = {
  ok: boolean;
  operation_id: string;
  operation_applied: boolean;
  assignment_id?: string;
  sard_queue?: unknown[] | null;
  replayed?: boolean;
};
type PendingAssignment = { version: 1; id: string; intent: string; body: string; blocked?: boolean };
const prefix = "qs_plan_assignment_requests_v1:";
const inFlight = new Map<string, Promise<void>>();

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    return Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]));
  });
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, "0")).join("");
}

function savedRequests(root: string, intent: string): { key: string; value: PendingAssignment }[] {
  const out: { key: string; value: PendingAssignment }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(root)) continue;
    let value: PendingAssignment;
    try { value = JSON.parse(localStorage.getItem(key) ?? "null") as PendingAssignment; }
    catch { throw new Error("تعذّر قراءة طلب خطة محفوظ؛ بقي مصدره دون تغيير ولم يُرسل طلب جديد"); }
    if (!value || value.version !== 1 || typeof value.id !== "string" || key !== root + value.id
      || typeof value.intent !== "string" || typeof value.body !== "string") {
      throw new Error("طلب خطة محفوظ غير مكتمل؛ يلزم مراجعته دون حذفه أو إعادة تعيين الطالب");
    }
    if (value.intent === intent) out.push({ key, value });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

/** A resumed request always uses its original body/expected assignment, even after a reload. */
export function runPlanAssignmentRequest(options: {
  context: () => AssignmentRequestContext;
  intent: unknown;
  prepare: () => Promise<Record<string, unknown>>;
  send: (body: Record<string, unknown>) => Promise<AssignmentReceipt>;
  verify: (receipt: AssignmentReceipt, current: () => void) => Promise<void>;
}): Promise<void> {
  const before = options.context();
  if (!before.session) return Promise.reject(new Error("غير مسجل الدخول"));
  const intent = canonical(options.intent);
  // Same-page double clicks share preparation, persistence, request and verification.
  const flightKey = canonical([before.session, before.owner, intent]);
  const running = inFlight.get(flightKey);
  if (running) return running;
  const current = () => {
    const now = options.context();
    if (now.session !== before.session || now.owner !== before.owner) {
      throw new Error("تغيّرت الجلسة أثناء طلب الخطة؛ بقي الطلب محفوظًا للتحقق دون إعادة التعيين");
    }
  };
  const run = async () => {
    const root = prefix + await digest(before.owner) + ":" + await digest(intent) + ":";
    current();
    let requests = savedRequests(root, intent);
    let fresh = false;
    if (!requests.length) {
      const body = canonical(await options.prepare());
      current();
      // A different tab may have persisted this exact intent while preparation was in flight.
      requests = savedRequests(root, intent);
      if (!requests.length) {
        const value: PendingAssignment = { version: 1, id: crypto.randomUUID(), intent, body };
        const key = root + value.id;
        localStorage.setItem(key, JSON.stringify(value)); // Must succeed before any POST.
        requests = [{ key, value }];
        fresh = true;
      }
    }
    if (requests.some(request => request.value.blocked)) {
      throw new Error("لم يؤكد الخادم بروتوكول طلب سابق؛ تحقّق من الخطة ونسخة الخادم قبل إعادة إرساله");
    }
    if (new Set(requests.map(request => request.value.body)).size !== 1) {
      throw new Error("توجد طلبات محفوظة لهذه الخطة ببيانات بداية مختلفة؛ بقيت للمراجعة دون اختيار أحدها بالتخمين");
    }
    const send = async (request: typeof requests[number], probe: boolean) => {
      current();
      const payload = JSON.parse(request.value.body) as Record<string, unknown>;
      const result = await options.send({ ...payload, operation_id: request.value.id, ...(probe ? { operation_probe: true } : {}) });
      current();
      if (result.ok !== true || result.operation_id !== request.value.id || typeof result.operation_applied !== "boolean"
        || (result.operation_applied && (typeof result.assignment_id !== "string" || !result.assignment_id))) {
        localStorage.setItem(request.key, JSON.stringify({ ...request.value, blocked: true }));
        throw new Error("تعذّر تأكيد إيصال طلب الخطة من الخادم؛ لم يُؤكَّد نجاح الربط");
      }
      return result;
    };
    let receipt: AssignmentReceipt | undefined;
    if (!fresh) {
      // Do not choose which tab committed by its timestamp or UUID. Ask the server for every candidate.
      for (const request of requests) {
        const result = await send(request, true);
        if (result.operation_applied) {
          if (receipt && receipt.assignment_id !== result.assignment_id) {
            throw new Error("إيصالات متعارضة لطلب الخطة؛ بقيت محفوظة للمراجعة دون إعادة التعيين");
          }
          receipt = result;
        }
      }
    }
    if (!receipt) receipt = await send(requests[0], false);
    if (!receipt.operation_applied) throw new Error("لم يؤكد الخادم تنفيذ طلب الخطة");
    await options.verify(receipt, current);
    current();
    // Remove acknowledged transport requests only, after read-back; never any student record.
    // Remove the winning receipt identity last. If cleanup fails part way through,
    // its proof remains available to recover every remaining duplicate after reload.
    const cleanup = [...requests].sort((a, b) => Number(a.value.id === receipt!.operation_id) - Number(b.value.id === receipt!.operation_id));
    for (const request of cleanup) localStorage.removeItem(request.key);
  };
  const promise = run().finally(() => { if (inFlight.get(flightKey) === promise) inFlight.delete(flightKey); });
  inFlight.set(flightKey, promise);
  return promise;
}
