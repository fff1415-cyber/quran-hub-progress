import { useCallback, useEffect, useState } from "react";
import { MessageSquareText } from "lucide-react";
import { listParentRecommendations, type ParentRecommendation } from "@/lib/parent-recommendations";

export function ParentRecommendationsSection({ studentId }: { studentId: string }) {
  const [items, setItems] = useState<ParentRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(() => {
    setLoading(true);
    setError("");
    void listParentRecommendations(studentId)
      .then(setItems)
      .catch(() => setError("تعذّر تحميل التوصيات. حاول مرة أخرى."))
      .finally(() => setLoading(false));
  }, [studentId]);

  useEffect(() => {
    setItems([]);
    refresh();
  }, [studentId, refresh]);

  return (
    <section className="mt-4 p-4 rounded-xl bg-secondary/30 border border-border" aria-label="توصيات المعلم">
      <h4 className="text-base font-bold text-primary flex items-center gap-2 mb-3">
        <MessageSquareText className="w-4 h-4" /> توصيات المعلم لولي الأمر
      </h4>
      {loading ? (
        <p className="text-sm text-muted-foreground">جاري تحميل التوصيات...</p>
      ) : error ? (
        <div className="text-sm text-destructive">
          {error} <button type="button" onClick={refresh} className="underline">إعادة المحاولة</button>
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد توصيات حتى الآن.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <article key={item.id} className="bg-card border border-border rounded-lg p-3">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground mb-2">
                <span>المعلم: {item.teacherName}</span>
                <time dateTime={item.createdAt.replace(" ", "T")}>{item.createdAt}</time>
              </div>
              <p className="text-sm whitespace-pre-wrap break-words">{item.recommendation}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
