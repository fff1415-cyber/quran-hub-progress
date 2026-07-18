import { Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, LogOut, Menu, Shield, Crown, Users, BookOpen, Mic, Eye, GraduationCap, LayoutDashboard, Home, ClipboardList } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import logo from "@/assets/shtaiwi-logo.png.asset.json";

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  roles: string[]; // empty = all
}

const NAV: NavItem[] = [
  { to: "/", label: "الرئيسية", icon: Home, roles: [] },
  { to: "/manager", label: "لوحة المدير", icon: Crown, roles: ["manager"] },
  { to: "/admin", label: "لوحة الإدارة", icon: Shield, roles: ["manager"] },
  { to: "/daily-operations", label: "المتابعة اليومية", icon: ClipboardList, roles: ["manager", "secretary"] },
  { to: "/dashboard", label: "لوحة التحكم", icon: LayoutDashboard, roles: ["manager"] },
  { to: "/supervisor", label: "الإشراف التعليمي", icon: Eye, roles: ["manager", "supervisor"] },
  { to: "/secretary", label: "السكرتارية", icon: Users, roles: ["manager", "secretary"] },
  { to: "/musammi", label: "المسمّع", icon: Mic, roles: ["manager", "musammi"] },
  { to: "/teacher", label: "حلقتي", icon: BookOpen, roles: ["manager", "teacher", "assistant"] },
  { to: "/student", label: "صفحة الطالب", icon: GraduationCap, roles: ["student"] },
];

export function AppHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const role = typeof window !== "undefined" ? sessionStorage.getItem("qs_role") || "" : "";
  const name = typeof window !== "undefined" ? sessionStorage.getItem("qs_name") || "" : "";

  const items = NAV.filter((n) => n.roles.length === 0 || n.roles.includes(role));

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
    } else {
      router.navigate({ to: "/" });
    }
  };

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
            <SheetContent side="right" className="w-[280px] bg-background border-l border-primary/15">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-3">
                  <img src={logo.url} alt="شعار المجمع" className="w-12 h-12 object-contain" />
                  <div className="text-right">
                    <div className="display gold-text text-base font-bold">مجمع الشتيوي</div>
                    {name && <div className="text-xs text-muted-foreground font-normal">{name}</div>}
                  </div>
                </SheetTitle>
              </SheetHeader>
              <nav className="mt-6 space-y-1">
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-primary/10 hover:text-primary border border-transparent hover:border-primary/30"
                    >
                      <Icon className="w-4 h-4 text-primary" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
                <Link
                  to="/"
                  onClick={() => { sessionStorage.clear(); setOpen(false); }}
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

        <Link to="/" className="flex items-center gap-2 sm:gap-3 group flex-1 justify-center sm:justify-start">
          <img src={logo.url} alt="شعار المجمع" className="w-10 h-10 sm:w-11 sm:h-11 object-contain" />
          <div className="text-right">
            <div className="display text-base sm:text-lg font-bold gold-text leading-tight">مجمع الشتيوي</div>
            {subtitle && <div className="text-[11px] text-muted-foreground leading-tight">{subtitle}</div>}
          </div>
        </Link>

        <div className="hidden md:block text-sm text-muted-foreground truncate max-w-[40%]">{title}</div>
      </div>
    </header>
  );
}
