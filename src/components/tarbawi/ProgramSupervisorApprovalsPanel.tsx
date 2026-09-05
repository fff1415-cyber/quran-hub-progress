import { useState } from "react";
import { loadHalaqat } from "@/lib/mock-data";
import type { AcademicCalendar } from "@/lib/academic-context";
import {
  approveTarbawiContentChange,
  approveTarbawiPlan,
  formatTarbawiItemLabel,
  getTarbawiSettings,
  listContentChangeTarbawiPlans,
  listSubmittedTarbawiPlans,
  paragraphTypeLabel,
  pendingRejectedTarbawiItems,
  rejectTarbawiContentChangeItem,
  rejectTarbawiPlanItem,
  sendTarbawiPlanRevisionToTeacher,
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
          <p className="text-xs text-muted-foreground">
            اعتماد التعديلات بالجملة — الرفض فقرة بفقرة مع سبب للمعلّم
          </p>
          {pendingContent.map((plan) => {
            const h = halaqat.find((x) => x.id === plan.halaqaId);
            const hName = h?.name ?? `حلقة ${plan.halaqaId}`;
            const req = plan.contentChangeRequest!;
            const cardKey = `content:${plan.halaqaId}`;

            const changedItems = req.items.filter((item) => {
              const orig = plan.items.find((i) => i.id === item.id);
              return orig && (orig.paragraphTypeId !== item.paragraphTypeId || orig.topic !== item.topic);
            });

            return (
              <div key={cardKey} className="glass-card rounded-2xl p-5 space-y-4 border border-primary/20">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-lg">{hName}</h4>
                    <p className="text-xs text-muted-foreground">
                      تعديل فقرات · أُرسل {req.submittedAt ? new Date(req.submittedAt).toLocaleString("ar-SA") : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="gap-1 bg-success text-success-foreground hover:bg-success/90"
                    onClick={() => {
                      approveTarbawiContentChange(plan, getSessionName("مشرف البرامج"), hName);
                      toast.success(`تم اعتماد تعديل فقرات ${hName}`);
                      bump();
                    }}
                  >
                    <Check className="w-4 h-4" /> اعتماد كل التعديلات
                  </Button>
                </div>

                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-right text-muted-foreground border-b border-border">
                        <th className="p-2">الأسبوع</th>
                        <th className="p-2">قبل</th>
                        <th className="p-2">بعد</th>
                        <th className="p-2 w-28" />
                      </tr>
                    </thead>
                    <tbody>
                      {changedItems.map((item) => {
                        const orig = plan.items.find((i) => i.id === item.id)!;
                        const rejectId = `${cardKey}:${item.id}`;
                        return (
                          <tr key={item.id} className="border-b border-border/30 align-top">
                            <td className="p-2">{weekLabel(item.weekNumber)}</td>
                            <td className="p-2 text-muted-foreground">
                              {paragraphTypeLabel(settings, orig.paragraphTypeId)} — {orig.topic}
                            </td>
                            <td className="p-2 text-primary font-medium">
                              {paragraphTypeLabel(settings, item.paragraphTypeId)} — {item.topic}
                            </td>
                            <td className="p-2">
                              {rejectKey === rejectId ? (
                                <ItemRejectForm
                                  rejectNote={rejectNote}
                                  setRejectNote={setRejectNote}
                                  onCancel={() => {
                                    setRejectKey(null);
                                    setRejectNote("");
                                  }}
                                  onConfirm={() => {
                                    rejectTarbawiContentChangeItem(
                                      plan,
                                      item.id,
                                      rejectNote,
                                      hName,
                                      settings,
                                    );
                                    toast.info(`رُفضت فقرة — ${formatTarbawiItemLabel(settings, item)}`);
                                    setRejectKey(null);
                                    setRejectNote("");
                                    bump();
                                  }}
                                />
                              ) : (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="gap-1 h-8"
                                  onClick={() => {
                                    setRejectKey(rejectId);
                                    setRejectNote("");
                                  }}
                                >
                                  <X className="w-3.5 h-3.5" /> رفض
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
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
          <p className="text-xs text-muted-foreground">
            اعتماد الخطة بالجملة — الرفض فقرة بفقرة مع سبب للمعلّم
          </p>
          {pendingPlans.map((plan) => {
            const h = halaqat.find((x) => x.id === plan.halaqaId);
            const hName = h?.name ?? `حلقة ${plan.halaqaId}`;
            const validation = validateTarbawiPlanDraft(plan, settings, semesterWeeks);
            const cardKey = `plan:${plan.halaqaId}`;
            const stagedRejections = pendingRejectedTarbawiItems(plan);

            return (
              <div key={cardKey} className="glass-card rounded-2xl p-5 space-y-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-lg">{hName}</h4>
                    <p className="text-xs text-muted-foreground">
                      {plan.items.length} فقرة · أُرسلت{" "}
                      {plan.submittedAt ? new Date(plan.submittedAt).toLocaleString("ar-SA") : ""}
                      {stagedRejections.length > 0 && (
                        <span className="text-destructive font-bold">
                          {" "}
                          · {stagedRejections.length} فقرة مرفوضة (لم تُرسَل للمعلّم بعد)
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {stagedRejections.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          sendTarbawiPlanRevisionToTeacher(plan, hName);
                          toast.info(`أُرسلت ملاحظات الرفض للمعلّم — ${hName}`);
                          bump();
                        }}
                      >
                        إرسال الملاحظات للمعلّم
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="gap-1 bg-success text-success-foreground hover:bg-success/90"
                      onClick={() => {
                        approveTarbawiPlan(plan, getSessionName("مشرف البرامج"), hName);
                        toast.success(`تم اعتماد خطة ${hName}`);
                        bump();
                      }}
                    >
                      <Check className="w-4 h-4" /> اعتماد الخطة
                    </Button>
                  </div>
                </div>

                {validation && (
                  <p className="text-xs text-warning">تحذير: {validation}</p>
                )}

                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-right text-muted-foreground border-b border-border">
                        <th className="p-2">الأسبوع</th>
                        <th className="p-2">النوع</th>
                        <th className="p-2">الموضوع</th>
                        <th className="p-2 w-28" />
                      </tr>
                    </thead>
                    <tbody>
                      {plan.items.sort((a, b) => a.weekNumber - b.weekNumber).map((item) => {
                        const rejectId = `${cardKey}:${item.id}`;
                        const isRejected = item.reviewStatus === "rejected";
                        return (
                          <tr key={item.id} className="border-b border-border/30 align-top">
                            <td className="p-2">{weekLabel(item.weekNumber)}</td>
                            <td className="p-2">{paragraphTypeLabel(settings, item.paragraphTypeId)}</td>
                            <td className="p-2">
                              {item.topic}
                              {isRejected && item.rejectionNote && (
                                <div className="text-[10px] text-destructive mt-1">{item.rejectionNote}</div>
                              )}
                            </td>
                            <td className="p-2">
                              {isRejected ? (
                                <span className="text-[10px] font-bold text-destructive">مرفوضة</span>
                              ) : rejectKey === rejectId ? (
                                <ItemRejectForm
                                  rejectNote={rejectNote}
                                  setRejectNote={setRejectNote}
                                  onCancel={() => {
                                    setRejectKey(null);
                                    setRejectNote("");
                                  }}
                                  onConfirm={() => {
                                    rejectTarbawiPlanItem(
                                      plan,
                                      item.id,
                                      rejectNote,
                                      hName,
                                      settings,
                                    );
                                    toast.info(`رُفضت فقرة — ${formatTarbawiItemLabel(settings, item)}`);
                                    setRejectKey(null);
                                    setRejectNote("");
                                    bump();
                                  }}
                                />
                              ) : (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="gap-1 h-8"
                                  onClick={() => {
                                    setRejectKey(rejectId);
                                    setRejectNote("");
                                  }}
                                >
                                  <X className="w-3.5 h-3.5" /> رفض
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}

function ItemRejectForm({
  rejectNote,
  setRejectNote,
  onCancel,
  onConfirm,
}: {
  rejectNote: string;
  setRejectNote: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-2 min-w-[200px]">
      <Input
        value={rejectNote}
        onChange={(e) => setRejectNote(e.target.value)}
        placeholder="سبب الرفض للمعلّم"
        className="h-8 text-xs"
      />
      <div className="flex gap-1">
        <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={onConfirm}>
          تأكيد
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onCancel}>
          إلغاء
        </Button>
      </div>
    </div>
  );
}
