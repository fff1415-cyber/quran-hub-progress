import { useState } from "react";
import { Check, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { dismissNotification, deleteNotification } from "@/lib/mock-data";
import { toast } from "sonner";

type Props = {
  id: string;
  onDone: () => void;
  /** إذن الدخول — يُؤكَّد الحذف مع تنبيه إضافي */
  isLateEntry?: boolean;
  showDismiss?: boolean;
  onDismiss?: () => Promise<void>;
  onRemove?: () => Promise<void>;
};

export function InboxItemActions({
  id,
  onDone,
  isLateEntry = false,
  showDismiss = true,
  onDismiss,
  onRemove,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const dismiss = async () => {
    setBusy(true);
    try {
      if (onDismiss) await onDismiss();
      else dismissNotification(id);
      onDone();
      toast.success("تم");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر تحديث الإشعار");
    } finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true);
    try {
      if (onRemove) await onRemove();
      else deleteNotification(id);
      setOpen(false);
      onDone();
      toast.success("تم الحذف");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر حذف الإشعار");
    } finally { setBusy(false); }
  };

  return (
    <div className="flex items-center gap-1 shrink-0">
      {showDismiss && (
        <button
          type="button"
          onClick={dismiss}
          disabled={busy}
          className="p-2 rounded-lg bg-success/15 text-success border border-success/30"
          aria-label="تم"
          title="تم — إخفاء"
        >
          <Check className="w-4 h-4" />
        </button>
      )}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <button
            type="button"
            className="p-2 rounded-lg bg-destructive/10 text-destructive border border-destructive/30"
            aria-label="حذف"
            disabled={busy}
            title="حذف نهائي"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف هذا السجل؟</AlertDialogTitle>
            <AlertDialogDescription>
              {isLateEntry
                ? "سيُحذف الإشعار من القائمة. سجل إذن الدخول في النظام يبقى كما هو."
                : "سيُحذف نهائياً من هذا الجهاز ولا يمكن التراجع."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void remove()}
              disabled={busy}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
