import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadGrades, loadHalaqat, loadStudents } from "@/lib/mock-data";
import { syncFromCloud } from "@/lib/cloud-sync";
import { fetchActiveCalendar, type AcademicCalendar } from "@/lib/academic-context";
import {
  buildAcademicReport,
  type AcademicReport,
  type ReportFocus,
  type ReportScope,
} from "@/lib/academic-reports";
import {
  approveReport,
  getReportApproval,
  getReportNotes,
  listReportArchive,
  reportFingerprint,
  type ArchivedAcademicReport,
  type ReportApproval,
} from "@/lib/academic-report-api";
import { exportApprovedExcel, printApprovedReport } from "@/lib/academic-report-export";
import { useTenant } from "@/contexts/TenantContext";
import { FormalAcademicReport } from "@/components/role-workspace/FormalAcademicReport";

export function ManagerAcademicReportsPanel() {
  const { brandName, logoUrl } = useTenant();
  const [calendar, setCalendar] = useState<AcademicCalendar | null>(null);
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState(0);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [scope, setScope] = useState<ReportScope>("complex");
  const [halaqaId, setHalaqaId] = useState(0);
  const [studentId, setStudentId] = useState("");
  const [named, setNamed] = useState(false);
  const [focus, setFocus] = useState<ReportFocus>("all");
  const [donorName, setDonorName] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [approval, setApproval] = useState<ReportApproval>(null);
  const [approvedSignature, setApprovedSignature] = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const [fingerprintSignature, setFingerprintSignature] = useState("");
  const [busy, setBusy] = useState(false);
  const [archiveVersion, setArchiveVersion] = useState(0);
  const [error, setError] = useState("");
  const preview = useRef<HTMLDivElement>(null);

  async function refresh() {
    setReady(false);
    setError("");
    try {
      await syncFromCloud({ force: true });
      const [cal, loadedNotes] = await Promise.all([fetchActiveCalendar(true), getReportNotes()]);
      setCalendar(cal);
      setNotes(loadedNotes);
      setVersion((v) => v + 1);
      if (!from && cal.semester) {
        const current = cal.weeks.find((w) => w.week_number === cal.currentWeekNumber);
        setFrom(
          current?.start_date && current.start_date > cal.semester.start_date
            ? current.start_date
            : cal.semester.start_date,
        );
        setTo(cal.operationalDate);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر تحميل بيانات التقرير");
    } finally {
      setReady(true);
    }
  }
  useEffect(() => {
    void refresh(); /* On-demand refresh after opening the panel. */
    // Mount once; later data refresh is explicit and preserves the chosen dates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const halaqat = useMemo(() => {
    void version;
    return loadHalaqat();
  }, [version]);
  const students = useMemo(() => {
    void version;
    return loadStudents();
  }, [version]);
  const grades = useMemo(() => {
    void version;
    return loadGrades();
  }, [version]);
  const filteredStudents = students.filter((s) => !halaqaId || s.halaqaId === halaqaId);
  const options = useMemo(
    () => ({
      scope,
      from,
      to,
      halaqaId: halaqaId || undefined,
      studentId: studentId || undefined,
      named: scope === "student" || (named && !donorName.trim()),
      focus,
      donorName: donorName.trim(),
    }),
    [scope, from, to, halaqaId, studentId, named, focus, donorName],
  );
  const report: AcademicReport | null = useMemo(() => {
    if (
      !calendar ||
      !ready ||
      !from ||
      !to ||
      (scope === "halaqa" && !halaqaId) ||
      (scope === "student" && !studentId)
    )
      return null;
    try {
      return buildAcademicReport(calendar, halaqat, students, grades, options, notes);
    } catch {
      return null;
    }
  }, [
    calendar,
    ready,
    from,
    to,
    scope,
    halaqaId,
    studentId,
    options,
    notes,
    halaqat,
    students,
    grades,
  ]);
  const signature = useMemo(
    () => (report ? JSON.stringify({ ...report, generatedAt: undefined }) : ""),
    [report],
  );
  const approved = !!approval && approvedSignature === signature;

  useEffect(() => {
    let live = true;
    setApproval(null);
    setFingerprint("");
    setFingerprintSignature("");
    setApprovedSignature("");
    if (report)
      void reportFingerprint(report)
        .then(async (key) => {
          const found = await getReportApproval(key);
          if (live) {
            setFingerprint(key);
            setFingerprintSignature(signature);
            setApproval(found);
            setApprovedSignature(found ? signature : "");
          }
        })
        .catch(() => {
          if (live) setError("تعذّر التحقق من حالة اعتماد التقرير");
        });
    return () => {
      live = false;
    };
  }, [report, signature]);

  async function approve() {
    if (!report || !fingerprint || fingerprintSignature !== signature) return;
    setBusy(true);
    try {
      const result = await approveReport(report, fingerprint);
      setApproval(result);
      setApprovedSignature(result ? signature : "");
      setArchiveVersion((v) => v + 1);
      toast.success("اعتمد المدير هذا الإصدار من التقرير");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر الاعتماد");
    } finally {
      setBusy(false);
    }
  }
  async function image() {
    if (!approved || !preview.current || !report) return;
    try {
      const url = await toPng(preview.current, { backgroundColor: "#ffffff", pixelRatio: 2 });
      const link = document.createElement("a");
      link.href = url;
      link.download = `ملخص_${report.options.from}_${report.options.to}.png`;
      link.click();
    } catch {
      toast.error("تعذّر تصدير الصورة");
    }
  }

  return (
    <div className="space-y-5" dir="rtl">
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <div className="flex justify-between items-center gap-3">
          <div>
            <h2 className="text-lg font-bold">إعداد التقارير</h2>
            <p className="text-xs text-muted-foreground">
              معاينة المسودة، ثم اعتماد المدير للنسخة النهائية
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={!ready}>
            تحديث البيانات
          </Button>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="text-sm">
            نوع التقرير
            <select
              className="block w-full rounded-md border bg-background p-2 mt-1"
              value={scope}
              onChange={(e) => {
                setScope(e.target.value as ReportScope);
                setStudentId("");
              }}
            >
              <option value="student">الطالب</option>
              <option value="halaqa">الحلقة</option>
              <option value="complex">المجمع</option>
            </select>
          </label>
          <label className="text-sm">
            من
            <Input
              type="date"
              className="mt-1"
              min={calendar?.semester?.start_date}
              max={calendar?.operationalDate}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="text-sm">
            إلى
            <Input
              type="date"
              className="mt-1"
              min={from}
              max={calendar?.operationalDate}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label className="text-sm">
            الحلقة
            <select
              className="block w-full rounded-md border bg-background p-2 mt-1"
              value={halaqaId}
              onChange={(e) => {
                setHalaqaId(Number(e.target.value));
                setStudentId("");
              }}
            >
              <option value={0}>{scope === "complex" ? "جميع الحلقات" : "اختر الحلقة"}</option>
              {halaqat.map((h) => (
                <option value={h.id} key={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </label>
          {scope === "student" && (
            <label className="text-sm">
              الطالب
              <select
                className="block w-full rounded-md border bg-background p-2 mt-1"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
              >
                <option value="">اختر الطالب</option>
                {filteredStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {scope !== "student" && (
            <label className="text-sm">
              نسخة التقرير
              <select
                className="block w-full rounded-md border bg-background p-2 mt-1"
                value={named && !donorName.trim() ? "named" : "counts"}
                onChange={(e) => setNamed(e.target.value === "named")}
              >
                <option value="counts">الأعداد فقط</option>
                <option value="named" disabled={!!donorName.trim()}>
                  تفصيل بالأسماء للمدير
                </option>
              </select>
            </label>
          )}
          {scope === "complex" && (
            <>
              <label className="text-sm">
                تركيز التقرير
                <select
                  className="block w-full rounded-md border bg-background p-2 mt-1"
                  value={focus}
                  onChange={(e) => setFocus(e.target.value as ReportFocus)}
                >
                  <option value="all">جميع المؤشرات</option>
                  <option value="attendance">الانتظام</option>
                  <option value="hifz">الحفظ</option>
                  <option value="rabt">الربط</option>
                  <option value="muraja">المراجعة</option>
                </select>
              </label>
              <label className="text-sm">
                مقدم إلى (اختياري)
                <Input
                  className="mt-1"
                  maxLength={100}
                  value={donorName}
                  onChange={(e) => {
                    setDonorName(e.target.value);
                    if (e.target.value.trim()) setNamed(false);
                  }}
                  placeholder="اسم الداعم"
                />
              </label>
            </>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {!ready && <p>جاري تحميل البيانات...</p>}
      {ready && !report && (
        <p className="glass-card rounded-xl p-5 text-muted-foreground">
          اختر نطاقاً وفترة تتضمن أيام دراسة وطلاباً ضمن الفصل الحالي.
        </p>
      )}
      {report && (
        <>
          <div className="overflow-x-auto rounded-2xl border shadow-sm">
            <div ref={preview}>
              <FormalAcademicReport
                report={report}
                brandName={brandName}
                logoUrl={logoUrl}
                approval={approved ? approval : null}
              />
            </div>
          </div>
          <div className="glass-card rounded-xl p-4 space-y-3">
            {report.missingFields > 0 && (
              <p className="text-sm text-amber-700">
                يوجد {report.missingFields} خانة لم تُرصد في الفترة. راجعها قبل الاعتماد؛ لا تُحسب
                كغياب أو رسوب.
              </p>
            )}
            <p className="text-sm">
              {approved
                ? `معتمد بواسطة ${approval!.by} في ${approval!.at}`
                : "هذا الإصدار مسودة. يلزم اعتماد المدير قبل التصدير."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy || !fingerprint || fingerprintSignature !== signature || approved}
                onClick={() => void approve()}
              >
                اعتماد المدير
              </Button>
              <Button
                variant="outline"
                disabled={!approved}
                onClick={() =>
                  approved && printApprovedReport(report, brandName, logoUrl, approval!)
                }
              >
                PDF / طباعة
              </Button>
              <Button
                variant="outline"
                disabled={!approved}
                onClick={() => approved && exportApprovedExcel(report, approval!)}
              >
                Excel
              </Button>
              <Button variant="outline" disabled={!approved} onClick={() => void image()}>
                صورة PNG
              </Button>
            </div>
          </div>
        </>
      )}
      <ApprovedReportArchive version={archiveVersion} brandName={brandName} logoUrl={logoUrl} />
    </div>
  );
}

function ApprovedReportArchive({
  version,
  brandName,
  logoUrl,
}: {
  version: number;
  brandName: string;
  logoUrl: string | null;
}) {
  const [rows, setRows] = useState<ArchivedAcademicReport[]>([]);
  const [selected, setSelected] = useState("");
  const [approval, setApproval] = useState<ReportApproval>(null);
  const [error, setError] = useState("");
  const imageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    void listReportArchive()
      .then(setRows)
      .catch(() => setError("تعذّر تحميل أرشيف التقارير"));
  }, [version]);
  async function select(key: string) {
    setSelected(key);
    setApproval(null);
    setError("");
    if (!key) return;
    try {
      setApproval(await getReportApproval(key));
    } catch {
      setError("تعذّر استرجاع نسخة التقرير المعتمدة");
    }
  }
  const report: AcademicReport | null = approval?.snapshot
    ? { ...approval.snapshot, generatedAt: approval.at }
    : null;
  async function saveImage() {
    if (!report || !imageRef.current) return;
    try {
      const url = await toPng(imageRef.current, { backgroundColor: "#ffffff", pixelRatio: 2 });
      const link = document.createElement("a");
      link.href = url;
      link.download = `تقرير_معتمد_${report.options.from}_${report.options.to}.png`;
      link.click();
    } catch {
      toast.error("تعذّر تصدير الصورة");
    }
  }
  return (
    <section className="glass-card rounded-xl p-5 space-y-3" dir="rtl">
      <h2 className="font-bold">التقارير المعتمدة سابقاً</h2>
      <select
        value={selected}
        onChange={(e) => void select(e.target.value)}
        className="w-full rounded-md border bg-background p-2"
      >
        <option value="">اختر تقريراً معتمداً</option>
        {rows.map((row) => (
          <option key={row.fingerprint} value={row.fingerprint}>
            {row.scope === "student" ? "طالب" : row.scope === "halaqa" ? "حلقة" : "مجمع"} ·{" "}
            {row.period_from} – {row.period_to} · {row.approved_at}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {report && approval && (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <div ref={imageRef}>
              <FormalAcademicReport
                report={report}
                brandName={brandName}
                logoUrl={logoUrl}
                approval={approval}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => printApprovedReport(report, brandName, logoUrl, approval)}
            >
              PDF / طباعة
            </Button>
            <Button variant="outline" onClick={() => exportApprovedExcel(report, approval)}>
              Excel
            </Button>
            <Button variant="outline" onClick={() => void saveImage()}>
              صورة PNG
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
