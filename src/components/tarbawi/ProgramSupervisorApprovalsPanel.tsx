import { useState } from "react";
import { loadHalaqat } from "@/lib/mock-data";
import type { AcademicCalendar } from "@/lib/academic-context";
import {
  approveTarbawiPlan,
  getTarbawiPlan,
  getTarbawiSettings,
  listSubmittedTarbawiPlans,
  paragraphTypeLabel,
  rejectTarbawiPlan,
  validateTarbawiPlanDraft,
} from "@/lib/tarbawi-program";
import { getSessionName } from "@/lib/session-role";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

export function ProgramSupervisorApprovalsPanel({ calendar }: { calendar: AcademicCalendar }) {
  const semesterId = calendar.semester?.id ?? "default";
  const halaqat = loadHalaqat();
  const settings = getTarbawiSettings(semesterId);
  const semesterWeeks = calendar.semester?.weeks_count ?? calendar.weeks.length;
  const [refresh, setRefresh] = useState(0);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const pending = listSubmittedTarbawiPlans(semesterId);
  void refresh;

  if (pending.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center text-muted-foreground">
        لا توجد خطط بانتظار الاعتماد
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {pending.map((plan) => {
        const h = halaqat.find((x) => x.id === plan.halaqaId);
        const hName = h?.name ?? `حلقة ${plan.halaqaId}`;
        const validation = validateTarbawiPlanDraft(plan, settings, semesterWeeks);

        return (
          <div key={plan.halaqaId} className="glass-card rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <h4 className="font-bold text-lg">{hName}</h4>
                <p className="text-xs text-muted-foreground">
                  {plan.items.length} فقرة · أُرسلت {plan.submittedAt ? new Date(plan.submittedAt).toLocaleString("ar-SA") : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="gap-1 bg-success text-success-foreground hover:bg-success/90"
                  onClick={() => {
                    approveTarbawiPlan(plan, getSessionName("مشرف البرامج"), hName);
                    toast.success(`تم اعتماد خطة ${hName}`);
                    setRefresh((r) => r + 1);
                  }}
                >
                  <Check className="w-4 h-4" /> اعتماد
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="gap-1"
                  onClick={() => setRejectId(plan.halaqaId)}
                >
                  <X className="w-4 h-4" /> رفض
                </Button>
              </div>
            </div>

            {validation && (
              <p className="text-xs text-warning">تحذير: {validation}</p>
            )}

            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-right text-muted-foreground border-b border-border">
                    <th className="p-2">الأسبوع</th>
                    <th className="p-2">النوع</th>
                    <th className="p-2">الموضوع</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.items.sort((a, b) => a.weekNumber - b.weekNumber).map((item) => (
                    <tr key={item.id} className="border-b border-border/30">
                      <td className="p-2">{item.weekNumber}</td>
                      <td className="p-2">{paragraphTypeLabel(settings, item.paragraphTypeId)}</td>
                      <td className="p-2">{item.topic}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {rejectId === plan.halaqaId && (
              <div className="flex gap-2 items-end pt-2 border-t border-border">
                <Input
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="سبب الرفض / ملاحظات للمعلّم"
                  className="flex-1"
                />
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    rejectTarbawiPlan(plan, rejectNote, hName);
                    toast.info(`تم رفض خطة ${hName}`);
                    setRejectId(null);
                    setRejectNote("");
                    setRefresh((r) => r + 1);
                  }}
                >
                  تأكيد الرفض
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
