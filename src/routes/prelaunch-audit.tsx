import { createFileRoute } from "@tanstack/react-router";
import { PrelaunchAuditPage } from "@/components/prelaunch/PrelaunchAuditPage";

/** Temporary pre-launch QA route — remove after launch sweep. */
export const Route = createFileRoute("/prelaunch-audit")({
  component: PrelaunchAuditPage,
});
