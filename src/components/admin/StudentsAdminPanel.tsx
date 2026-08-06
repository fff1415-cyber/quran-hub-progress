import { useMemo, useState } from "react";
import {
  loadHalaqat, saveHalaqat, loadStudents, saveStudents, type Halaqa, type Student,
} from "@/lib/mock-data";
import {
  toCsvUrl, parseCsv, normalizeRows, normalizeArabic, STUDENT_IMPORT_COLUMNS, type SheetRow,
} from "@/lib/google-sheets";
import {
  pushHalaqat, deleteHalaqa, pushStudents, deleteStudent, patchStudent,
} from "@/lib/cloud-sync";
import { linkStudentToPlan } from "@/lib/student-plan-link";
import { fetchPlans } from "@/lib/plans-service";
import {
  INSTITUTE_LEVELS, validateLevelAndPhase, instituteLevelFromGlobalPhase,
} from "@/lib/plan-level-ranges";
import { getSessionName } from "@/lib/session-role";
import { Plus, Trash2, FileSpreadsheet, Download, Loader2, Pencil, CheckSquare, Square, QrCode, Printer } from "lucide-react";
import { toast } from "sonner";
import { TRACK_FACE_QUOTAS } from "@/lib/plan-daily-faces";
import { printSingleStudentQrCard, printStudentQrCards } from "@/lib/student-qr-cards";
import { useTenant } from "@/contexts/TenantContext";

function sheetRowToStudent(row: SheetRow, halaqaId: number, existing?: Student): Student {
  const phase = row.phaseNumber > 0 ? row.phaseNumber : 1;
  const instituteLevel = row.instituteLevel
    || instituteLevelFromGlobalPhase(row.levelType, phase)
    || "";
  const base: Student = {
    id: existing?.id ?? `s-import-${row.nationalId}`,
    name: row.name,
    halaqaId,
    nationalId: row.nationalId,
    parentPhone: row.parentPhone,
    studentPhone: row.studentPhone || undefined,
    level: String(phase),
    phaseNumber: phase,
    instituteLevel,
    levelType: row.levelType,
  };
  return base;
}

export function StudentImportPanel() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<SheetRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const halaqatCurrent = useMemo(() => loadHalaqat(), [preview]);
  const halaqatByNorm = useMemo(
    () => new Map(halaqatCurrent.map((h) => [normalizeArabic(h.name), h])),
    [halaqatCurrent],
  );

  const fetchPreview = async () => {
    if (!url.trim()) { toast.error("الصق رابط Google Sheet أولاً"); return; }
    setLoading(true); setError(null); setPreview([]);
    try {
      const res = await fetch(toCsvUrl(url));
      if (!res.ok) throw new Error(`فشل الجلب (${res.status})`);
      const normalized = normalizeRows(parseCsv(await res.text()));
      if (normalized.length === 0) throw new Error("لا توجد صفوف صالحة");
      setPreview(normalized);
      toast.success(`تم قراءة ${normalized.length} طالب`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "خطأ";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const applyImport = async () => {
    setImporting(true);
    const assignedBy = getSessionName("الاستيراد");
    const halaqatByName = new Map(halaqatCurrent.map((h) => [normalizeArabic(h.name), h]));
    const nextHalaqat = [...halaqatCurrent];

    for (const row of preview) {
      const key = normalizeArabic(row.halaqaName);
      if (!row.halaqaName || halaqatByName.has(key)) continue;
      const halaqa: Halaqa = {
        id: Math.max(0, ...nextHalaqat.map((h) => h.id)) + 1,
        name: row.halaqaName,
        isTalqeen: row.isTalqeen,
        teacherName: row.teacherName || "—",
        teacherCode: row.teacherCode || "",
        assistantName: row.assistantName || "—",
        assistantCode: row.assistantCode || "",
      };
      nextHalaqat.push(halaqa);
      halaqatByName.set(key, halaqa);
    }

    const existingStudents = loadStudents();
    const studentsByNid = new Map(existingStudents.map((s) => [s.nationalId, s]));
    const updated: Student[] = [...existingStudents];
    const linkQueue: { student: Student; row: SheetRow }[] = [];
    let added = 0, updatedCount = 0, skipped = 0;

    for (const row of preview) {
      const halaqa = halaqatByName.get(normalizeArabic(row.halaqaName));
      if (!halaqa) { skipped++; continue; }

      if (row.instituteLevel) {
        const v = validateLevelAndPhase(row.levelType, row.instituteLevel, row.phaseNumber);
        if (!v.ok) {
          toast.warning(`${row.name}: ${v.message}`);
        }
      }

      const existing = studentsByNid.get(row.nationalId);
      const student = sheetRowToStudent(row, halaqa.id, existing);
      if (existing) {
        const idx = updated.findIndex((s) => s.id === existing.id);
        updated[idx] = student;
        updatedCount++;
      } else {
        updated.push(student);
        studentsByNid.set(row.nationalId, student);
        added++;
      }

      if (row.instituteLevel || row.phaseNumber > 0) {
        linkQueue.push({ student, row });
      }
    }

    saveHalaqat(nextHalaqat);
    saveStudents(updated);
    try {
      await pushHalaqat(nextHalaqat);
      await pushStudents(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر الحفظ في السحابة");
      setImporting(false);
      return;
    }

    let linked = 0;
    let linkFailed = 0;
    if (linkQueue.length > 0) {
      const [goldPlans, silverPlans] = await Promise.all([fetchPlans("gold"), fetchPlans("silver")]);
      for (const { student, row } of linkQueue) {
        try {
          const res = await linkStudentToPlan({
            studentId: student.id,
            track: row.levelType,
            instituteLevel: student.instituteLevel || row.instituteLevel,
            globalPhase: student.phaseNumber ?? row.phaseNumber,
            startHifzSegment: row.startHifzSegment,
            planStartDate: row.planStartDate || null,
            assignedBy,
            optional: true,
            plansCache: row.levelType === "gold" ? goldPlans : silverPlans,
          });
          if (res.ok) linked++;
          else linkFailed++;
        } catch {
          linkFailed++;
        }
      }
    }

    toast.success(
      `+${added} جديد · ${updatedCount} محدّث · ${linked} مربوط بخطة` +
      (linkFailed ? ` · ${linkFailed} بدون خطة (استورد Excel أولاً)` : "") +
      (skipped ? ` · ${skipped} متجاهل` : ""),
    );
    if (linkFailed > 0) {
      toast.warning("بعض الطلاب لم تُربط خططهم — تأكد من استيراد ملف Excel للخطط في صفحة المشرف", {
        duration: 8000,
      });
    }
    setPreview([]);
    setUrl("");
    setImporting(false);
  };

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-5">
        <h3 className="font-bold mb-3 text-primary flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5" /> استيراد الطلاب + ربط الخطط
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          الأعمدة (صف عناوين): {STUDENT_IMPORT_COLUMNS.join(" · ")}
        </p>
        <div className="flex gap-2">
          <input
            className="flex-1 px-3 py-2 rounded-lg bg-input border border-border"
            placeholder="https://docs.google.com/spreadsheets/d/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            dir="ltr"
          />
          <button type="button" onClick={() => void fetchPreview()} disabled={loading}
            className="px-4 py-2 rounded-lg gold-gradient text-primary-foreground font-bold flex items-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            معاينة
          </button>
        </div>
        {error && <p className="text-sm text-destructive mt-3">{error}</p>}
      </div>

      {preview.length > 0 && (
        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="font-bold text-primary">معاينة ({preview.length})</h3>
            <button type="button" onClick={() => void applyImport()} disabled={importing}
              className="px-4 py-2 rounded-lg gold-gradient text-primary-foreground font-bold disabled:opacity-50">
              {importing ? "جاري الاستيراد…" : "تأكيد الاستيراد"}
            </button>
          </div>
          <div className="max-h-96 overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-secondary/50 text-xs text-muted-foreground">
                <tr>
                  <th className="p-2 text-right">الاسم</th>
                  <th className="p-2 text-right">الحلقة</th>
                  <th className="p-2 text-right">المستوى</th>
                  <th className="p-2 text-right">مرحلة</th>
                  <th className="p-2 text-right">المسار</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 80).map((r, i) => (
                  <tr key={i} className="border-b border-border/30">
                    <td className="p-2">{r.name}</td>
                    <td className="p-2 text-muted-foreground">{r.halaqaName}</td>
                    <td className="p-2">{r.instituteLevel || "—"}</td>
                    <td className="p-2">{r.phaseNumber}</td>
                    <td className="p-2">{r.levelType === "gold" ? "ذهبي" : "فضي"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

type EditForm = Omit<Student, "id"> & {
  dailyRabtFaces: number;
  dailyMurajaFaces: number;
};

export function StudentsManagementPanel() {
  const { brandName, logoUrl } = useTenant();
  const [students, setStudents] = useState<Student[]>(() => loadStudents());
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [printHalaqaId, setPrintHalaqaId] = useState<number | "all">("all");
  const [printing, setPrinting] = useState(false);
  const halaqat = loadHalaqat();

  const emptyForm = (): EditForm => ({
    name: "", halaqaId: halaqat[0]?.id || 1, nationalId: "", parentPhone: "",
    studentPhone: "", level: "1", phaseNumber: 1, instituteLevel: INSTITUTE_LEVELS[0],
    levelType: "gold", dailyRabtFaces: TRACK_FACE_QUOTAS.gold.daily_rabt_faces,
    dailyMurajaFaces: TRACK_FACE_QUOTAS.gold.daily_muraja_faces,
  });

  const [form, setForm] = useState<EditForm>(emptyForm);

  const filtered = useMemo(() => {
    if (!q.trim()) return students;
    return students.filter((s) => s.name.includes(q) || s.nationalId.includes(q));
  }, [students, q]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((s) => selected.has(s.id));

  const toggleAll = () => {
    if (allFilteredSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((s) => s.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startEdit = (s: Student) => {
    setEditingId(s.id);
    setForm({
      name: s.name,
      halaqaId: s.halaqaId,
      nationalId: s.nationalId,
      parentPhone: s.parentPhone,
      studentPhone: s.studentPhone ?? "",
      level: s.level,
      phaseNumber: s.phaseNumber ?? (parseInt(s.level, 10) || 1),
      instituteLevel: s.instituteLevel ?? INSTITUTE_LEVELS[0],
      levelType: s.levelType,
      dailyRabtFaces: TRACK_FACE_QUOTAS[s.levelType].daily_rabt_faces,
      dailyMurajaFaces: TRACK_FACE_QUOTAS[s.levelType].daily_muraja_faces,
    });
  };

  const saveEdit = async () => {
    if (!editingId || !form.name || !form.nationalId) {
      toast.error("الاسم والهوية مطلوبان");
      return;
    }
    const phase = form.phaseNumber ?? (parseInt(form.level, 10) || 1);
    const patch: Student = {
      id: editingId,
      name: form.name,
      halaqaId: form.halaqaId,
      nationalId: form.nationalId,
      parentPhone: form.parentPhone,
      studentPhone: form.studentPhone || undefined,
      level: String(phase),
      phaseNumber: phase,
      instituteLevel: form.instituteLevel,
      levelType: form.levelType,
    };
    setSaving(true);
    try {
      const next = students.map((s) => (s.id === editingId ? patch : s));
      saveStudents(next);
      await pushStudents(next);
      setStudents(next);
      setEditingId(null);
      toast.success("تم حفظ التعديلات");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const add = async () => {
    if (!form.name || !form.nationalId) { toast.error("الاسم والهوية مطلوبان"); return; }
    const phase = form.phaseNumber ?? 1;
    const newStudent: Student = {
      id: `s-${Date.now()}`,
      name: form.name,
      halaqaId: form.halaqaId,
      nationalId: form.nationalId,
      parentPhone: form.parentPhone,
      studentPhone: form.studentPhone || undefined,
      level: String(phase),
      phaseNumber: phase,
      instituteLevel: form.instituteLevel,
      levelType: form.levelType,
    };
    setSaving(true);
    try {
      const next = [...students, newStudent];
      saveStudents(next);
      await pushStudents(next);
      setStudents(next);
      setForm(emptyForm());
      toast.success("تمت إضافة الطالب");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الإضافة");
    } finally {
      setSaving(false);
    }
  };

  const delOne = async (id: string) => {
    if (!confirm("حذف هذا الطالب؟")) return;
    setSaving(true);
    try {
      await deleteStudent(id);
      const next = students.filter((s) => s.id !== id);
      saveStudents(next);
      setStudents(next);
      setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
      toast.success("تم الحذف");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الحذف");
    } finally {
      setSaving(false);
    }
  };

  const delSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`حذف ${selected.size} طالب؟`)) return;
    setSaving(true);
    try {
      for (const id of selected) {
        await deleteStudent(id);
      }
      const next = students.filter((s) => !selected.has(s.id));
      saveStudents(next);
      setStudents(next);
      setSelected(new Set());
      toast.success("تم حذف المحدد");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الحذف");
    } finally {
      setSaving(false);
    }
  };

  const printCards = async (list: Student[]) => {
    if (list.length === 0) {
      toast.error("لا يوجد طلاب للطباعة");
      return;
    }
    setPrinting(true);
    try {
      const ok = await printStudentQrCards(
        list.map((s) => ({
          id: s.id,
          name: s.name,
          halaqaName: halaqat.find((h) => h.id === s.halaqaId)?.name,
        })),
        {
          brandName,
          logoUrl,
          subtitle:
            printHalaqaId === "all"
              ? `بطاقات QR — ${list.length} طالب`
              : `حلقة ${halaqat.find((h) => h.id === printHalaqaId)?.name ?? ""}`,
        },
      );
      if (!ok) {
        toast.error("تعذّر فتح نافذة الطباعة — تحقق من مانع النوافذ المنبثقة");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل إنشاء البطاقات");
    } finally {
      setPrinting(false);
    }
  };

  const printOneCard = async (student: Student) => {
    setPrinting(true);
    try {
      const ok = await printSingleStudentQrCard(
        {
          id: student.id,
          name: student.name,
          halaqaName: halaqat.find((h) => h.id === student.halaqaId)?.name,
        },
        { brandName, logoUrl },
      );
      if (!ok) {
        toast.error("تعذّر فتح نافذة الطباعة");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل طباعة البطاقة");
    } finally {
      setPrinting(false);
    }
  };

  const studentsForBulkPrint = useMemo(() => {
    const base = printHalaqaId === "all" ? students : students.filter((s) => s.halaqaId === printHalaqaId);
    if (selected.size > 0) {
      return base.filter((s) => selected.has(s.id));
    }
    return base;
  }, [printHalaqaId, selected, students]);

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-5">
        <h3 className="font-bold mb-3 text-primary">
          {editingId ? "تعديل طالب" : "إضافة طالب"}
        </h3>
        <div className="grid md:grid-cols-3 gap-2">
          <input className="px-3 py-2 rounded-lg bg-input border border-border" placeholder="اسم الطالب" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="px-3 py-2 rounded-lg bg-input border border-border" placeholder="رقم الهوية" value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} />
          <input className="px-3 py-2 rounded-lg bg-input border border-border" placeholder="جوال ولي الأمر" value={form.parentPhone} onChange={(e) => setForm({ ...form, parentPhone: e.target.value })} />
          <input className="px-3 py-2 rounded-lg bg-input border border-border" placeholder="جوال الطالب (اخ.)" value={form.studentPhone ?? ""} onChange={(e) => setForm({ ...form, studentPhone: e.target.value })} />
          <select className="px-3 py-2 rounded-lg bg-input border border-border" value={form.halaqaId} onChange={(e) => setForm({ ...form, halaqaId: Number(e.target.value) })}>
            {halaqat.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <select className="px-3 py-2 rounded-lg bg-input border border-border" value={form.levelType} onChange={(e) => setForm({ ...form, levelType: e.target.value as "gold" | "silver" })}>
            <option value="gold">ذهبي</option>
            <option value="silver">فضي</option>
          </select>
          <select className="px-3 py-2 rounded-lg bg-input border border-border" value={form.instituteLevel ?? ""} onChange={(e) => setForm({ ...form, instituteLevel: e.target.value })}>
            {INSTITUTE_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <input type="number" min={1} className="px-3 py-2 rounded-lg bg-input border border-border" placeholder="رقم المرحلة" value={form.phaseNumber ?? form.level} onChange={(e) => setForm({ ...form, phaseNumber: Number(e.target.value) || 1, level: e.target.value })} />
        </div>
        <div className="flex gap-2 mt-3 flex-wrap">
          {editingId ? (
            <>
              <button type="button" onClick={() => void saveEdit()} disabled={saving} className="px-4 py-2 rounded-lg gold-gradient text-primary-foreground font-bold">حفظ التعديل</button>
              <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm()); }} className="px-4 py-2 rounded-lg border border-border">إلغاء</button>
            </>
          ) : (
            <button type="button" onClick={() => void add()} disabled={saving} className="px-4 py-2 rounded-lg gold-gradient text-primary-foreground font-bold flex items-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} إضافة
            </button>
          )}
        </div>
      </div>

      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h3 className="font-bold text-primary">الطلاب ({filtered.length} / {students.length})</h3>
          <div className="flex gap-2 flex-wrap items-center">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث…" className="px-3 py-1.5 rounded-lg bg-input border border-border text-sm" />
            <select
              value={printHalaqaId === "all" ? "all" : String(printHalaqaId)}
              onChange={(e) => setPrintHalaqaId(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="px-2 py-1.5 rounded-lg bg-input border border-border text-xs"
            >
              <option value="all">كل الحلقات — طباعة QR</option>
              {halaqat.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={printing}
              onClick={() => void printCards(studentsForBulkPrint)}
              className="text-xs px-2 py-1 rounded border border-primary/30 text-primary flex items-center gap-1 disabled:opacity-60"
            >
              {printing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
              طباعة QR ({studentsForBulkPrint.length})
            </button>
            <button type="button" onClick={toggleAll} className="text-xs px-2 py-1 rounded border border-border flex items-center gap-1">
              {allFilteredSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
              {allFilteredSelected ? "إلغاء الكل" : "تحديد الكل"}
            </button>
            {selected.size > 0 && (
              <button type="button" onClick={() => void delSelected()} disabled={saving} className="text-xs px-2 py-1 rounded bg-destructive/15 text-destructive border border-destructive/30">
                حذف المحدد ({selected.size})
              </button>
            )}
          </div>
        </div>
        <div className="max-h-[500px] overflow-y-auto space-y-1">
          {filtered.map((s) => {
            const h = halaqat.find((x) => x.id === s.halaqaId);
            const isSel = selected.has(s.id);
            return (
              <div key={s.id} className={`flex items-center justify-between p-2 rounded-lg hover:bg-secondary/50 ${isSel ? "bg-primary/10" : ""}`}>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <button type="button" onClick={() => toggleOne(s.id)} className="shrink-0 text-muted-foreground">
                    {isSel ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                  </button>
                  <div className="text-sm min-w-0">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-xs text-muted-foreground mr-2 truncate">
                      · {h?.name} · {s.instituteLevel || "—"} · مرحلة {s.phaseNumber ?? s.level}
                      · {s.levelType === "gold" ? "ذهبي" : "فضي"}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => void printOneCard(s)}
                    disabled={printing}
                    className="p-1.5 rounded hover:bg-primary/15 text-primary"
                    title="طباعة بطاقة QR"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => startEdit(s)} className="p-1.5 rounded hover:bg-primary/15 text-primary" title="تعديل">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => void delOne(s.id)} className="p-1.5 rounded hover:bg-destructive/20 text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function StudentsAdminPanel() {
  return (
    <div className="space-y-8">
      <StudentImportPanel />
      <StudentsManagementPanel />
    </div>
  );
}
