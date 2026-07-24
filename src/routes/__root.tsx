import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { syncFromCloud } from "@/lib/cloud-sync";
import { EvaluationSettingsProvider } from "@/contexts/EvaluationSettingsContext";
import { TenantProvider } from "@/contexts/TenantContext";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="glass-card max-w-md text-center p-10 rounded-2xl">
        <h1 className="text-7xl font-bold gold-text">٤٠٤</h1>
        <p className="mt-4 text-muted-foreground">الصفحة غير موجودة</p>
        <Link to="/" className="mt-6 inline-block px-6 py-2 rounded-lg gold-gradient text-primary-foreground font-bold">
          العودة للرئيسية
        </Link>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "مجمع حلقات الشتيوي" },
      { name: "description", content: "نظام إدارة مجمع حلقات الشتيوي" },
      { property: "og:title", content: "مجمع حلقات الشتيوي" },
      { name: "twitter:title", content: "مجمع حلقات الشتيوي" },
      { property: "og:description", content: "نظام إدارة مجمع حلقات الشتيوي" },
      { name: "twitter:description", content: "نظام إدارة مجمع حلقات الشتيوي" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/4c50ea6d-9216-4656-aac6-1061f61829f0/id-preview-b9794d4f--44d653ee-aa6b-4e50-9996-6690d5c2aaa9.lovable.app-1779613164736.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/4c50ea6d-9216-4656-aac6-1061f61829f0/id-preview-b9794d4f--44d653ee-aa6b-4e50-9996-6690d5c2aaa9.lovable.app-1779613164736.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/shtaiwi-logo.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => { void syncFromCloud(); }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <TenantProvider>
        <EvaluationSettingsProvider>
          <Outlet />
        </EvaluationSettingsProvider>
      </TenantProvider>
    </QueryClientProvider>
  );
}
