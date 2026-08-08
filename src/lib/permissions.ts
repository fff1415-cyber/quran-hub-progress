export const PERMISSIONS = [
  { key: "manage_students", label: "إدارة الطلاب (إضافة/تعديل/حذف)" },
  { key: "manage_halaqat", label: "إدارة الحلقات" },
  { key: "manage_users", label: "إدارة المستخدمين والصلاحيات" },
  { key: "import_sheets", label: "استيراد من Google Sheets" },
  { key: "view_attendance", label: "عرض الغياب والمتابعة" },
  { key: "edit_grades", label: "تعديل بنود الدرجات" },
  { key: "approve_sard", label: "الموافقة على إعادة السرد" },
  { key: "force_retry", label: "السماح بإعادة السرد فوراً (أقل من يومين)" },
  { key: "send_whatsapp", label: "إرسال رسائل واتساب لأولياء الأمور" },
  { key: "manage_plans", label: "إدارة الخطط التعليمية واستيراد Excel" },
  { key: "manage_finances", label: "إدارة المالية (إيرادات ومصروفات)" },
] as const;

export type PermissionKey = typeof PERMISSIONS[number]["key"];

// Default permission sets per role
export const DEFAULT_PERMS: Record<string, PermissionKey[]> = {
  manager: PERMISSIONS.map((p) => p.key),
  secretary: ["view_attendance", "send_whatsapp", "force_retry", "manage_students", "import_sheets", "manage_finances"],
  supervisor: ["view_attendance", "approve_sard", "force_retry", "manage_plans"],
  program_supervisor: ["view_attendance", "manage_plans"],
  musammi: [],
  teacher: [],
  assistant: [],
};

export function hasPerm(role: string | null, customPerms: string[] | null, perm: PermissionKey): boolean {
  if (role === "manager") return true; // manager has everything
  if (customPerms && customPerms.includes(perm)) return true;
  const defaults = DEFAULT_PERMS[role || ""] || [];
  return defaults.includes(perm);
}
