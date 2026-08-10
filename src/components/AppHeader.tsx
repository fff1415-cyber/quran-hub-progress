import { Link, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowRight, LogOut, Menu, Crown, Users, BookOpen, Mic, Eye, GraduationCap,
  Home, ClipboardList, ChevronDown, Sparkles,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { getSessionName, getSessionRole } from "@/lib/session-role";
import { getSessionHalaqaId, getTokenHalaqaId } from "@/lib/teacher-halaqa-access";
import { clearPortalSession } from "@/lib/student-portal-auth";
import { teardownPushOnLogout } from "@/lib/push-notifications";
import { loadHalaqat } from "@/lib/mock-data";
import { useTenant } from "@/contexts/TenantContext";
import { tenantPath } from "@/lib/tenant";
import { TenantLogo } from "@/components/TenantLogo";

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  roles: string[];
  search?: Record<string, unknown>;
}

const NAV: NavItem[] = [
  { to: "/", label: "الرئيسية", icon: Home, roles: [] },
  { to: "/manager", label: "لوحة المدير", icon: Crown, roles: ["manager"], search: { tab: "inbox" } },
  { to: "/secretary", label: "السكرتارية", icon: Users, roles: ["secretary"] },
  { to: "/supervisor", label: "الإشراف التعليمي", icon: Eye, roles: ["supervisor"] },
  { to: "/program-supervisor", label: "البرنامج التربوي", icon: Sparkles, roles: ["program_supervisor"] },
  { to: "/musammi", label: "المسمّع", icon: Mic, roles: ["musammi"] },
  { to: "/teacher", label: "حلقتي", icon: BookOpen, roles: ["teacher", "assistant"] },
  { to: "/student", label: "لوحة أداء المجمع", icon: GraduationCap, roles: ["student", "teacher", "assistant", "supervisor", "musammi", "secretary", "manager", "program_supervisor"] },
];

/** Manager-only shortcuts to other role dashboards. */
const MANAGER_CROSS_LINKS: NavItem[] = [
  { to: "/secretary", label: "لوحة السكرتير", icon: ClipboardList, roles: ["manager"] },
  { to: "/supervisor", label: "لوحة المشرف التعليمي", icon: Eye, roles: ["manager"] },
  { to: "/program-supervisor", label: "لوحة مشرف البرامج", icon: Sparkles, roles: ["manager"] },
  { to: "/musammi", label: "لوحة المسمّع", icon: Mic, roles: ["manager"] },
];

export function AppHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const router = useRouter();
  const { brandName, logoUrl } = useTenant();
  const [open, setOpen] = useState(false);
  const [halaqatOpen, setHalaqatOpen] = useState(false);
  const role = getSessionRole();
  const name = getSessionName();
  const isManager = role === "manager";

  const items = NAV.filter((n) => n.roles.length === 0 || n.roles.includes(role));
  const halaqat = useMemo(() => (isManager ? loadHalaqat() : []), [isManager, open]);
  const teacherHalaqaSearch = useMemo(() => {
    const id = getSessionHalaqaId() ?? getTokenHalaqaId();
    return id ? { h: id } : undefined;
  }, [open]);

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
    } else {
      router.navigate({ to: tenantPath("/") });
    }
  };

  const navLinkClass =
    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-primary/10 hover:text-primary border border-transparent hover:border-primary/30";

  return (
    <header className="border-b border-primary/15 backdrop-blur-sm sticky top-0 z-40 bg-background/85">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button aria-label="القائمة" className="p-2 rounded-lg hover:bg-primary/10 border border-transparent hover:border-primary/30">
                <Menu className="w-5 h-5 text-primary" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] bg-background border-l border-primary/15 overflow-y-auto">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-3">
                  <TenantLogo
                    logoUrl={logoUrl}
                    brandName={brandName}
                    imgClassName="w-12 h-12 object-contain"
                    placeholderClassName="w-12 h-12"
                  />
                  <div className="text-right">
                    <div className="display gold-text text-base font-bold">{brandName}</div>
                    {name && <div className="text-xs text-muted-foreground font-normal">{name}</div>}
                  </div>
                </SheetTitle>
              </SheetHeader>
              <nav className="mt-6 space-y-1">
                {items.map((item) => {
                  const Icon = item.icon;
                  const search = item.to === "/teacher" ? teacherHalaqaSearch : item.search;
                  return (
                    <Link
                      key={item.to}
                      to={tenantPath(item.to)}
                      search={search}
                      onClick={() => setOpen(false)}
                      className={navLinkClass}
                    >
                      <Icon className="w-4 h-4 text-primary shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}

                {isManager && (
                  <>
                    <div className="pt-4 pb-1 px-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
                      واجهات الإدارة
                    </div>
                    {MANAGER_CROSS_LINKS.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={`mgr-${item.to}`}
                          to={tenantPath(item.to)}
                          onClick={() => setOpen(false)}
                          className={navLinkClass}
                        >
                          <Icon className="w-4 h-4 text-primary shrink-0" />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}

                    <Collapsible open={halaqatOpen} onOpenChange={setHalaqatOpen} className="pt-2">
                      <CollapsibleTrigger className={cn(navLinkClass, "w-full justify-between")}>
                        <span className="flex items-center gap-3">
                          <BookOpen className="w-4 h-4 text-primary shrink-0" />
                          إدارة الحلقات
                        </span>
                        <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", halaqatOpen && "rotate-180")} />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mr-3 mt-1 space-y-0.5 border-r-2 border-primary/15 pr-2">
                        {halaqat.map((hl) => (
                          <Link
                            key={`halaqa-${hl.id}`}
                            to={tenantPath("/teacher")}
                            search={{ h: hl.id }}
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-primary/10 hover:text-primary truncate"
                          >
                            {hl.name}
                          </Link>
                        ))}
                      </CollapsibleContent>
                    </Collapsible>
                  </>
                )}

                <Link
                  to={tenantPath("/")}
                  onClick={() => {
                    void teardownPushOnLogout();
                    clearPortalSession();
                    setOpen(false);
                  }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-destructive/15 text-destructive border border-transparent hover:border-destructive/30 mt-4"
                >
                  <LogOut className="w-4 h-4" />
                  <span>تسجيل الخروج</span>
                </Link>
              </nav>
            </SheetContent>
          </Sheet>

          <button
            onClick={goBack}
            aria-label="رجوع"
            className="p-2 rounded-lg hover:bg-primary/10 border border-transparent hover:border-primary/30"
          >
            <ArrowRight className="w-5 h-5 text-primary" />
          </button>
        </div>

        <Link to={tenantPath("/")} className="flex items-center gap-2 sm:gap-3 group flex-1 justify-center sm:justify-start">
          <TenantLogo
            logoUrl={logoUrl}
            brandName={brandName}
            imgClassName="w-10 h-10 sm:w-11 sm:h-11 object-contain"
            placeholderClassName="w-10 h-10 sm:w-11 sm:h-11"
          />
          <div className="text-right">
            <div className="display text-base sm:text-lg font-bold gold-text leading-tight">{brandName}</div>
            {subtitle && <div className="text-[11px] text-muted-foreground leading-tight">{subtitle}</div>}
          </div>
        </Link>

        <div className="hidden md:block text-sm text-muted-foreground truncate max-w-[40%]">{title}</div>
      </div>
    </header>
  );
}
