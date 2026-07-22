import { useMemo, useState } from "react";
import { loadStudents } from "@/lib/mock-data";
import { matchesStudentSearch } from "@/lib/student-profile-data";
import { StudentComprehensiveProfile } from "@/components/student-profile/StudentComprehensiveProfile";
import { Input } from "@/components/ui/input";
import { Search, Users, ArrowRight } from "lucide-react";

export function SecretaryStudentProfilesPanel() {
  const students = loadStudents();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(
    () => students.filter((s) => matchesStudentSearch(s, query)).sort((a, b) => a.name.localeCompare(b.name, "ar")),
    [students, query],
  );

  const selected = selectedId ? students.find((s) => s.id === selectedId) : null;

  if (selected) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="flex items-center gap-2 text-sm text-primary mb-4 hover:underline"
        >
          <ArrowRight className="w-4 h-4" /> العودة للبحث
        </button>
        <StudentComprehensiveProfile student={selected} />
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-6">
      <h2 className="text-lg font-bold text-primary mb-2 flex items-center gap-2">
        <Users className="w-5 h-5" /> ملفات الطلاب
      </h2>
      <p className="text-xs text-muted-foreground mb-4">ابحث بالاسم أو رقم الهوية ثم اختر الطالب لعرض ملفه الشامل</p>

      <div className="relative mb-4">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="بحث بالاسم أو الهوية..."
          className="pr-10"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-10 text-sm">لا يوجد طلاب مطابقون</p>
      ) : (
        <div className="space-y-1 max-h-[480px] overflow-y-auto">
          {filtered.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedId(s.id)}
              className="w-full text-right p-3 rounded-lg hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-colors"
            >
              <div className="font-bold">{s.name}</div>
              <div className="text-xs text-muted-foreground">مستوى {s.level}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
