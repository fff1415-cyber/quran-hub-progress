import type { NavigateOptions } from "@tanstack/react-router";
import { tenantPath } from "@/lib/tenant";
import { getAuthItem, decodeAuthTokenPayload } from "@/lib/auth-session";

type NavigateFn = (opts: NavigateOptions) => void;

/** Navigate to the dashboard matching the stored session role. */
export function navigateBySessionRole(navigate: NavigateFn): boolean {
  const role = getAuthItem("qs_role");
  if (!role) return false;

  if (role === "student") {
    const studentId = getAuthItem("qs_student");
    if (!studentId) return false;
    navigate({ to: tenantPath("/student"), search: { s: studentId } });
    return true;
  }

  const halaqaId =
    Number(getAuthItem("qs_halaqa") ?? 0) ||
    decodeAuthTokenPayload()?.halaqaId ||
    0;

  switch (role) {
    case "manager":
      navigate({ to: tenantPath("/manager") });
      break;
    case "secretary":
      navigate({ to: tenantPath("/secretary"), search: { tab: "daily", section: "attendance" } });
      break;
    case "supervisor":
      navigate({ to: tenantPath("/supervisor"), search: { tab: "sard", section: "sard" } });
      break;
    case "program_supervisor":
      navigate({ to: tenantPath("/program-supervisor") });
      break;
    case "musammi":
      navigate({ to: tenantPath("/musammi") });
      break;
    case "teacher":
    case "assistant":
      if (!halaqaId) return false;
      navigate({ to: tenantPath("/teacher"), search: { h: halaqaId } });
      break;
    default:
      return false;
  }
  return true;
}
