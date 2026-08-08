/**
 * Temporary pre-launch audit catalog — delete this file with the feature after launch QA.
 * Route: /prelaunch-audit
 */

export type PrelaunchAuditItem = {
  id: string;
  group: string;
  label: string;
  href: string;
  hint?: string;
};

function manager(tab: string, section: string) {
  return `/manager?tab=${tab}&section=${section}`;
}

function supervisor(tab: string, section: string) {
  return `/supervisor?tab=${tab}&section=${section}`;
}

function secretary(tab: string, section: string) {
  return `/secretary?tab=${tab}&section=${section}`;
}

/** All platform tools to sweep before launch. */
export const PRELAUNCH_AUDIT_CATALOG: PrelaunchAuditItem[] = [
  // المنصة
  { id: "platform-home", group: "المنصة", label: "الصفحة الرئيسية (msht.io)", href: "/", hint: "بحث عن مجمع" },
  { id: "platform-register", group: "المنصة", label: "تسجيل مجمع جديد", href: "/register" },
  { id: "tenant-login", group: "المنصة", label: "بوابة دخول المجمع", href: "/m1", hint: "مثال: msht.io/m101" },

  // المدير — صندوق العمل
  { id: "manager-inbox-transfers", group: "المدير", label: "صندوق العمل — التحويلات", href: manager("inbox", "transfers") },
  { id: "manager-inbox-notifications", group: "المدير", label: "صندوق العمل — الإشعارات", href: manager("inbox", "notifications") },

  // المدير — البيانات
  { id: "manager-data-import", group: "المدير", label: "البيانات — استيراد", href: manager("data", "import") },
  { id: "manager-data-halaqat", group: "المدير", label: "البيانات — الحلقات", href: manager("data", "halaqat") },
  { id: "manager-data-students", group: "المدير", label: "البيانات — الطلاب", href: manager("data", "students") },
  { id: "manager-data-codes", group: "المدير", label: "البيانات — أكواد الدخول", href: manager("data", "codes") },

  // المدير — العاملين
  { id: "manager-staff-monitor", group: "المدير", label: "العاملين — متابعة الحضور", href: manager("staff", "monitor") },

  // المدير — الدرجات والتقييم
  { id: "manager-grades-sard", group: "المدير", label: "الدرجات — درجات السرد", href: manager("grades", "sard") },
  { id: "manager-grades-items", group: "المدير", label: "الدرجات — بنود الدرجات", href: manager("grades", "items") },
  { id: "manager-grades-weekly", group: "المدير", label: "الدرجات — الاختبارات الأسبوعية", href: manager("grades", "weekly") },
  { id: "manager-grades-staff", group: "المدير", label: "الدرجات — حضور العاملين", href: manager("grades", "staff-settings") },

  // المدير — الإعدادات
  { id: "manager-settings-branding", group: "المدير", label: "الإعدادات — الهوية البصرية", href: manager("settings", "branding") },
  { id: "manager-settings-kiosk", group: "المدير", label: "الإعدادات — الكيوسك", href: manager("settings", "kiosk") },
  { id: "manager-settings-semesters", group: "المدير", label: "الإعدادات — الفصول الدراسية", href: manager("settings", "semesters") },
  { id: "manager-settings-messages", group: "المدير", label: "الإعدادات — الرسائل", href: manager("settings", "messages") },
  { id: "manager-settings-portal", group: "المدير", label: "الإعدادات — بوابة الطالب", href: manager("settings", "student-portal") },

  // المعلّم
  { id: "teacher-grades", group: "المعلّم", label: "جدول التحضير والدرجات", href: "/teacher?view=grades" },
  { id: "teacher-tests", group: "المعلّم", label: "الاختبارات الأسبوعية", href: "/teacher?view=tests" },
  { id: "teacher-programs", group: "المعلّم", label: "برامج الحلقة", href: "/teacher?view=programs" },
  { id: "teacher-tarbawi", group: "المعلّم", label: "البرنامج التربوي", href: "/teacher?view=tarbawi" },

  // المشرف التعليمي
  { id: "supervisor-sard", group: "المشرف التعليمي", label: "السرد — قائمة الانتظار", href: supervisor("sard", "sard") },
  { id: "supervisor-approvals", group: "المشرف التعليمي", label: "السرد — اعتمادات", href: supervisor("sard", "approvals") },
  { id: "supervisor-force-retry", group: "المشرف التعليمي", label: "السرد — إعادة إجبارية", href: supervisor("sard", "force-retry") },
  { id: "supervisor-passed", group: "المشرف التعليمي", label: "السرد — المجتازون", href: supervisor("sard", "passed") },
  { id: "supervisor-plans", group: "المشرف التعليمي", label: "الخطط — إدارة الخطط", href: supervisor("plans", "plans") },
  { id: "supervisor-plan-completed", group: "المشرف التعليمي", label: "الخطط — اكتمال الخطة", href: supervisor("plans", "plan-completed") },
  { id: "supervisor-halaqat", group: "المشرف التعليمي", label: "الإشراف — الحلقات", href: supervisor("oversight", "halaqat") },
  { id: "supervisor-halaqa-results", group: "المشرف التعليمي", label: "الإشراف — نتائج الحلقات", href: supervisor("oversight", "halaqa-results") },
  { id: "supervisor-weekly-tests", group: "المشرف التعليمي", label: "الإشراف — الاختبارات الأسبوعية", href: supervisor("oversight", "weekly-tests") },
  { id: "supervisor-transfers", group: "المشرف التعليمي", label: "الإشراف — التحويلات", href: supervisor("oversight", "transfers") },

  // السكرتير
  { id: "secretary-attendance", group: "السكرتير", label: "اليومي — الغياب والحضور", href: secretary("daily", "attendance") },
  { id: "secretary-transfers", group: "السكرتير", label: "اليومي — التحويلات", href: secretary("daily", "transfers") },
  { id: "secretary-late-permit", group: "السكرتير", label: "اليومي — تصريح تأخير", href: secretary("daily", "late-permit") },
  { id: "secretary-profiles", group: "السكرتير", label: "الطلاب — الملفات", href: secretary("students", "profiles") },
  { id: "secretary-students", group: "السكرتير", label: "الطلاب — قائمة الطلاب", href: secretary("students", "students") },
  { id: "secretary-import", group: "السكرتير", label: "الطلاب — استيراد", href: secretary("students", "import") },
  { id: "secretary-export", group: "السكرتير", label: "الطلاب — تصدير", href: secretary("students", "export") },
  { id: "secretary-reports-plans", group: "السكرتير", label: "التقارير — الخطط", href: secretary("reports", "plans") },
  { id: "secretary-reports-tests", group: "السكرتير", label: "التقارير — الاختبارات", href: secretary("reports", "weekly-tests") },
  { id: "secretary-reports-sard", group: "السكرتير", label: "التقارير — السرد", href: secretary("reports", "sard") },

  // مشرف البرامج
  { id: "program-supervisor-monitor", group: "مشرف البرامج", label: "متابعة الحلقات", href: "/program-supervisor?tab=monitor" },
  { id: "program-supervisor-approvals", group: "مشرف البرامج", label: "اعتماد الخطط التربوية", href: "/program-supervisor?tab=approvals" },
  { id: "program-supervisor-settings", group: "مشرف البرامج", label: "إعدادات البرنامج", href: "/program-supervisor?tab=settings" },

  // أدوار أخرى
  { id: "musammi", group: "المسمّع", label: "واجهة السرد والتقييم", href: "/musammi" },
  { id: "student-portal", group: "بوابة الطالب", label: "لوحة أداء المجمع", href: "/student", hint: "يتطلب دخول طالب أو معاينة كادر" },
  { id: "staff-attendance", group: "حضور العاملين", label: "تسجيل حضور المعلّم", href: "/staff-attendance" },
  { id: "kiosk", group: "الكيوسك", label: "شاشة الكيوسك", href: "/kiosk", hint: "يتطلب token من إعدادات الكيوسك" },

  // تحويلات legacy
  { id: "redirect-admin", group: "تحويلات", label: "/admin → المدير", href: "/admin", hint: "يجب أن يحوّل تلقائياً" },
  { id: "redirect-daily-ops", group: "تحويلات", label: "/daily-operations → السكرتير", href: "/daily-operations", hint: "يجب أن يحوّل تلقائياً" },
];

export const PRELAUNCH_SCORE_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "سيء جداً",
  2: "ضعيف",
  3: "مقبول",
  4: "جيد",
  5: "ممتاز",
};
