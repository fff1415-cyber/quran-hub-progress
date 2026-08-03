import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSessionRole } from "@/lib/session-role";

export const Route = createFileRoute("/daily-operations")({
  beforeLoad: () => {
    const role = getSessionRole();
    if (role === "secretary") {
      throw redirect({ to: "/secretary", search: { tab: "daily", section: "attendance" } });
    }
    throw redirect({ to: "/secretary", search: { tab: "daily", section: "attendance" } });
  },
});
