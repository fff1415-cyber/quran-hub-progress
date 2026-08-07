import { createFileRoute } from "@tanstack/react-router";
import { SecretaryPage, secretaryValidateSearch } from "../secretary";

export const Route = createFileRoute("/$tenantSlug/secretary")({
  validateSearch: secretaryValidateSearch,
  component: SecretaryPage,
});
