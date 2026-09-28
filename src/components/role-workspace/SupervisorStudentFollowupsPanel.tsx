import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, Clock3, Plus, Send } from "lucide-react";
import { toast } from "sonner";
import { loadHalaqat, loadStudents } from "@/lib/mock-data";
import { changeStudentFollowup, followupDaysLeft, listStudentFollowups, type StudentFollowup } from "@/lib/student-followups";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function SupervisorStudentFollowupsPanel() {
  const [items, setItems] = useState<StudentFollowup[]>([]);
  const [today, setToday] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [extending, setExtending] = useState<StudentFollowup | null>(null);
  const [halaqaId, setHalaqaId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [note, setNote] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const halaqat = loadHalaqat().filter((h) => h.id > 0);
  const students = loadStudents();

  const refresh = useCallback(async () => {
    try {
      const data = await listStudentFollowups();
      setItems(data.items);
      setToday(data.today);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحميل المتابعات");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(interval);
  }, [refresh]);

  const selectedStudents = useMemo(
    () => students.filter((s) => String(s.halaqaId) === halaqaId),
    [students, halaqaId],
  );
  const groups = halaqat.map((h) => ({
    halaqa: h,
    entries: items.filter((item) => item.halaqaId === h.id),
  })).filter((group) => group.entries.length > 0);
  const dueCount = items.filter((item) => today && item.dueDate <= today && item.status === "active").length;

  const add = async () => {
    if (!halaqaId || !studentId || !note.trim() || !dueDate) {
      toast.error("اختر الحلقة والطالب، وأدخل الملاحظة وموعد الانتهاء");
      return;
    }
    setBusy(true);
    try {
      await changeStudentFollowup({ action: "create", halaqaId: Number(halaqaId), studentId, note: note.trim(), dueDate });
      setAdding(false);
      setStudentId("");
      setNote("");
      setDueDate("");
      await refresh();
      toast.success("أُضيف الطالب للمتابعة");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّرت الإضافة");
    } finally {
      setBusy(false);
    }
  };

  const complete = async (item: StudentFollowup) => {
    setBusy(true);
    try {
      await changeStudentFollowup({ action: "complete", id: item.id });
      await refresh();
      toast.success("اكتملت المتابعة وأُزيلت من القائمة");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر إكمال المتابعة");
    } finally {
      setBusy(false);
    }
  };

  const extend = async () => {
    if (!extending || !newDueDate) return;
    setBusy(true);
    try {
      await changeStudentFollowup({ action: "extend", id: extending.id, dueDate: newDueDate });
      setExtending(null);
      setNewDueDate("");
      await refresh();
      toast.success("حُدّد موعد جديد للمتابعة");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تمديد المهلة");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold">متابعة الطلاب</h2>
          <p className="text-sm text-muted-foreground">الطلاب المضافون للمتابعة، مرتّبون بحسب الحلقة</p>
        </div>
        <Button onClick={() => setAdding(true)}><Plus className="w-4 h-4 ml-2" /> إضافة</Button>
      </div>
      {dueCount > 0 && (
        <div role="alert" className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm font-semibold">
          <Clock3 className="inline w-4 h-4 ml-1" /> حان موعد متابعة {dueCount} من الطلاب. راجعهم وحدد «تم» أو «مهلة».
        </div>
      )}
      {loading ? <p className="text-sm text-muted-foreground">جارٍ تحميل المتابعات…</p> : groups.length === 0 ? (
        <p className="rounded-xl border p-8 text-center text-muted-foreground">لا توجد متابعات نشطة</p>
      ) : groups.map(({ halaqa, entries }) => (
        <Card key={halaqa.id}>
          <CardHeader><CardTitle className="text-base">{halaqa.name} <span className="text-sm text-muted-foreground">({entries.length})</span></CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {entries.map((item) => {
              const left = followupDaysLeft(item.dueDate, today);
              const due = left <= 0;
              return (
                <div key={item.id} className="rounded-xl border p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="font-semibold">{item.studentName} <span className="text-xs text-muted-foreground">المتابعة {item.round} من 3{item.status === "escalated" ? " · رُفع للمدير" : ""}</span></div>
                    <p className="text-sm whitespace-pre-wrap break-words">{item.note}</p>
                    <p className="text-xs text-muted-foreground"><CalendarDays className="inline w-3 h-3 ml-1" /> موعد الانتهاء: {item.dueDate} · {due ? "حان موعد المتابعة" : `متبقي ${left} يوم`}</p>
                  </div>
                  {item.status === "active" && <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void complete(item)}><Check className="w-4 h-4 ml-1" /> تم</Button>
                    {due && item.round < 3 && (
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => { setExtending(item); setNewDueDate(""); }}>
                        <Clock3 className="w-4 h-4 ml-1" /> مهلة
                      </Button>
                    )}
                  </div>}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>إضافة متابعة طالب</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <label className="block text-sm">الحلقة
              <select className="w-full mt-1 rounded-md border bg-background p-2" value={halaqaId} onChange={(e) => { setHalaqaId(e.target.value); setStudentId(""); }}>
                <option value="">اختر الحلقة</option>
                {halaqat.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </label>
            <label className="block text-sm">الطالب
              <select className="w-full mt-1 rounded-md border bg-background p-2" value={studentId} disabled={!halaqaId} onChange={(e) => setStudentId(e.target.value)}>
                <option value="">اختر الطالب</option>
                {selectedStudents.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="block text-sm">الملاحظة
              <textarea className="w-full mt-1 rounded-md border bg-background p-2 min-h-24" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <label className="block text-sm">موعد الانتهاء
              <Input type="date" className="mt-1" min={today} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
            <Button className="w-full" disabled={busy} onClick={() => void add()}>حفظ المتابعة</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!extending} onOpenChange={(open) => { if (!open) setExtending(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>منح مهلة جديدة — {extending?.studentName}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">بعد المهلة الثانية، يُرفع الطالب للمدير تلقائيًا عند حلول الموعد الثالث.</p>
          <Input type="date" min={today} value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} />
          <Button disabled={busy || !newDueDate} onClick={() => void extend()}><Send className="w-4 h-4 ml-2" /> حفظ المهلة</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
