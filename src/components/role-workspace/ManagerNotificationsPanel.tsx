import { useState } from "react";
import { loadNotifications, dismissNotification } from "@/lib/mock-data";
import { Send, Check } from "lucide-react";
import { toast } from "sonner";

export function ManagerNotificationsPanel() {
  const [notifications, setNotifications] = useState(() => loadNotifications());
  const unread = notifications.filter((n) => !n.read);

  const resolveNotif = (id: string) => {
    dismissNotification(id);
    setNotifications(loadNotifications());
    toast.success("تم");
  };

  return (
    <div className="glass-card rounded-2xl p-6">
      <h2 className="text-lg font-bold mb-2 text-primary">إشعارات تحتاج إجراء</h2>
      <p className="text-xs text-muted-foreground mb-4">
        للغياب والسرد والمتابعة اليومية — راجع لوحة السكرتير أو المشرف العلمي.
      </p>
      {unread.length === 0 ? (
        <p className="text-muted-foreground text-center py-8 text-sm">لا توجد إشعارات معلّقة</p>
      ) : (
        <div className="space-y-2">
          {unread.map((n) => (
            <div key={n.id} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
              <Send className="w-4 h-4 text-primary mt-1 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm">{n.message}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {new Date(n.createdAt).toLocaleString("ar")}
                </div>
              </div>
              <button
                type="button"
                onClick={() => resolveNotif(n.id)}
                className="p-2 rounded-lg bg-success/15 text-success border border-success/30 shrink-0"
                aria-label="تم"
              >
                <Check className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
