import { useCallback, useEffect, useMemo, useState } from "react";
import { loadStudents, type Student } from "@/lib/mock-data";
import { syncFromCloud } from "@/lib/cloud-sync";
import { fetchPlans, fetchStudentPlanSheet, importPlans, assignStudentPlan, patchStudentAssignment } from "@/lib/plans-service";
import type { EducationPlan, PlanTrack, StudentPlanSheetData, DailyFaceQuotas } from "@/lib/plan-types";
import { DEFAULT_FACE_QUOTAS, faceQuotasFromPlan, normalizeFaceQuotas } from "@/lib/plan-daily-faces";
import { FaceQuotasFields } from "@/components/plans/FaceQuotasFields";
import { StudentFaceReportPanel } from "@/components/plans/StudentFaceReportPanel";
import { parsePlansExcel } from "@/lib/plan-excel-import";
import { trackLabel } from "@/lib/plan-translator";
import { isFirstPhasePlan } from "@/lib/plan-phase";
import { getCalendarIsoDate } from "@/lib/operational-date";
import { getSessionName } from "@/lib/session-role";
import { StudentPlanSheet } from "@/components/plans/StudentPlanSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileSpreadsheet, Link2, Loader2, Snowflake, Search } from "lucide-react";
import { toast } from "sonner";

export function PlanStudentLookup({ readOnly = false, refreshKey = 0 }: { readOnly?: boolean; refreshKey?: number }) {
  const [q, setQ] = useState("");
  const [sheet, setSheet] = useState<StudentPlanSheetData | null>(null);
  const [selected, setSelected] = useState<Student | null>(null);
  const [loading, setLoading] = useState(false);

  const students = loadStudents();
  const results = q.trim().length >= 2
    ? students.filter((s) => s.name.includes(q.trim())).slice(0, 12)
    : [];

  const openStudent = useCallback(async (s: Student) => {
    setSelected(s);
    setLoading(true);
    try {
      const data = await fetchStudentPlanSheet(s.id);
      setSheet(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل التحميل");
    } finally {
      setLoading(false);
    }
  }, []);

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
          <StudentPlanSheet
            data={sheet ?? { assignment: null, plan: null, segments: [], completions: [] }}
            studentName={selected.name}
            readOnly={readOnly}
            loading={loading}
          />
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
  const [startMuraja, setStartMuraja] = useState("1");
  const [faceQuotas, setFaceQuotas] = useState<DailyFaceQuotas>({ ...DEFAULT_FACE_QUOTAS });
  const [lookupRefresh, setLookupRefresh] = useState(0);
  const [studentsVersion, setStudentsVersion] = useState(0);

  const me = getSessionName("المشرف");

  useEffect(() => {
    void syncFromCloud().then(() => setStudentsVersion((v) => v + 1));
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
      if (res.stored_locally) {
        toast.warning(
          `تم استيراد ${res.plans_imported} خطة في المتصفح فقط — نفّذ migrate-education-plans.sql في phpMyAdmin ثم أعد الاستيراد`,
          { duration: 8000 },
        );
      } else {
        toast.success(`تم استيراد ${res.plans_imported} خطة (${res.segments_imported} مقطع)`);
      }
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الاستيراد");
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

  const showMurajaStart = selectedPlan ? isFirstPhasePlan(selectedPlan.level_number) : false;

  useEffect(() => {
    if (selectedPlan) {
      setFaceQuotas(faceQuotasFromPlan(selectedPlan));
    }
  }, [selectedPlan]);

  const submitAssign = async () => {
    if (!selectedPlan || !selectedStudent) {
      toast.error("اختر الطالب والخطة");
      return;
    }
    setAssigning(true);
    try {
      await assignStudentPlan(
        selectedStudent.id,
        selectedPlan.id,
        Number(startHifz) || 1,
        me,
        {
          plan_start_date: planStartDate,
          start_muraja_segment: showMurajaStart ? Number(startMuraja) || 1 : null,
          face_quotas: normalizeFaceQuotas(faceQuotas),
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
      setAssigning(false);
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
                      setSelectedStudent(s);
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
              {showMurajaStart && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">بداية المراجعة (المرحلة الأولى فقط)</label>
                  <Input type="number" min={1} value={startMuraja} onChange={(e) => setStartMuraja(e.target.value)} />
                </div>
              )}
              {!showMurajaStart && selectedPlan && (
                <p className="sm:col-span-2 text-xs text-muted-foreground">
                  الربط والمراجعة يبدآن مع الحفظ تلقائياً (مرحلة {selectedPlan.level_number % 1000})
                </p>
              )}
              <div className="sm:col-span-2 pt-2 border-t border-border">
                <FaceQuotasFields value={faceQuotas} onChange={setFaceQuotas} />
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              className="flex-1 gold-gradient text-primary-foreground gap-1"
              disabled={assigning || !selectedStudent || !selectedPlan}
              onClick={() => void submitAssign()}
            >
              {assigning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
              ربط الطالب بالخطة
            </Button>
            {selectedStudent && (
              <Button
                type="button"
                variant="outline"
                title="تجميد"
                onClick={() => void patchStudentAssignment(selectedStudent.id, "frozen").then(() => toast.success("تم التجميد"))}
              >
                <Snowflake className="w-4 h-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <StudentFaceReportPanel />

      <PlanStudentLookup readOnly refreshKey={lookupRefresh} />
    </div>
  );
}
