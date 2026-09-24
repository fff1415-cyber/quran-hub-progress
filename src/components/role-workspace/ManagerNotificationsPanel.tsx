import { useCallback, useState } from "react";
import { loadGeneralNotificationsForManager } from "@/lib/mock-data";
import { InboxItemActions } from "@/components/role-workspace/InboxItemActions";
import { useInboxRefresh } from "@/hooks/use-inbox-refresh";
import { Send } from "lucide-react";

export function ManagerNotificationsPanel() {
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  useInboxRefresh(reload);

  const items = loadGeneralNotificationsForManager();

  return (
    <div className="glass-card rounded-2xl p-6">
      <h2 className="text-lg font-bold mb-2 text-primary">إشعارات تحتاج إجراء</h2>
      <p className="text-xs text-muted-foreground mb-4">
        للغياب والسرد والمتابعة — تحويلات المعلمين في تبويب «بانتظار الإجراء». إذن الدخول يُسجَّل في النظام منفصلاً.
      </p>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-center py-8 text-sm">لا توجد إشعارات معلّقة</p>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <div key={n.id} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
              <Send className="w-4 h-4 text-primary mt-1 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm">{n.message}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {new Date(n.createdAt).toLocaleString("ar-SA")}
                </div>
              </div>
              <InboxItemActions
                id={n.id}
                onDone={reload}
                isLateEntry={n.type === "late"}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
