import { createFileRoute } from "@tanstack/react-router";
import { StudentPage, studentValidateSearch } from "../student";

export const Route = createFileRoute("/$tenantSlug/student")({
  validateSearch: studentValidateSearch,
  component: StudentPage,
});
