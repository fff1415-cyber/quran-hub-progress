import { SemesterEditForm } from "@/components/SemesterEditForm";
import { SemesterSetupForm } from "@/components/SemesterSetupForm";
import { ManagerBrandingPanel } from "@/components/role-workspace/ManagerBrandingPanel";
import { ManagerSettingsPanel } from "@/components/role-workspace/ManagerSettingsPanel";
import { ManagerStudentPortalPanel } from "@/components/role-workspace/ManagerStudentPortalPanel";
import { ManagerSubTabs } from "@/components/role-workspace/ManagerSubTabs";
import { CalendarDays, MessageSquare, Palette, GraduationCap } from "lucide-react";

type Props = {
  section: string;
  onSectionChange: (id: string) => void;
};

export function ManagerGeneralSettingsPanel({ section, onSectionChange }: Props) {
  const tabs = [
    {
      id: "branding",
      label: "هوية المجمع",
      icon: Palette,
      content: <ManagerBrandingPanel />,
    },
    {
      id: "semesters",
      label: "الفصول",
      icon: CalendarDays,
      content: (
        <div className="space-y-6">
          <div className="ring-2 ring-success/25 rounded-2xl">
            <SemesterEditForm />
          </div>
          <div className="ring-2 ring-primary/25 rounded-2xl">
            <SemesterSetupForm />
          </div>
        </div>
      ),
    },
    {
      id: "messages",
      label: "رسائل واتساب",
      icon: MessageSquare,
      content: <ManagerSettingsPanel />,
    },
    {
      id: "student-portal",
      label: "صفحة ولي الأمر",
      icon: GraduationCap,
      content: <ManagerStudentPortalPanel />,
    },
  ];

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground px-1">هوية المجمع، الفصول الدراسية، وقوالب الرسائل.</p>
      <ManagerSubTabs tabs={tabs} value={section} onValueChange={onSectionChange} />
    </div>
  );
}
