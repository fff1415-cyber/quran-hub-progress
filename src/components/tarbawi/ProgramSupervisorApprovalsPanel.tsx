import { useState } from "react";
import { loadHalaqat } from "@/lib/mock-data";
import type { AcademicCalendar } from "@/lib/academic-context";
import {
  approveTarbawiContentChange,
  approveTarbawiPlan,
  getTarbawiSettings,
  listContentChangeTarbawiPlans,
  listSubmittedTarbawiPlans,
  paragraphTypeLabel,
  rejectTarbawiContentChange,
  rejectTarbawiPlan,
  validateTarbawiPlanDraft,
} from "@/lib/tarbawi-program";
import { weekLabel } from "@/lib/arabic-numbers";
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
  const [rejectKey, setRejectKey] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  void refresh;

  const pendingPlans = listSubmittedTarbawiPlans(semesterId);
  const pendingContent = listContentChangeTarbawiPlans(semesterId);

  if (pendingPlans.length === 0 && pendingContent.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center text-muted-foreground">
        لا توجد خطط أو تعديلات بانتظار الاعتماد
      </div>
    );
  }

  const bump = () => setRefresh((r) => r + 1);

  return (
    <div className="space-y-6">
      {pendingContent.length > 0 && (
        <section className="space-y-4">
          <h3 className="font-bold text-primary">تعديلات فقرات (بعد الاعتماد)</h3>
          {pendingContent.map((plan) => {
            const h = halaqat.find((x) => x.id === plan.halaqaId);
            const hName = h?.name ?? `حلقة ${plan.halaqaId}`;
            const req = plan.contentChangeRequest!;
            const rejectId = `content:${plan.halaqaId}`;

            const changedItems = req.items.filter((item) => {
              const orig = plan.items.find((i) => i.id === item.id);
              return orig && (orig.paragraphTypeId !== item.paragraphTypeId || orig.topic !== item.topic);
            });

            return (
              <div key={rejectId} className="glass-card rounded-2xl p-5 space-y-4 border border-primary/20">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-lg">{hName}</h4>
                    <p className="text-xs text-muted-foreground">
                      تعديل فقرات · أُرسل {req.submittedAt ? new Date(req.submittedAt).toLocaleString("ar-SA") : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="gap-1 bg-success text-success-foreground hover:bg-success/90"
                      onClick={() => {
                        approveTarbawiContentChange(plan, getSessionName("مشرف البرامج"), hName);
                        toast.success(`تم اعتماد تعديل فقرات ${hName}`);
                        bump();
                      }}
                    >
                      <Check className="w-4 h-4" /> اعتماد التعديل
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="gap-1"
                      onClick={() => setRejectKey(rejectId)}
                    >
                      <X className="w-4 h-4" /> رفض
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-right text-muted-foreground border-b border-border">
                        <th className="p-2">الأسبوع</th>
                        <th className="p-2">قبل</th>
                        <th className="p-2">بعد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changedItems.map((item) => {
                        const orig = plan.items.find((i) => i.id === item.id)!;
                        return (
                          <tr key={item.id} className="border-b border-border/30">
                            <td className="p-2">{weekLabel(item.weekNumber)}</td>
                            <td className="p-2 text-muted-foreground">
                              {paragraphTypeLabel(settings, orig.paragraphTypeId)} — {orig.topic}
                            </td>
                            <td className="p-2 text-primary font-medium">
                              {paragraphTypeLabel(settings, item.paragraphTypeId)} — {item.topic}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {rejectKey === rejectId && (
                  <RejectRow
                    rejectNote={rejectNote}
                    setRejectNote={setRejectNote}
                    onConfirm={() => {
                      rejectTarbawiContentChange(plan, rejectNote, hName);
                      toast.info(`رُفض تعديل فقرات ${hName}`);
                      setRejectKey(null);
                      setRejectNote("");
                      bump();
                    }}
                  />
                )}
              </div>
            );
          })}
        </section>
      )}

      {pendingPlans.length > 0 && (
        <section className="space-y-4">
          {pendingContent.length > 0 && (
            <h3 className="font-bold text-primary">خطط جديدة</h3>
          )}
          {pendingPlans.map((plan) => {
            const h = halaqat.find((x) => x.id === plan.halaqaId);
            const hName = h?.name ?? `حلقة ${plan.halaqaId}`;
            const validation = validateTarbawiPlanDraft(plan, settings, semesterWeeks);
            const rejectId = `plan:${plan.halaqaId}`;

            return (
              <div key={rejectId} className="glass-card rounded-2xl p-5 space-y-4">
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
                        bump();
                      }}
                    >
                      <Check className="w-4 h-4" /> اعتماد
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="gap-1"
                      onClick={() => setRejectKey(rejectId)}
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
                          <td className="p-2">{weekLabel(item.weekNumber)}</td>
                          <td className="p-2">{paragraphTypeLabel(settings, item.paragraphTypeId)}</td>
                          <td className="p-2">{item.topic}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {rejectKey === rejectId && (
                  <RejectRow
                    rejectNote={rejectNote}
                    setRejectNote={setRejectNote}
                    onConfirm={() => {
                      rejectTarbawiPlan(plan, rejectNote, hName);
                      toast.info(`تم رفض خطة ${hName}`);
                      setRejectKey(null);
                      setRejectNote("");
                      bump();
                    }}
                  />
                )}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}

function RejectRow({
  rejectNote,
  setRejectNote,
  onConfirm,
}: {
  rejectNote: string;
  setRejectNote: (v: string) => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex gap-2 items-end pt-2 border-t border-border">
      <Input
        value={rejectNote}
        onChange={(e) => setRejectNote(e.target.value)}
        placeholder="سبب الرفض / ملاحظات للمعلّم"
        className="flex-1"
      />
      <Button variant="destructive" size="sm" onClick={onConfirm}>
        تأكيد الرفض
      </Button>
    </div>
  );
}
