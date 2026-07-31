import type { ElementType, ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TabBadge } from "@/components/role-workspace/RoleShell";

export type ManagerSubTab = {
  id: string;
  label: string;
  icon?: ElementType;
  badge?: number;
  content: ReactNode;
};

type Props = {
  tabs: ManagerSubTab[];
  value: string;
  onValueChange: (id: string) => void;
  className?: string;
};

export function ManagerSubTabs({ tabs, value, onValueChange, className }: Props) {
  const active = tabs.some((t) => t.id === value) ? value : tabs[0]?.id ?? "";

  return (
    <Tabs value={active} onValueChange={onValueChange} dir="rtl" className={className}>
      <TabsList className="w-full h-auto flex flex-wrap gap-1 p-1 mb-4 bg-secondary/40 border border-border/60 rounded-lg">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <TabsTrigger
              key={t.id}
              value={t.id}
              className="flex-1 min-w-[100px] gap-1.5 py-2 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
              <span className="truncate">{t.label}</span>
              <TabBadge count={t.badge ?? 0} />
            </TabsTrigger>
          );
        })}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.id} value={t.id} className="mt-0">
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
