import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { isReservedApexPathSegment, isValidTenantSlug } from "@/lib/tenant";

export const Route = createFileRoute("/$tenantSlug")({
  beforeLoad: ({ params }) => {
    const slug = params.tenantSlug.toLowerCase();
    if (!isValidTenantSlug(slug) || isReservedApexPathSegment(slug)) {
      throw redirect({ to: "/" });
    }
  },
  component: TenantSlugLayout,
});

function TenantSlugLayout() {
  return <Outlet />;
}
