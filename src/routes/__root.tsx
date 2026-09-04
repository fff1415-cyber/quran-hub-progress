import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  redirect,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { isApexBareTenantAppPath, PLATFORM_BRAND, apexDomain } from "@/lib/tenant";
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

const PLATFORM_OG_IMAGE = `https://${apexDomain()}/shtaiwi-logo.png`;

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
      { title: `${PLATFORM_BRAND.name} — ${PLATFORM_BRAND.subtitle}` },
      { name: "description", content: PLATFORM_BRAND.subtitle },
      { property: "og:title", content: PLATFORM_BRAND.name },
      { name: "twitter:title", content: PLATFORM_BRAND.name },
      { property: "og:description", content: PLATFORM_BRAND.subtitle },
      { name: "twitter:description", content: PLATFORM_BRAND.subtitle },
      { property: "og:image", content: PLATFORM_OG_IMAGE },
      { name: "twitter:image", content: PLATFORM_OG_IMAGE },
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
