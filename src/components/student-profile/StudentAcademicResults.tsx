import type { AcademicPhaseRecord } from "@/lib/academic-record";
import { studentPassedPhases } from "@/lib/academic-record";
import { Award, CheckCircle2, XCircle } from "lucide-react";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

export function StudentAcademicResults({
  studentId,
  records,
  compact,
}: {
  studentId: string;
  records?: AcademicPhaseRecord[];
  compact?: boolean;
}) {
  const items = (records ?? studentPassedPhases(studentId)).filter((r) => r.result === "passed");

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        لا توجد مراحل مجتازة مسجّلة بعد
      </p>
    );
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {items.map((r) => (
        <div
          key={r.id}
          className={`rounded-xl border flex items-start justify-between gap-3 ${
            compact ? "p-3 bg-success/5 border-success/20" : "p-4 bg-success/5 border-success/25"
          }`}
        >
          <div className="min-w-0">
            <div className="font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
              {r.planTitle ?? `أسبوع ${r.week}`}
            </div>
            {!compact && r.track && (
              <div className="text-xs text-muted-foreground mt-1">
                {r.track === "gold" ? "مسار ذهبي" : "مسار فضي"}
                {r.levelNumber != null ? ` · مرحلة ${r.levelNumber % 1000}` : ""}
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-1">
              {formatDate(r.testDate)} · محاولة {r.attempt}
            </div>
          </div>
          <div className="text-left shrink-0">
            <div className="text-xl font-bold text-success">{r.percent}%</div>
            {!compact && (
              <div className="text-[10px] text-muted-foreground">
                حفظ {r.hifzScore} + مراجعة {r.reviewScore}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function StudentAcademicResultsSection({ studentId }: { studentId: string }) {
  const passed = studentPassedPhases(studentId);
  const all = passed.length;

  return (
    <section>
      <h4 className="text-lg font-bold text-primary mb-3 flex items-center gap-2">
        <Award className="w-5 h-5" />
        النتائج والمراحل المجتازة
        {all > 0 && (
          <span className="text-xs font-normal text-muted-foreground">({all})</span>
        )}
      </h4>
      <StudentAcademicResults studentId={studentId} records={passed} />
    </section>
  );
}

export function AcademicRecordFullList({ records }: { records: AcademicPhaseRecord[] }) {
  if (records.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">لا يوجد سجل أكاديمي</p>;
  }

  return (
    <div className="space-y-2">
      {records.map((r) => (
        <div
          key={r.id}
          className={`p-3 rounded-lg border text-sm ${
            r.result === "passed" ? "bg-success/5 border-success/20" : "bg-destructive/5 border-destructive/20"
          }`}
        >
          <div className="flex justify-between gap-2">
            <span className="font-bold flex items-center gap-1">
              {r.result === "passed" ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-success" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-destructive" />
              )}
              {r.planTitle ?? `أسبوع ${r.week}`}
            </span>
            <span className="font-bold">{r.percent}%</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {formatDate(r.testDate)} · محاولة {r.attempt} · حفظ {r.hifzScore} + مراجعة {r.reviewScore}
          </div>
        </div>
      ))}
    </div>
  );
}
