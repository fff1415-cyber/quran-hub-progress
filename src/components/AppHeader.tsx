import { Link } from "@tanstack/react-router";
import { BookOpen, LogOut } from "lucide-react";

export function AppHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="border-b border-primary/10 backdrop-blur-sm sticky top-0 z-40 bg-background/80">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl gold-gradient flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <div className="display text-lg font-bold gold-text">مجمع الشتيوي</div>
            {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
          </div>
        </Link>
        <div className="flex items-center gap-3">
          <div className="hidden md:block text-sm text-muted-foreground">{title}</div>
          <Link
            to="/"
            onClick={() => { sessionStorage.clear(); }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-primary/50 text-sm"
          >
            <LogOut className="w-4 h-4" />
            خروج
          </Link>
        </div>
      </div>
    </header>
  );
}
