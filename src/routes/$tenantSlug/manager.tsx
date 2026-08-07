import { createFileRoute } from "@tanstack/react-router";
import { ManagerPage, managerValidateSearch } from "../manager";

export const Route = createFileRoute("/$tenantSlug/manager")({
  validateSearch: managerValidateSearch,
  component: ManagerPage,
});
