import { createFileRoute } from "@tanstack/react-router";
import { SupervisorPage, supervisorValidateSearch } from "../supervisor";

export const Route = createFileRoute("/$tenantSlug/supervisor")({
  validateSearch: supervisorValidateSearch,
  component: SupervisorPage,
});
