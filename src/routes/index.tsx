import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { PlatformHomePage } from "@/components/platform/PlatformHomePage";
import { TenantLoginPage } from "@/components/auth/TenantLoginPage";
import { useTenant } from "@/contexts/TenantContext";

export const Route = createFileRoute("/")({ component: HomePage });

function HomePage() {
  const { isPlatform, loading } = useTenant();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-muted-foreground text-sm">جاري التحميل...</p>
      </div>
    );
  }

  if (isPlatform) {
    return <PlatformHomePage />;
  }

  return <TenantLoginPage />;
}
