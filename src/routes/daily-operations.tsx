import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { DailyOperations } from "@/components/DailyOperations";
import { ClipboardList } from "lucide-react";
import { Toaster } from "sonner";

export const Route = createFileRoute("/daily-operations")({ component: DailyOperationsPage });

function DailyOperationsPage() {
  const name = typeof window !== "undefined" ? sessionStorage.getItem("qs_name") || "" : "";

  return (
    <div className="min-h-screen">
      <Toaster position="top-center" richColors />
      <AppHeader title="المتابعة اليومية" subtitle={name || "الإدارة"} />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="glass-card rounded-2xl p-6 mb-6 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl gold-gradient flex items-center justify-center">
            <ClipboardList className="w-7 h-7 text-primary-foreground" />
          </div>
          <div>
            <h1 className="display text-2xl gold-text">المتابعة اليومية</h1>
            <p className="text-sm text-muted-foreground">Daily Operations — غياب، إذن تأخر، وإدارة السرد في واجهة واحدة</p>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5 md:p-6">
          <DailyOperations />
        </div>
      </main>
    </div>
  );
}
