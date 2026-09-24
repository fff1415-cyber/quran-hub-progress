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
};

export function InboxItemActions({
  id,
  onDone,
  isLateEntry = false,
  showDismiss = true,
}: Props) {
  const [open, setOpen] = useState(false);

  const dismiss = () => {
    dismissNotification(id);
    onDone();
    toast.success("تم");
  };

  const remove = () => {
    deleteNotification(id);
    setOpen(false);
    onDone();
    toast.success("تم الحذف");
  };

  return (
    <div className="flex items-center gap-1 shrink-0">
      {showDismiss && (
        <button
          type="button"
          onClick={dismiss}
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
              onClick={remove}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
