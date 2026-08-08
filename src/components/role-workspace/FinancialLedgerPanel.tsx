import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchActiveCalendar, type AcademicCalendar } from "@/lib/academic-context";
import { syncFromCloud } from "@/lib/cloud-sync";
import {
  addExpenseEntry,
  addIncomeEntry,
  deleteFinancialEntry,
  entriesForSemester,
  formatMoney,
  loadFinancialLedger,
  sumAmounts,
  updateExpenseEntry,
  updateIncomeEntry,
  type FinancialEntry,
  type FinancialEntryType,
  type FinancialExpenseEntry,
  type FinancialIncomeEntry,
} from "@/lib/financial-ledger";
import { getSessionName, getSessionRole } from "@/lib/session-role";
import { hasPerm } from "@/lib/permissions";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ArrowDownCircle, ArrowUpCircle, Loader2, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDisplayDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

type FormState = {
  type: FinancialEntryType;
  donorName: string;
  programName: string;
  beneficiariesCount: string;
  amount: string;
  date: string;
};

const EMPTY_FORM: FormState = {
  type: "income",
  donorName: "",
  programName: "",
  beneficiariesCount: "",
  amount: "",
  date: todayIso(),
};

function entryToForm(entry: FinancialEntry): FormState {
  if (entry.type === "income") {
    return {
      type: "income",
      donorName: entry.donorName,
      programName: "",
      beneficiariesCount: "",
      amount: String(entry.amount),
      date: entry.date,
    };
  }
  return {
    type: "expense",
    donorName: "",
    programName: entry.programName,
    beneficiariesCount: String(entry.beneficiariesCount),
    amount: String(entry.amount),
    date: entry.date,
  };
}

export function FinancialLedgerPanel() {
  const role = getSessionRole();
  const canManage = hasPerm(role, null, "manage_finances");
  const operatorName = getSessionName(role === "manager" ? "المدير" : "السكرتير");

  const [calendar, setCalendar] = useState<AcademicCalendar | null>(null);
  const [loadingCal, setLoadingCal] = useState(true);
  const [ledgerTick, setLedgerTick] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const refreshLedger = useCallback(() => setLedgerTick((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await syncFromCloud();
        refreshLedger();
        const cal = await fetchActiveCalendar(true);
        if (!cancelled) setCalendar(cal);
      } catch {
        if (!cancelled) toast.error("تعذّر تحميل بيانات المالية");
      } finally {
        if (!cancelled) setLoadingCal(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshLedger]);

  const semesterId = calendar?.semester?.id ?? null;
  const semesterName = calendar?.semester?.name ?? "—";

  const { incomes, expenses, incomeTotal, expenseTotal, netTotal } = useMemo(() => {
    void ledgerTick;
    if (!semesterId) {
      return { incomes: [], expenses: [], incomeTotal: 0, expenseTotal: 0, netTotal: 0 };
    }
    const store = loadFinancialLedger();
    const inc = entriesForSemester(store, semesterId, "income") as FinancialIncomeEntry[];
    const exp = entriesForSemester(store, semesterId, "expense") as FinancialExpenseEntry[];
    const incomeTotal = sumAmounts(inc);
    const expenseTotal = sumAmounts(exp);
    return {
      incomes: inc,
      expenses: exp,
      incomeTotal,
      expenseTotal,
      netTotal: incomeTotal - expenseTotal,
    };
  }, [ledgerTick, semesterId]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, date: todayIso() });
    setDialogOpen(true);
  };

  const openEdit = (entry: FinancialEntry) => {
    setEditingId(entry.id);
    setForm(entryToForm(entry));
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const validateForm = (): boolean => {
    if (!semesterId) {
      toast.error("لا يوجد فصل دراسي نشط — عرّف الفصل من إعدادات المدير");
      return false;
    }
    const amount = Number(form.amount);
    if (!form.amount.trim() || !Number.isFinite(amount) || amount <= 0) {
      toast.error("أدخل مبلغاً صحيحاً أكبر من صفر");
      return false;
    }
    if (!form.date.trim()) {
      toast.error("أدخل التاريخ");
      return false;
    }
    if (form.type === "income") {
      if (!form.donorName.trim()) {
        toast.error("أدخل اسم المتبرع");
        return false;
      }
    } else {
      if (!form.programName.trim()) {
        toast.error("أدخل اسم البرنامج");
        return false;
      }
      const beneficiaries = Number(form.beneficiariesCount);
      if (!form.beneficiariesCount.trim() || !Number.isInteger(beneficiaries) || beneficiaries < 1) {
        toast.error("أدخل عدد المستفيدين (رقم صحيح ≥ 1)");
        return false;
      }
    }
    return true;
  };

  const handleSave = () => {
    if (!canManage || !validateForm() || !semesterId) return;
    setSaving(true);
    try {
      const amount = Number(form.amount);
      if (form.type === "income") {
        const draft = { donorName: form.donorName, amount, date: form.date };
        if (editingId) {
          if (!updateIncomeEntry(editingId, draft)) throw new Error("تعذّر التعديل");
        } else {
          addIncomeEntry(semesterId, draft, operatorName);
        }
      } else {
        const draft = {
          programName: form.programName,
          beneficiariesCount: Number(form.beneficiariesCount),
          amount,
          date: form.date,
        };
        if (editingId) {
          if (!updateExpenseEntry(editingId, draft)) throw new Error("تعذّر التعديل");
        } else {
          addExpenseEntry(semesterId, draft, operatorName);
        }
      }
      refreshLedger();
      toast.success(editingId ? "تم تحديث الحركة" : "تمت إضافة الحركة");
      closeDialog();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    if (!canManage) return;
    if (!window.confirm("حذف هذه الحركة؟")) return;
    if (deleteFinancialEntry(id)) {
      refreshLedger();
      toast.success("تم الحذف");
    } else {
      toast.error("تعذّر الحذف");
    }
  };

  if (loadingCal) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        جاري تحميل المالية...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-primary flex items-center gap-2">
            <Wallet className="w-5 h-5" />
            التفاصيل المالية
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            الفصل الحالي: <span className="font-bold text-foreground">{semesterName}</span>
            {!semesterId && " — عرّف فصلاً دراسياً نشطاً لإضافة الحركات"}
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            disabled={!semesterId}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl gold-gradient text-primary-foreground font-bold text-sm disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            إضافة حركة
          </button>
        )}
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <SummaryCard
          label="إجمالي الإيرادات"
          value={formatMoney(incomeTotal)}
          tone="success"
          icon={ArrowDownCircle}
        />
        <SummaryCard
          label="إجمالي المصروفات"
          value={formatMoney(expenseTotal)}
          tone="destructive"
          icon={ArrowUpCircle}
        />
        <SummaryCard
          label="الصافي"
          value={formatMoney(netTotal)}
          tone={netTotal >= 0 ? "primary" : "warning"}
          icon={Wallet}
        />
      </div>

      <IncomeTable
        rows={incomes}
        total={incomeTotal}
        canManage={canManage}
        onEdit={openEdit}
        onDelete={handleDelete}
      />

      <ExpenseTable
        rows={expenses}
        total={expenseTotal}
        canManage={canManage}
        onEdit={openEdit}
        onDelete={handleDelete}
      />

      <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingId ? "تعديل حركة" : "إضافة حركة"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-secondary/40">
              <button
                type="button"
                disabled={!!editingId}
                onClick={() => setForm((f) => ({ ...f, type: "income" }))}
                className={cn(
                  "py-2 rounded-md text-sm font-bold transition-all",
                  form.type === "income"
                    ? "bg-success text-success-foreground"
                    : "text-muted-foreground",
                  editingId && "opacity-60 cursor-not-allowed",
                )}
              >
                إيراد
              </button>
              <button
                type="button"
                disabled={!!editingId}
                onClick={() => setForm((f) => ({ ...f, type: "expense" }))}
                className={cn(
                  "py-2 rounded-md text-sm font-bold transition-all",
                  form.type === "expense"
                    ? "bg-destructive text-destructive-foreground"
                    : "text-muted-foreground",
                  editingId && "opacity-60 cursor-not-allowed",
                )}
              >
                مصروف
              </button>
            </div>

            {form.type === "income" ? (
              <Field label="اسم المتبرع *">
                <input
                  value={form.donorName}
                  onChange={(e) => setForm((f) => ({ ...f, donorName: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg bg-input border border-border text-sm focus:border-primary focus:outline-none"
                  placeholder="اسم المتبرع"
                />
              </Field>
            ) : (
              <>
                <Field label="اسم البرنامج *">
                  <input
                    value={form.programName}
                    onChange={(e) => setForm((f) => ({ ...f, programName: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg bg-input border border-border text-sm focus:border-primary focus:outline-none"
                    placeholder="مثال: برنامج تربوي"
                  />
                </Field>
                <Field label="عدد المستفيدين *">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    value={form.beneficiariesCount}
                    onChange={(e) => setForm((f) => ({ ...f, beneficiariesCount: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg bg-input border border-border text-sm focus:border-primary focus:outline-none"
                    placeholder="120"
                  />
                </Field>
              </>
            )}

            <Field label="المبلغ (ر.س) *">
              <input
                type="number"
                min={0.01}
                step={0.01}
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg bg-input border border-border text-sm focus:border-primary focus:outline-none"
                placeholder="0"
                dir="ltr"
              />
            </Field>

            <Field label="التاريخ *">
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg bg-input border border-border text-sm focus:border-primary focus:outline-none"
                dir="ltr"
              />
            </Field>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <button
              type="button"
              onClick={closeDialog}
              className="px-4 py-2 rounded-lg border border-border text-sm"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg gold-gradient text-primary-foreground font-bold text-sm disabled:opacity-60"
            >
              {saving ? "..." : editingId ? "حفظ التعديل" : "حفظ"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-1.5 font-bold">{label}</label>
      {children}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  tone: "success" | "destructive" | "primary" | "warning";
  icon: React.ElementType;
}) {
  const toneClass =
    tone === "success"
      ? "border-success/30 bg-success/5 text-success"
      : tone === "destructive"
        ? "border-destructive/30 bg-destructive/5 text-destructive"
        : tone === "warning"
          ? "border-warning/30 bg-warning/5 text-warning"
          : "border-primary/30 bg-primary/5 text-primary";

  return (
    <div className={cn("rounded-xl border p-4", toneClass)}>
      <div className="flex items-center gap-2 text-xs font-bold opacity-80 mb-1">
        <Icon className="w-4 h-4" />
        {label}
      </div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function IncomeTable({
  rows,
  total,
  canManage,
  onEdit,
  onDelete,
}: {
  rows: FinancialIncomeEntry[];
  total: number;
  canManage: boolean;
  onEdit: (e: FinancialIncomeEntry) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="glass-card rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-success/5">
        <h3 className="font-bold text-success flex items-center gap-2">
          <ArrowDownCircle className="w-4 h-4" />
          الإيرادات
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-xs text-muted-foreground">
              <th className="p-3 text-right font-bold">المتبرع</th>
              <th className="p-3 text-right font-bold">المبلغ</th>
              <th className="p-3 text-right font-bold">التاريخ</th>
              <th className="p-3 text-right font-bold">مدخل الحركة</th>
              {canManage && <th className="p-3 w-20" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 5 : 4} className="p-6 text-center text-muted-foreground">
                  لا توجد إيرادات في هذا الفصل
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-border/50 hover:bg-secondary/20">
                  <td className="p-3 font-medium">{row.donorName}</td>
                  <td className="p-3 font-bold text-success tabular-nums">{formatMoney(row.amount)}</td>
                  <td className="p-3 text-muted-foreground">{formatDisplayDate(row.date)}</td>
                  <td className="p-3 text-muted-foreground">{row.createdBy}</td>
                  {canManage && (
                    <td className="p-2">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          type="button"
                          onClick={() => onEdit(row)}
                          className="p-1.5 rounded-md hover:bg-primary/10 text-primary"
                          aria-label="تعديل"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(row.id)}
                          className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive"
                          aria-label="حذف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="bg-success/5 font-bold">
              <td className="p-3">المجموع</td>
              <td className="p-3 text-success tabular-nums" colSpan={canManage ? 4 : 3}>
                {formatMoney(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function ExpenseTable({
  rows,
  total,
  canManage,
  onEdit,
  onDelete,
}: {
  rows: FinancialExpenseEntry[];
  total: number;
  canManage: boolean;
  onEdit: (e: FinancialExpenseEntry) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="glass-card rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-destructive/5">
        <h3 className="font-bold text-destructive flex items-center gap-2">
          <ArrowUpCircle className="w-4 h-4" />
          المصروفات
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-xs text-muted-foreground">
              <th className="p-3 text-right font-bold">البرنامج</th>
              <th className="p-3 text-right font-bold">المستفيدون</th>
              <th className="p-3 text-right font-bold">المبلغ</th>
              <th className="p-3 text-right font-bold">التاريخ</th>
              <th className="p-3 text-right font-bold">مدخل الحركة</th>
              {canManage && <th className="p-3 w-20" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 6 : 5} className="p-6 text-center text-muted-foreground">
                  لا توجد مصروفات في هذا الفصل
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-border/50 hover:bg-secondary/20">
                  <td className="p-3 font-medium">{row.programName}</td>
                  <td className="p-3 tabular-nums">{row.beneficiariesCount}</td>
                  <td className="p-3 font-bold text-destructive tabular-nums">{formatMoney(row.amount)}</td>
                  <td className="p-3 text-muted-foreground">{formatDisplayDate(row.date)}</td>
                  <td className="p-3 text-muted-foreground">{row.createdBy}</td>
                  {canManage && (
                    <td className="p-2">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          type="button"
                          onClick={() => onEdit(row)}
                          className="p-1.5 rounded-md hover:bg-primary/10 text-primary"
                          aria-label="تعديل"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(row.id)}
                          className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive"
                          aria-label="حذف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="bg-destructive/5 font-bold">
              <td className="p-3">المجموع</td>
              <td className="p-3 text-destructive tabular-nums" colSpan={canManage ? 5 : 4}>
                {formatMoney(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
