import { createFileRoute } from "@tanstack/react-router";
import { ProgramSupervisorPage, programSupervisorValidateSearch } from "../program-supervisor";

export const Route = createFileRoute("/$tenantSlug/program-supervisor")({
  validateSearch: programSupervisorValidateSearch,
  component: ProgramSupervisorPage,
});
