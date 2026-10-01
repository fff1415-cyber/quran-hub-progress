import { createFileRoute } from "@tanstack/react-router";
import { TestCommitteePage } from "../test-committee";

export const Route = createFileRoute("/$tenantSlug/test-committee")({
  component: TestCommitteePage,
});
