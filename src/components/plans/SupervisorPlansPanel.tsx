import { useCallback, useEffect, useState } from "react";
import { loadStudents, type Student } from "@/lib/mock-data";
import { fetchPlans, fetchStudentPlanSheet, importPlans, assignStudentPlan, patchStudentAssignment } from "@/lib/plans-service";
import type { EducationPlan, StudentPlanSheetData } from "@/lib/plan-types";
import { parsePlansExcel } from "@/lib/plan-excel-import";
import { trackLabel, levelUnit } from "@/lib/plan-translator";
import { getSessionName } from "@/lib/session-role";
import { StudentPlanSheet } from "@/components/plans/StudentPlanSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { FileSpreadsheet, Link2, Loader2, Snowflake, Search } from "lucide-react";
import { toast } from "sonner";

export function PlanStudentLookup({ readOnly = false }: { readOnly?: boolean }) {
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
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignPlan, setAssignPlan] = useState<EducationPlan | null>(null);
  const [studentQ, setStudentQ] = useState("");
  const [startSeg, setStartSeg] = useState("1");
  const [assignStudent, setAssignStudent] = useState<Student | null>(null);
  const me = getSessionName("المشرف");
  const students = loadStudents();

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
        toast.error("لم يُعثر على صفوف صالحة — تحقق من أعمدة Excel");
        return;
      }
      const res = await importPlans(parsed);
      toast.success(`تم استيراد ${res.plans_imported} خطة (${res.segments_imported} مقطع)`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الاستيراد");
    } finally {
      setImporting(false);
    }
  };

  const submitAssign = async () => {
    if (!assignPlan || !assignStudent) return;
    try {
      await assignStudentPlan(assignStudent.id, assignPlan.id, Number(startSeg) || 1, me);
      toast.success(`تم ربط ${assignStudent.name} بالخطة`);
      setAssignOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الربط");
    }
  };

  const filteredStudents = studentQ.trim()
    ? students.filter((s) => s.name.includes(studentQ.trim())).slice(0, 8)
    : [];

  return (
    <div className="space-y-6">
      <Card className="glass-card border-primary/15 shadow-none">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" /> الخطط التعليمية
          </CardTitle>
          <CardDescription>
            استيراد 90 خطة (30 ذهبية + 60 فضية) — الأعمدة: المسار، المستوى، المقطع، حفظ، ربط، مراجعة
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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

          {loading ? (
            <div className="flex justify-center py-8 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : plans.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">لا توجد خطط — استورد ملف Excel</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[360px] overflow-y-auto">
              {plans.map((p) => (
                <div key={p.id} className="rounded-lg border border-border bg-secondary/30 p-3 flex flex-col gap-2">
                  <div className="font-bold text-sm">{p.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {trackLabel(p.track)} · {levelUnit(p.track)} {p.level_number} · {p.segment_count} مقطع
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-auto gap-1"
                    onClick={() => { setAssignPlan(p); setAssignOpen(true); }}
                  >
                    <Link2 className="w-3.5 h-3.5" /> ربط طالب
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <PlanStudentLookup readOnly />

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>ربط طالب — {assignPlan?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={studentQ} onChange={(e) => setStudentQ(e.target.value)} placeholder="ابحث عن الطالب..." />
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {filteredStudents.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setAssignStudent(s)}
                  className={`w-full text-right px-3 py-2 rounded text-sm ${assignStudent?.id === s.id ? "bg-primary/15 border border-primary/30" : "hover:bg-secondary"}`}
                >
                  {s.name} · {s.levelType === "gold" ? "ذهبي" : "فضي"}
                </button>
              ))}
            </div>
            <Input
              type="number"
              min={1}
              value={startSeg}
              onChange={(e) => setStartSeg(e.target.value)}
              placeholder="مقطع البداية"
            />
            <div className="flex gap-2">
              <Button type="button" className="flex-1 gold-gradient text-primary-foreground" onClick={() => void submitAssign()}>
                ربط
              </Button>
              {assignStudent && (
                <Button
                  type="button"
                  variant="outline"
                  title="تجميد"
                  onClick={() => void patchStudentAssignment(assignStudent.id, "frozen").then(() => toast.success("تم التجميد"))}
                >
                  <Snowflake className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
