import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadStudents, type Student } from "@/lib/mock-data";
import { syncFromCloud } from "@/lib/cloud-sync";
import { fetchPlans, fetchStudentPlanSheet, importPlans, assignStudentPlan, patchStudentAssignment, deletePlan, unconfirmedLocalPlanLink, updateSupervisorPlanHifz } from "@/lib/plans-service";
import type { EducationPlan, PlanTrack, StudentPlanSheetData } from "@/lib/plan-types";
import { faceQuotasFromPlan } from "@/lib/plan-daily-faces";
import { FaceQuotasFields } from "@/components/plans/FaceQuotasFields";
import { StudentFaceReportPanel } from "@/components/plans/StudentFaceReportPanel";
import { parsePlansExcel } from "@/lib/plan-excel-import";
import { trackLabel } from "@/lib/plan-translator";
import { globalPhaseFromPlanLevel, murajaStartSegment } from "@/lib/plan-level-ranges";
import { getCalendarIsoDate } from "@/lib/operational-date";
import { getSessionName, getSessionRole } from "@/lib/session-role";
import { fetchActiveCalendar } from "@/lib/academic-context";
import { StudentPlanSheet } from "@/components/plans/StudentPlanSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileSpreadsheet, Link2, Loader2, Snowflake, Search, Trash2, Sun } from "lucide-react";
import { toast } from "sonner";

export function PlanStudentLookup({ readOnly = false, refreshKey = 0 }: { readOnly?: boolean; refreshKey?: number }) {
  const [q, setQ] = useState("");
  const [sheet, setSheet] = useState<StudentPlanSheetData | null>(null);
  const [selected, setSelected] = useState<Student | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [localLink, setLocalLink] = useState<ReturnType<typeof unconfirmedLocalPlanLink>>(null);
  const [hifzDate, setHifzDate] = useState(getCalendarIsoDate());
  const [editingSegment, setEditingSegment] = useState<number | null>(null);
  const lookupVersion = useRef(0);
  const canEditHifz = !readOnly && getSessionRole() === "supervisor";

  const students = loadStudents();
  const results = q.trim().length >= 2
    ? students.filter((s) => s.name.includes(q.trim())).slice(0, 12)
    : [];

  const openStudent = useCallback(async (s: Student) => {
    const version = ++lookupVersion.current;
    setSelected(s);
    setLoading(true);
    setSheet(null);
    setLoadError(null);
    setLocalLink(null);
    try {
      const data = await fetchStudentPlanSheet(s.id);
      if (version !== lookupVersion.current) return;
      setSheet(data);
      setLocalLink(unconfirmedLocalPlanLink(s.id, data));
    } catch (e) {
      if (version !== lookupVersion.current) return;
      const message = e instanceof Error ? e.message : "فشل التحميل";
      setLoadError(message);
      toast.error(message);
    } finally {
      if (version === lookupVersion.current) setLoading(false);
    }
  }, []);

  const changeHifz = async (segmentIndex: number, isComplete: boolean) => {
    if (!canEditHifz || !selected || !sheet?.assignment || editingSegment !== null) return;
    if (!isComplete && !/^\d{4}-\d{2}-\d{2}$/.test(hifzDate)) {
      toast.error("اختر تاريخ الحفظ");
      return;
    }
    setEditingSegment(segmentIndex);
    const version = lookupVersion.current;
    try {
      const calendar = await fetchActiveCalendar();
      const next = await updateSupervisorPlanHifz(
        selected.id, sheet.assignment.id, segmentIndex,
        isComplete ? "remove" : "complete", hifzDate, calendar.currentWeekNumber,
      );
      if (version === lookupVersion.current) {
        setSheet(next);
        toast.success(isComplete ? "أزيل حفظ اليوم من الاستمارة" : "أضيف حفظ اليوم إلى الاستمارة");
      }
    } catch (e) {
      if (version === lookupVersion.current) {
        toast.error(e instanceof Error ? e.message : "تعذّر تعديل الحفظ");
        void openStudent(selected);
      }
    } finally {
      setEditingSegment(null);
    }
  };

  useEffect(() => {
    if (refreshKey > 0 && selected) {
      void openStudent(selected);
    }
  }, [refreshKey, selected, openStudent]);

  return (
    <Card className="glass-card border-primary/15 shadow-none">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2 text-primary">
          <Search className="w-5 h-5" /> متابعة الخطط التراكمية
        </CardTitle>
        <CardDescription>ابحث عن طالب لعرض ورقة إنجازه</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ابحث باسم الطالب..."
          className="py-5"
        />
        {results.length > 0 && (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {results.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => void openStudent(s)}
                className="w-full text-right px-3 py-2 rounded-lg hover:bg-primary/10 text-sm border border-transparent hover:border-primary/20"
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
        {selected && (
          <>
            {localLink && (
              <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                يوجد ربط قديم محفوظ على هذا الجهاز فقط{localLink.plan ? ` (${localLink.plan.title})` : ""}.
                لا يظهر لدى الخادم؛ راجعه واربط الطالب بالخطة من جديد بعد التأكد من توفر الخدمة.
              </p>
            )}
            {canEditHifz && sheet?.assignment?.status === "active" && (
              <label className="flex items-center gap-2 text-sm">
                تاريخ الحفظ المضاف
                <Input type="date" className="w-44" value={hifzDate} onChange={(e) => setHifzDate(e.target.value)} />
              </label>
            )}
            <StudentPlanSheet
              data={sheet ?? { assignment: null, plan: null, segments: [], completions: [] }}
              studentName={selected.name}
              readOnly={!canEditHifz}
              loading={loading}
              error={loadError}
              onHifzChange={canEditHifz ? (segmentIndex, isComplete) => void changeHifz(segmentIndex, isComplete) : undefined}
              editingSegment={editingSegment}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function SupervisorPlansPanel() {
  const [plans, setPlans] = useState<EducationPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const [studentQ, setStudentQ] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [trackFilter, setTrackFilter] = useState<PlanTrack | "">("");
  const [planQ, setPlanQ] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<EducationPlan | null>(null);
  const [planStartDate, setPlanStartDate] = useState(getCalendarIsoDate());
  const [startHifz, setStartHifz] = useState("1");
  const [lookupRefresh, setLookupRefresh] = useState(0);
  const [studentsVersion, setStudentsVersion] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [assignmentView, setAssignmentView] = useState<{ studentId: string; sheet: StudentPlanSheetData } | null>(null);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const assignmentBusy = useRef(false);

  useEffect(() => {
    let active = true;
    setAssignmentView(null);
    setAssignmentError(null);
    if (selectedStudent) void fetchStudentPlanSheet(selectedStudent.id).then(sheet => {
      if (active) setAssignmentView({ studentId: selectedStudent.id, sheet });
    }).catch(error => {
      if (active) setAssignmentError(error instanceof Error ? error.message : "تعذّر تحميل التعيين الحالي");
    });
    return () => { active = false; };
  }, [selectedStudent?.id, lookupRefresh]);

  const currentAssignment = assignmentView?.studentId === selectedStudent?.id ? assignmentView?.sheet.assignment : undefined;
  const assignmentReady = !!selectedStudent && assignmentView?.studentId === selectedStudent.id;

  const me = getSessionName("المشرف");

  useEffect(() => {
    void syncFromCloud({ force: true }).then(() => setStudentsVersion((v) => v + 1));
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setPlans(await fetchPlans());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل تحميل الخطط");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const onFile = async (file: File) => {
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const parsed = parsePlansExcel(buf);
      if (parsed.length === 0) {
        toast.error("لم يُعثر على صفوف صالحة — تحقق من الأعمدة: المسار، المرحلة (B)، المستوى (C)، المقطع، حفظ، ربط، مراجعة");
        return;
      }
      const res = await importPlans(parsed);
      toast.success(`تم استيراد ${res.plans_imported} خطة (${res.segments_imported} مقطع)`);
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "فشل الاستيراد";
      toast.error(msg, { duration: 15000 });
    } finally {
      setImporting(false);
    }
  };

  const filteredStudents = useMemo(() => {
    if (studentQ.trim().length < 2) return [];
    return loadStudents().filter((s) => s.name.includes(studentQ.trim())).slice(0, 10);
  }, [studentQ, studentsVersion]);

  const filteredPlans = useMemo(() => {
    let list = plans;
    if (trackFilter) list = list.filter((p) => p.track === trackFilter);
    if (planQ.trim()) {
      const q = planQ.trim();
      list = list.filter((p) => p.title.includes(q));
    }
    return list.slice(0, 15);
  }, [plans, trackFilter, planQ]);

  const submitAssign = async () => {
    if (assignmentBusy.current || !assignmentReady) return;
    if (!selectedPlan || !selectedStudent) {
      toast.error("اختر الطالب والخطة");
      return;
    }
    if (selectedStudent.levelType !== selectedPlan.track) {
      toast.error(
        `مسار الطالب (${trackLabel(selectedStudent.levelType)}) لا يطابق مسار الخطة (${trackLabel(selectedPlan.track)})`,
      );
      return;
    }
    const globalPhase = globalPhaseFromPlanLevel(selectedPlan.track, selectedPlan.level_number, plans);
    assignmentBusy.current = true;
    setAssigning(true);
    try {
      await assignStudentPlan(
        selectedStudent.id,
        selectedPlan.id,
        Number(startHifz),
        me,
        {
          plan_start_date: planStartDate,
          start_muraja_segment: globalPhase !== null ? murajaStartSegment(globalPhase) : null,
          face_quotas: faceQuotasFromPlan(selectedPlan),
          expected_assignment_id: currentAssignment?.id ?? "",
        },
      );
      toast.success(`تم ربط ${selectedStudent.name} — ${selectedPlan.title}`);
      setLookupRefresh((k) => k + 1);
      setSelectedStudent(null);
      setSelectedPlan(null);
      setStudentQ("");
      setPlanQ("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الربط");
    } finally {
      assignmentBusy.current = false;
      setAssigning(false);
    }
  };

  const changeAssignmentStatus = async (status: "active" | "frozen") => {
    if (assignmentBusy.current || !selectedStudent || !assignmentReady || !currentAssignment) return;
    assignmentBusy.current = true;
    setAssigning(true);
    try {
      await patchStudentAssignment(selectedStudent.id, status, currentAssignment.id);
      toast.success(status === "frozen" ? "تم تجميد الخطة" : "تم إلغاء التجميد — يمكن للمعلم التنفيذ");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر تحديث التعيين");
    } finally {
      assignmentBusy.current = false;
      setAssigning(false);
      setLookupRefresh(k => k + 1);
    }
  };

  const removePlan = async (plan: EducationPlan) => {
    const ok = confirm(
      `هل تريد حذف الخطة «${plan.title}»\n\nسيتم حذف الخطة وفك الربط الكامل عن جميع الطلاب المرتبطين بها.\n\nلا يمكن التراجع.`,
    );
    if (!ok) return;
    setDeletingId(plan.id);
    try {
      const res = await deletePlan(plan.id);
      toast.success(
        res.assignments_removed > 0
          ? `تم الحذف — أُزيل الربط عن ${res.assignments_removed} طالب`
          : "تم حذف الخطة",
      );
      if (selectedPlan?.id === plan.id) setSelectedPlan(null);
      await refresh();
      setLookupRefresh((k) => k + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الحذف");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="glass-card border-primary/15 shadow-none">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" /> الخطط التعليمية
          </CardTitle>
          <CardDescription>
            استورد ملف Excel — تُحفظ الخطط في قاعدة البيانات ({loading ? "…" : `${plans.length} خطة`})
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-primary/30 bg-primary/10 cursor-pointer text-sm font-bold text-primary hover:bg-primary/15">
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            {importing ? "جاري الاستيراد..." : "استيراد Excel"}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              disabled={importing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = "";
              }}
            />
          </label>
          {plans.length === 0 && !loading && (
            <p className="text-xs text-warning mt-3">
              نفّذ migrate-education-plans.sql في phpMyAdmin ثم استورد Excel
            </p>
          )}
        </CardContent>
      </Card>

      {plans.length > 0 && (
        <Card className="glass-card border-primary/15 shadow-none">
          <CardHeader>
            <CardTitle className="text-lg">الخطط المحفوظة ({plans.length})</CardTitle>
            <CardDescription>حذف خطة خاطئة — يفك الربط عن جميع الطلاب</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-64 overflow-y-auto">
            {plans.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 p-2 rounded-lg bg-secondary/40 border border-border"
              >
                <div className="min-w-0 text-sm">
                  <div className="font-medium truncate">{p.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {trackLabel(p.track)} · {p.segment_count} مقطع
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={deletingId === p.id}
                  className="shrink-0 text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => void removePlan(p)}
                >
                  {deletingId === p.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="glass-card border-primary/15 shadow-none">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Link2 className="w-5 h-5 text-primary" /> ربط طالب بخطة
          </CardTitle>
          <CardDescription>ابحث عن الطالب ثم اختر الخطة المناسبة</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">1. الطالب</label>
            <Input
              value={studentQ}
              onChange={(e) => setStudentQ(e.target.value)}
              placeholder="ابحث باسم الطالب..."
            />
            {filteredStudents.length > 0 && (
              <div className="mt-1 space-y-1 max-h-32 overflow-y-auto border border-border rounded-lg p-1">
                {filteredStudents.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      if (!assignmentBusy.current) setSelectedStudent(s);
                      setStudentQ(s.name);
                      setTrackFilter(s.levelType);
                    }}
                    className={`w-full text-right px-3 py-2 rounded text-sm ${
                      selectedStudent?.id === s.id ? "bg-primary/15 border border-primary/30" : "hover:bg-secondary"
                    }`}
                  >
                    {s.name} · {s.levelType === "gold" ? "ذهبي" : "فضي"}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">2. الخطة</label>
            <div className="flex gap-2 mb-2">
              <select
                value={trackFilter}
                onChange={(e) => setTrackFilter(e.target.value as PlanTrack | "")}
                className="px-3 py-2 rounded-lg bg-input border border-border text-sm"
              >
                <option value="">كل المسارات</option>
                <option value="gold">ذهبي</option>
                <option value="silver">فضي</option>
              </select>
              <Input
                value={planQ}
                onChange={(e) => setPlanQ(e.target.value)}
                placeholder="ابحث باسم الخطة (مثل: التأهيل)..."
                className="flex-1"
              />
            </div>
            {plans.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد خطط — استورد Excel أولاً</p>
            ) : filteredPlans.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا نتائج — غيّر البحث أو المسار</p>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto border border-border rounded-lg p-1">
                {filteredPlans.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPlan(p)}
                    className={`w-full text-right px-3 py-2 rounded text-sm ${
                      selectedPlan?.id === p.id ? "bg-primary/15 border border-primary/30" : "hover:bg-secondary"
                    }`}
                  >
                    <span className="font-medium">{p.title}</span>
                    <span className="text-xs text-muted-foreground mr-2">
                      · {trackLabel(p.track)} · {p.segment_count} مقطع
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedPlan && (
            <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-border">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">تاريخ بداية الخطة</label>
                <Input type="date" value={planStartDate} onChange={(e) => setPlanStartDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">المسار</label>
                <Input readOnly value={trackLabel(selectedPlan.track)} className="bg-muted/30" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">بداية مقطع الحفظ</label>
                <Input type="number" min={1} value={startHifz} onChange={(e) => setStartHifz(e.target.value)} />
              </div>
              <p className="sm:col-span-2 text-xs text-muted-foreground">
                المراجعة في المرحلة العامة 1 تبدأ تلقائياً من المقطع 16. الحفظ: ½=0.5 · 1=1 · 2=2 وجه (ثابت).
              </p>
              <div className="sm:col-span-2 pt-2 border-t border-border">
                <FaceQuotasFields track={selectedPlan.track} />
              </div>
            </div>
          )}

          {selectedStudent && (
            <p className="text-sm" role={assignmentError ? "alert" : "status"}>
              {assignmentError ?? (!assignmentReady ? "جارٍ تأكيد التعيين الحالي..." : currentAssignment
                ? `الخطة الحالية: ${assignmentView?.sheet.plan?.title ?? ""} (${currentAssignment.status === "frozen" ? "مجمّدة" : "نشطة"})`
                : "لا يوجد تعيين حالي مؤكد")}
              {assignmentError && <Button type="button" variant="outline" onClick={() => setLookupRefresh(k => k + 1)}>إعادة المحاولة</Button>}
            </p>
          )}
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              className="flex-1 gold-gradient text-primary-foreground gap-1"
              disabled={assigning || !assignmentReady || !selectedPlan}
              onClick={() => void submitAssign()}
            >
              {assigning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
              ربط الطالب بالخطة
            </Button>
            {selectedStudent && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  title="تجميد الخطة"
                  disabled={assigning || !assignmentReady || !currentAssignment || currentAssignment.status === "frozen"}
                  onClick={() => void changeAssignmentStatus("frozen")}
                >
                  <Snowflake className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  title="إلغاء التجميد"
                  disabled={assigning || !assignmentReady || !currentAssignment || currentAssignment.status !== "frozen"}
                  onClick={() => void changeAssignmentStatus("active")}
                >
                  <Sun className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <StudentFaceReportPanel />

      <PlanStudentLookup refreshKey={lookupRefresh} />
    </div>
  );
}
