import { createFileRoute } from "@tanstack/react-router";
import { TeacherPage, teacherSearchSchema } from "../teacher";

export const Route = createFileRoute("/$tenantSlug/teacher")({
  validateSearch: teacherSearchSchema,
  component: TeacherPage,
});
