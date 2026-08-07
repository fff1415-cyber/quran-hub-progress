import { createFileRoute } from "@tanstack/react-router";
import { PlatformAdminPage } from "@/components/platform-admin/PlatformAdminPage";

/** Platform super-admin — manage all complexes and login accounts (apex only). */
export const Route = createFileRoute("/platform-admin")({
  component: PlatformAdminPage,
});
