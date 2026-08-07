import { createFileRoute } from "@tanstack/react-router";
import { MusammiPage } from "../musammi";

export const Route = createFileRoute("/$tenantSlug/musammi")({
  component: MusammiPage,
});
