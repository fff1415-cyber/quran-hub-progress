import { useState } from "react";
import {
  loadMessageTemplates, saveMessageTemplates,
  DEFAULT_MESSAGE_TEMPLATES, type MessageTemplateKey,
} from "@/lib/mock-data";
import { MessageSquare, Save, RotateCcw } from "lucide-react";
import { toast } from "sonner";

const TEMPLATE_LABELS: Record<MessageTemplateKey, { title: string; vars: string }> = {
  absence:   { title: "رسالة الغياب", vars: "{student} {halaqa}" },
  late:      { title: "رسالة التأخر / منح إذن الدخول", vars: "{student} {halaqa}" },
  sard_pass: { title: "رسالة اجتياز السرد", vars: "{student} {halaqa} {week} {percent}" },
  sard_fail: { title: "رسالة رسوب السرد", vars: "{student} {halaqa} {week} {percent}" },
};

export function ManagerSettingsPanel() {
  const [templates, setTemplates] = useState(() => loadMessageTemplates());

  const saveTpl = () => {
    try {
      saveMessageTemplates(templates);
      toast.success("تم حفظ الرسائل");
    } catch {
      toast.error("فشل حفظ الرسائل");
    }
  };

  const resetTpl = (k: MessageTemplateKey) => {
    setTemplates({ ...templates, [k]: DEFAULT_MESSAGE_TEMPLATES[k] });
  };

  return (
    <section className="glass-card rounded-2xl p-6">
      <h2 className="text-lg font-bold text-primary mb-2 flex items-center gap-2">
        <MessageSquare className="w-5 h-5" /> رسائل أولياء الأمور
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        المتغيرات: {"{student}"} · {"{halaqa}"} · {"{week}"} · {"{percent}"}
      </p>
      <div className="space-y-4">
        {(Object.keys(TEMPLATE_LABELS) as MessageTemplateKey[]).map((k) => (
          <div key={k} className="rounded-lg border border-border p-3 bg-secondary/30">
            <div className="flex items-center justify-between mb-2">
              <div className="font-bold text-sm">{TEMPLATE_LABELS[k].title}</div>
              <button type="button" onClick={() => resetTpl(k)} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
                <RotateCcw className="w-3 h-3" /> افتراضي
              </button>
            </div>
            <textarea
              value={templates[k]}
              onChange={(e) => setTemplates({ ...templates, [k]: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm"
            />
          </div>
        ))}
      </div>
      <button type="button" onClick={saveTpl} className="mt-4 px-4 py-2 rounded-lg gold-gradient text-primary-foreground font-bold flex items-center gap-2">
        <Save className="w-4 h-4" /> حفظ
      </button>
    </section>
  );
}
