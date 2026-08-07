import { useMemo, useState, type ComponentType } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Download,
  ExternalLink,
  MinusCircle,
  RotateCcw,
  Search,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import { cn } from "@/lib/utils";
import {
  PRELAUNCH_AUDIT_CATALOG,
  PRELAUNCH_SCORE_LABELS,
  type PrelaunchAuditItem,
} from "@/lib/prelaunch-audit-catalog";
import {
  clearPrelaunchAuditStore,
  downloadPrelaunchExport,
  getPrelaunchRecord,
  groupPrelaunchCatalog,
  loadPrelaunchAuditStore,
  savePrelaunchAuditStore,
  summarizePrelaunchAudit,
  upsertPrelaunchRecord,
  type PrelaunchAuditStore,
  type PrelaunchScore,
  type PrelaunchStatus,
} from "@/lib/prelaunch-audit-store";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

type Filter = "all" | PrelaunchStatus;

const STATUS_LABEL: Record<PrelaunchStatus, string> = {
  pending: "لم يُختبر",
  pass: "جاهز",
  issue: "مشكلة",
  skip: "تخطي",
};

const STATUS_STYLE: Record<PrelaunchStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  pass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  issue: "bg-red-500/15 text-red-700 dark:text-red-400",
  skip: "bg-amber-500/15 text-amber-800 dark:text-amber-400",
};

export function PrelaunchAuditPage() {
  const [store, setStore] = useState<PrelaunchAuditStore>(() => loadPrelaunchAuditStore());
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const summary = useMemo(() => summarizePrelaunchAudit(store), [store]);
  const reviewed = summary.pass + summary.issue + summary.skip;
  const progressPct = summary.total > 0 ? Math.round((reviewed / summary.total) * 100) : 0;

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items = PRELAUNCH_AUDIT_CATALOG.filter((item) => {
      const rec = getPrelaunchRecord(store, item.id);
      if (filter !== "all" && rec.status !== filter) return false;
      if (!q) return true;
      return (
        item.label.toLowerCase().includes(q)
        || item.group.toLowerCase().includes(q)
        || (item.hint?.toLowerCase().includes(q) ?? false)
      );
    });
    return groupPrelaunchCatalog(items);
  }, [store, filter, query]);

  const persist = (next: PrelaunchAuditStore) => {
    setStore(next);
    savePrelaunchAuditStore(next);
  };

  const patchItem = (id: string, patch: Parameters<typeof upsertPrelaunchRecord>[2]) => {
    persist(upsertPrelaunchRecord(store, id, patch));
  };

  const handleClear = () => {
    if (!window.confirm("مسح كل التقييمات المحفوظة؟")) return;
    clearPrelaunchAuditStore();
    setStore({});
    toast.success("تم مسح التقييمات");
  };

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-center" richColors />
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        <header className="glass-card rounded-2xl p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <ClipboardCheck className="w-6 h-6 text-primary" />
                <h1 className="text-2xl font-bold">مسح ما قبل الإطلاق</h1>
                <span className="text-xs px-2 py-1 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 font-medium">
                  مؤقت — احذف بعد الانتهاء
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
                قائمة داخلية للمبرمج: افتح كل أداة، قيّمها بالمقياس 1–5، سجّل الملاحظات، ثم صدّر JSON.
                البيانات في localStorage فقط.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => downloadPrelaunchExport(store)}>
                <Download className="w-4 h-4 ml-1" />
                تصدير JSON
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handleClear}>
                <RotateCcw className="w-4 h-4 ml-1" />
                مسح الكل
              </Button>
              <Link
                to="/"
                className="inline-flex items-center text-sm text-primary underline-offset-4 hover:underline px-2"
              >
                الرئيسية
              </Link>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                التقدم: {reviewed} / {summary.total} ({progressPct}%)
              </span>
              <span className="text-muted-foreground">
                جاهز {summary.pass} · مشكلة {summary.issue} · تخطي {summary.skip} · متوسط المقياس{" "}
                {summary.avgScore ?? "—"}
              </span>
            </div>
            <Progress value={progressPct} />
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            {(["all", "pending", "pass", "issue", "skip"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm border transition-colors",
                  filter === f
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border hover:bg-muted/50",
                )}
              >
                {f === "all" ? "الكل" : STATUS_LABEL[f]}
              </button>
            ))}
            <div className="relative mr-auto min-w-[200px] flex-1 max-w-xs">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="بحث..."
                className="w-full pr-9 pl-3 py-1.5 rounded-lg border border-border bg-input text-sm"
              />
            </div>
          </div>
        </header>

        {filteredGroups.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">لا توجد نتائج للفلتر الحالي.</p>
        ) : (
          filteredGroups.map(([group, items]) => (
            <section key={group} className="glass-card rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
                <h2 className="font-bold">{group}</h2>
                <span className="text-xs text-muted-foreground">{items.length} أداة</span>
              </div>
              <ul className="divide-y divide-border">
                {items.map((item) => (
                  <AuditRow
                    key={item.id}
                    item={item}
                    record={getPrelaunchRecord(store, item.id)}
                    onPatch={(patch) => patchItem(item.id, patch)}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function AuditRow({
  item,
  record,
  onPatch,
}: {
  item: PrelaunchAuditItem;
  record: ReturnType<typeof getPrelaunchRecord>;
  onPatch: (patch: Partial<ReturnType<typeof getPrelaunchRecord>>) => void;
}) {
  return (
    <li className="p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{item.label}</span>
            <span className={cn("text-xs px-2 py-0.5 rounded-full", STATUS_STYLE[record.status])}>
              {STATUS_LABEL[record.status]}
            </span>
          </div>
          {item.hint ? (
            <p className="text-xs text-muted-foreground mt-1">{item.hint}</p>
          ) : null}
        </div>
        <a
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline shrink-0"
        >
          فتح
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground ml-1">المقياس:</span>
        {([1, 2, 3, 4, 5] as PrelaunchScore[]).map((score) => (
          <button
            key={score}
            type="button"
            title={PRELAUNCH_SCORE_LABELS[score]}
            onClick={() => onPatch({ score })}
            className={cn(
              "w-8 h-8 rounded-lg border text-sm font-bold transition-colors",
              record.score === score
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:border-primary/50 hover:bg-primary/5",
            )}
          >
            {score}
          </button>
        ))}
        {record.score ? (
          <span className="text-xs text-muted-foreground">{PRELAUNCH_SCORE_LABELS[record.score]}</span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <StatusButton
          active={record.status === "pass"}
          label="جاهز"
          icon={CheckCircle2}
          className="text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
          onClick={() => onPatch({ status: "pass" })}
        />
        <StatusButton
          active={record.status === "issue"}
          label="مشكلة"
          icon={AlertTriangle}
          className="text-red-700 dark:text-red-400 border-red-500/30"
          onClick={() => onPatch({ status: "issue" })}
        />
        <StatusButton
          active={record.status === "skip"}
          label="تخطي"
          icon={MinusCircle}
          className="text-amber-800 dark:text-amber-400 border-amber-500/30"
          onClick={() => onPatch({ status: "skip" })}
        />
        <StatusButton
          active={record.status === "pending"}
          label="لم يُختبر"
          icon={RotateCcw}
          className="text-muted-foreground"
          onClick={() => onPatch({ status: "pending" })}
        />
      </div>

      <textarea
        value={record.notes}
        onChange={(e) => onPatch({ notes: e.target.value })}
        placeholder="ملاحظات: أخطاء، تحسينات، خطوات إعادة الاختبار..."
        rows={2}
        className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm resize-y min-h-[2.5rem]"
      />
    </li>
  );
}

function StatusButton({
  active,
  label,
  icon: Icon,
  className,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: ComponentType<{ className?: string }>;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs transition-colors",
        active ? "bg-muted font-medium" : "border-border hover:bg-muted/50",
        className,
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}
