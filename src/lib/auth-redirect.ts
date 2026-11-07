import { patchSearchHref } from "@/lib/navigation-href";
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
    navigate({ href: patchSearchHref({ s: studentId }, { pathname: tenantPath("/student"), search: "", hash: "" }) });
    return true;
  }

  const halaqaId =
    Number(getAuthItem("qs_halaqa") ?? 0) ||
    decodeAuthTokenPayload()?.halaqaId ||
    0;

  switch (role) {
    case "manager":
      navigate({ href: tenantPath("/manager") });
      break;
    case "secretary":
      navigate({ href: patchSearchHref({ tab: "daily", section: "attendance" }, { pathname: tenantPath("/secretary"), search: "", hash: "" }) });
      break;
    case "supervisor":
      navigate({ href: patchSearchHref({ tab: "sard", section: "sard" }, { pathname: tenantPath("/supervisor"), search: "", hash: "" }) });
      break;
    case "program_supervisor":
      navigate({ href: tenantPath("/program-supervisor") });
      break;
    case "test_member":
    case "test_chair":
      navigate({ href: tenantPath("/test-committee") });
      break;
    case "musammi":
      navigate({ href: tenantPath("/musammi") });
      break;
    case "teacher":
    case "assistant":
      if (!halaqaId) return false;
      navigate({ href: patchSearchHref({ h: halaqaId }, { pathname: tenantPath("/teacher"), search: "", hash: "" }) });
      break;
    default:
      return false;
  }
  return true;
}
