import type { Notification } from "./mock-data";

export type TransferCommand = { operation_id: string; thread_id: string; expected_version: string | null; type: "create" | "forward" | "action"; student_id?: string; week?: number; reason?: string; target_role?: "secretary" | "supervisor"; text?: string; status?: "closed" | "struggling" | null };
export type TransferSnapshot = { protocol: 1; context_complex_id: number; notifications: Notification[]; versions: Record<string, string> };
export type TransferDraft = { packet: TransferCommand; order: number; dependency?: string; status: "pending" | "confirmed" | "conflict" | "discarded"; message?: string };
export class TransferOutbox {
  readonly prefix: string;
  constructor(private storage: Storage, scope: string, private id = () => crypto.randomUUID(), private changed = () => {}) { this.prefix = "qhp_transfer_outbox_v1:" + encodeURIComponent(scope) + ":"; }
  snapshot(): TransferSnapshot | null { const raw = this.storage.getItem(this.prefix + "snapshot"); return raw ? JSON.parse(raw) : null; }
  accept(snapshot: TransferSnapshot, cid: number) {
    if (snapshot.protocol !== 1 || snapshot.context_complex_id !== cid || !Array.isArray(snapshot.notifications) || !snapshot.versions || typeof snapshot.versions !== "object" || Array.isArray(snapshot.versions) || snapshot.notifications.some(n => !n || typeof n.id !== "string" || !n.sharedTransferId || typeof snapshot.versions[n.sharedTransferId] !== "string")) throw Error("لم يؤكد الخادم سياق التحويلات؛ بقيت المسودات");
    this.storage.setItem(this.prefix + "snapshot", JSON.stringify(snapshot)); this.changed();
  }
  drafts(): TransferDraft[] {
    const rows: TransferDraft[] = [];
    for (let i = 0; i < this.storage.length; i++) { const key = this.storage.key(i); if (key?.startsWith(this.prefix + "operation:")) rows.push(JSON.parse(this.storage.getItem(key)!)); }
    return rows.sort((a, b) => a.order - b.order || a.packet.operation_id.localeCompare(b.packet.operation_id));
  }
  private write(draft: TransferDraft) {
    const key = this.prefix + "operation:" + draft.packet.operation_id, previous = this.storage.getItem(key);
    if (previous && JSON.parse(previous).status === "confirmed" && draft.status !== "confirmed") return;
    this.storage.setItem(key, JSON.stringify(draft)); this.changed();
  }
  create(student: string, week: number, reason: string): string {
    const pending = this.drafts().find(d => d.status === "pending" && d.packet.type === "create" && d.packet.student_id === student && d.packet.week === week && d.packet.reason === reason);
    if (pending) return pending.packet.operation_id;
    const operation = this.id(); this.queue({ operation_id: operation, thread_id: "tr-" + operation, expected_version: null, type: "create", student_id: student, week, reason }); return operation;
  }
  command(notificationId: string, change: { type: "forward"; target_role: "secretary" | "supervisor" } | { type: "action"; text: string; status?: "closed" | "struggling" | null }): string {
    const snapshot = this.snapshot(), row = snapshot?.notifications.find(n => n.id === notificationId), thread = row?.sharedTransferId;
    if (!thread || !snapshot?.versions[thread]) throw Error("لا توجد نسخة مشتركة مؤكدة لهذا التحويل؛ حدّث القائمة. لم تُرفع سجلات قديمة");
    const duplicate = this.drafts().find(d => d.status === "pending" && d.packet.thread_id === thread && d.packet.type === change.type && (change.type === "forward" ? d.packet.target_role === change.target_role : d.packet.text === change.text && (d.packet.status ?? null) === (change.status ?? null)));
    if (duplicate) return duplicate.packet.operation_id;
    const previous = this.drafts().filter(d => d.packet.thread_id === thread && d.status === "pending").at(-1), operation = this.id();
    this.queue({ operation_id: operation, thread_id: thread, expected_version: previous?.packet.operation_id ?? snapshot.versions[thread], ...change }, previous?.packet.operation_id); return operation;
  }
  private queue(packet: TransferCommand, dependency?: string) { this.write({ packet, dependency, order: Math.max(0, ...this.drafts().map(d => d.order)) + 1, status: "pending" }); }
  async flush(send: (packet: TransferCommand) => Promise<{ ok: boolean; operation_id: string; thread_id: string; input_sha256: string }>, current = () => true) {
    for (const initial of this.drafts().filter(d => d.status === "pending")) {
      if (!current()) return;
      const all = this.drafts(), draft = all.find(d => d.packet.operation_id === initial.packet.operation_id)!;
      if (draft.status !== "pending" || draft.dependency && all.find(d => d.packet.operation_id === draft.dependency)?.status !== "confirmed") continue;
      try {
        const receipt = await send(structuredClone(draft.packet));
        if (!receipt.ok || receipt.operation_id !== draft.packet.operation_id || receipt.thread_id !== draft.packet.thread_id || !/^[a-f0-9]{64}$/.test(receipt.input_sha256)) throw Error("لم يؤكد الخادم هوية إجراء التحويل؛ بقي الطلب معلقًا");
        this.write({ ...draft, status: "confirmed", message: undefined });
      } catch (error) {
        if (this.drafts().find(d => d.packet.operation_id === draft.packet.operation_id)?.status === "confirmed") continue;
        const status = error && typeof error === "object" && "status" in error ? error.status : undefined;
        this.write({ ...draft, status: [400, 401, 403, 409].includes(Number(status)) ? "conflict" : "pending", message: error instanceof Error ? error.message : "لم يتأكد الحفظ" });
        if (![400, 401, 403, 409].includes(Number(status))) throw error;
      }
    }
  }
  discard(id: string) {
    const all = this.drafts(), affected = new Set([id]);
    for (let i = 0; i < all.length; i++) for (const d of all) if (d.dependency && affected.has(d.dependency)) affected.add(d.packet.operation_id);
    for (const d of all) if (affected.has(d.packet.operation_id) && d.status !== "confirmed") this.write({ ...d, status: "discarded" });
  }
}
