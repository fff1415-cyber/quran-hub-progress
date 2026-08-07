import { createFileRoute } from "@tanstack/react-router";
import { KioskPage, kioskValidateSearch } from "../kiosk";

export const Route = createFileRoute("/$tenantSlug/kiosk")({
  validateSearch: kioskValidateSearch,
  component: KioskPage,
});
