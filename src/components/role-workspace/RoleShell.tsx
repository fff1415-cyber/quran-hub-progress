import type { ElementType, ReactNode } from "react";
import type { PermissionKey } from "@/lib/permissions";
import { hasPerm } from "@/lib/permissions";
import { getSessionRole } from "@/lib/session-role";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function TabBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Badge variant="default" className="mr-1.5 h-5 min-w-5 justify-center px-1.5 text-[10px]">
      {count}
    </Badge>
  );
}

export interface RoleTab {
  id: string;
  label: string;
  icon: ElementType;
  /** If set, tab is shown only when role has this permission. Manager always sees all. */
  perm?: PermissionKey;
  /** If set, tab is shown only for these roles (in addition to perm check). */
  roles?: string[];
  badge?: number;
  content: ReactNode;
}

export function filterTabsForRole(tabs: RoleTab[], role: string): RoleTab[] {
  return tabs.filter((t) => {
    if (t.roles && t.roles.length > 0 && !t.roles.includes(role) && role !== "manager") {
      return false;
    }
    if (t.perm && !hasPerm(role, null, t.perm)) return false;
    if (!t.perm && t.roles && t.roles.length > 0 && role !== "manager") {
      return t.roles.includes(role);
    }
    return true;
  });
}

interface RoleShellProps {
  tabs: RoleTab[];
  defaultTab?: string;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  header?: ReactNode;
  className?: string;
}

export function RoleShell({
  tabs,
  defaultTab,
  activeTab,
  onTabChange,
  header,
  className = "max-w-5xl",
}: RoleShellProps) {
  const role = getSessionRole();
  const visible = filterTabsForRole(tabs, role);
  const first = visible[0]?.id ?? "";
  const value = activeTab && visible.some((t) => t.id === activeTab) ? activeTab : (defaultTab && visible.some((t) => t.id === defaultTab) ? defaultTab : first);

  if (visible.length === 0) {
    return (
      <div className={className}>
        {header}
        <p className="text-center text-muted-foreground py-12">لا توجد أقسام متاحة لصلاحياتك.</p>
      </div>
    );
  }

  return (
    <div className={className}>
      {header}
      <Tabs value={value} onValueChange={onTabChange} dir="rtl">
        <TabsList className="w-full h-auto flex flex-wrap gap-1 p-1.5 bg-secondary/50 border border-border rounded-xl mb-6">
          {visible.map((t) => {
            const Icon = t.icon;
            return (
              <TabsTrigger
                key={t.id}
                value={t.id}
                className="flex-1 min-w-[120px] gap-1.5 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{t.label}</span>
                <TabBadge count={t.badge ?? 0} />
              </TabsTrigger>
            );
          })}
        </TabsList>
        {visible.map((t) => (
          <TabsContent key={t.id} value={t.id} className="space-y-6 mt-0">
            {t.content}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

interface RolePageHeaderProps {
  icon: ElementType;
  title: string;
  description: string;
  extra?: ReactNode;
}

export function RolePageHeader({ icon: Icon, title, description, extra }: RolePageHeaderProps) {
  return (
    <div className="glass-card rounded-2xl p-6 mb-6 flex items-center gap-4">
      <div className="w-14 h-14 rounded-2xl gold-gradient flex items-center justify-center shrink-0">
        <Icon className="w-7 h-7 text-primary-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <h1 className="display text-2xl gold-text">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
        {extra}
      </div>
    </div>
  );
}
