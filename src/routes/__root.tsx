import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  redirect,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { isApexBareTenantAppPath } from "@/lib/tenant";
import { EvaluationSettingsProvider } from "@/contexts/EvaluationSettingsContext";
import { GradeInputSettingsProvider } from "@/contexts/GradeInputSettingsContext";
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
  beforeLoad: () => {
    if (typeof window !== "undefined" && isApexBareTenantAppPath(window.location.pathname)) {
      throw redirect({ to: "/" });
    }
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "msht.io — منصة إدارة مجمعات تحفيظ القرآن" },
      { name: "description", content: "منصة SaaS لإدارة مجمعات تحفيظ القرآن — تسجيل مجمع جديد أو الدخول إلى مجمعك" },
      { property: "og:title", content: "msht.io" },
      { name: "twitter:title", content: "msht.io" },
      { property: "og:description", content: "منصة إدارة مجمعات تحفيظ القرآن الكريم" },
      { name: "twitter:description", content: "منصة إدارة مجمعات تحفيظ القرآن الكريم" },
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
  return (
    <QueryClientProvider client={queryClient}>
      <TenantProvider>
        <EvaluationSettingsProvider>
          <GradeInputSettingsProvider>
            <Outlet />
          </GradeInputSettingsProvider>
        </EvaluationSettingsProvider>
      </TenantProvider>
    </QueryClientProvider>
  );
}
