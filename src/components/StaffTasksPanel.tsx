import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  changeStaffTask,
  listStaffTasks,
  STAFF_TASKS_CHANGED,
  type StaffTask,
  type StaffTaskAction,
  type StaffTasksList,
} from "@/lib/staff-tasks";

const labels: Record<StaffTaskAction, string> = {
  create: "إنشاء",
  start: "بدء العمل",
  comment: "ملاحظة",
  submit: "رفع للمراجعة",
  approve: "اعتماد الإنجاز",
  return: "إعادة للمكلف",
};
const statuses = {
  new: "جديدة",
  in_progress: "قيد التنفيذ",
  review: "بانتظار المراجعة",
  completed: "مكتملة",
};

export function StaffTasksPanel({
  canCreate = false,
  manager = false,
}: {
  canCreate?: boolean;
  manager?: boolean;
}) {
  const [data, setData] = useState<StaffTasksList | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("active");
  const refresh = useCallback(async () => {
    try {
      setData(await listStaffTasks());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر تحميل المهام");
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 60_000);
    window.addEventListener(STAFF_TASKS_CHANGED, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener(STAFF_TASKS_CHANGED, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  const items = useMemo(
    () =>
      (data?.items ?? [])
        .filter((task) => {
          if (filter === "mine") return task.assigneeId === data?.actorId;
          if (filter === "assigned") return task.createdById === data?.actorId;
          if (filter === "completed") return task.status === "completed";
          return task.status !== "completed";
        })
        .sort((a, b) =>
          a.status === "completed" && b.status === "completed"
            ? b.updatedAt.localeCompare(a.updatedAt)
            : a.dueDate.localeCompare(b.dueDate),
        ),
    [data, filter],
  );

  async function act(action: StaffTaskAction, task?: StaffTask) {
    setBusy(true);
    try {
      if (action === "create") {
        await changeStaffTask({ action, title, description, assigneeId, dueDate });
        setTitle("");
        setDescription("");
        setAssigneeId("");
        setDueDate("");
      } else if (task) {
        await changeStaffTask({ action, id: task.id, note: notes[task.id] ?? "" });
        setNotes((previous) => ({ ...previous, [task.id]: "" }));
      }
      await refresh();
      toast.success(action === "create" ? "أُسندت المهمة" : "تم تحديث المهمة");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحديث المهمة");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5" dir="rtl">
      {manager && data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          {[
            ["قيد المتابعة", data.items.filter((t) => t.status !== "completed").length],
            [
              "متأخرة",
              data.items.filter((t) => t.status !== "completed" && t.dueDate < data.today).length,
            ],
            ["بانتظار المراجعة", data.items.filter((t) => t.status === "review").length],
            ["مكتملة", data.items.filter((t) => t.status === "completed").length],
          ].map(([label, count]) => (
            <div key={label} className="glass-card rounded-xl p-3">
              <p className="text-muted-foreground">{label}</p>
              <strong className="text-xl">{count}</strong>
            </div>
          ))}
        </div>
      )}
      {canCreate && (
        <form
          className="glass-card rounded-xl p-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void act("create");
          }}
        >
          <h3 className="font-bold">إسناد مهمة جديدة</h3>
          <Input
            required
            maxLength={150}
            placeholder="عنوان المهمة"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            maxLength={3000}
            placeholder="التفاصيل والتعليمات"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Select value={assigneeId} onValueChange={setAssigneeId} required>
              <SelectTrigger className="min-w-52 flex-1">
                <SelectValue placeholder="اختر المشرف أو المعلم" />
              </SelectTrigger>
              <SelectContent>
                {data?.roster.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.role === "supervisor" ? "مشرف" : "معلم"} · {person.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              required
              type="date"
              min={data?.today}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-auto flex-1"
              aria-label="موعد انتهاء المهمة"
            />
            <Button type="submit" disabled={busy || !assigneeId}>
              إسناد المهمة
            </Button>
          </div>
        </form>
      )}
      <div className="flex flex-wrap gap-2">
        {["active", "mine", "assigned", "completed"]
          .filter((v) => canCreate || manager || v !== "assigned")
          .map((value) => (
            <Button
              key={value}
              size="sm"
              variant={filter === value ? "default" : "outline"}
              onClick={() => setFilter(value)}
            >
              {
                (
                  {
                    active: "النشطة",
                    mine: "مهامي",
                    assigned: "المُسندة مني",
                    completed: "المكتملة",
                  } as Record<string, string>
                )[value]
              }
            </Button>
          ))}
      </div>
      {error && (
        <p role="alert" className="text-destructive">
          {error}{" "}
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            إعادة المحاولة
          </Button>
        </p>
      )}
      {!data && !error && <p className="text-muted-foreground">جاري تحميل المهام...</p>}
      {data && items.length === 0 && (
        <p className="glass-card p-6 rounded-xl text-muted-foreground">
          لا توجد مهام في هذا القسم.
        </p>
      )}
      {items.map((task) => {
        const mine = task.assigneeId === data?.actorId;
        const creator = task.createdById === data?.actorId;
        const overdue = task.status !== "completed" && task.dueDate < (data?.today ?? "");
        return (
          <article key={task.id} className="glass-card rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <h3 className="font-bold">{task.title}</h3>
                <p className="text-sm text-muted-foreground">
                  من {task.createdByName} إلى {task.assigneeName}
                </p>
              </div>
              <div className="text-sm text-left">
                <span className="font-medium">{statuses[task.status]}</span>
                <p className={overdue ? "text-destructive" : "text-muted-foreground"}>
                  الموعد: {task.dueDate}
                  {overdue ? " · متأخرة" : ""}
                </p>
              </div>
            </div>
            {task.description && <p className="text-sm whitespace-pre-wrap">{task.description}</p>}
            <details className="text-sm">
              <summary className="cursor-pointer">سجل المهمة ({task.history.length})</summary>
              <ul className="mt-2 space-y-2">
                {task.history.map((entry, i) => (
                  <li key={i} className="border-r-2 pr-2 border-primary/40">
                    {labels[entry.action]} · {entry.by} ·{" "}
                    {new Date(entry.at).toLocaleString("ar-SA")}
                    {entry.note && <p className="whitespace-pre-wrap">{entry.note}</p>}
                  </li>
                ))}
              </ul>
            </details>
            {task.status !== "completed" && (mine || creator) && (
              <div className="space-y-2 border-t pt-3">
                <Textarea
                  value={notes[task.id] ?? ""}
                  maxLength={2000}
                  onChange={(e) => setNotes((prev) => ({ ...prev, [task.id]: e.target.value }))}
                  placeholder="اكتب تحديثاً أو نتيجة الإنجاز"
                />
                <div className="flex flex-wrap gap-2">
                  {mine && task.status === "new" && (
                    <Button size="sm" disabled={busy} onClick={() => void act("start", task)}>
                      بدء العمل
                    </Button>
                  )}
                  {mine && ["new", "in_progress"].includes(task.status) && (
                    <Button size="sm" disabled={busy} onClick={() => void act("submit", task)}>
                      رفع للمراجعة
                    </Button>
                  )}
                  {creator && task.status === "review" && (
                    <>
                      <Button size="sm" disabled={busy} onClick={() => void act("approve", task)}>
                        اعتماد الإنجاز
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || !notes[task.id]?.trim()}
                        onClick={() => void act("return", task)}
                      >
                        إعادة مع ملاحظة
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !notes[task.id]?.trim()}
                    onClick={() => void act("comment", task)}
                  >
                    إضافة ملاحظة
                  </Button>
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
