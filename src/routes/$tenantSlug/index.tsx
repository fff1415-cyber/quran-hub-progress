import { createFileRoute } from "@tanstack/react-router";
import { TenantLoginPage } from "@/components/auth/TenantLoginPage";

export const Route = createFileRoute("/$tenantSlug/")({
  component: TenantLoginPage,
});
