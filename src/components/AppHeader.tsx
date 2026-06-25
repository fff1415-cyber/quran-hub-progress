import React from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useAuth } from '../integrations/supabase'; // مسار افتراضي لإدارة الجلسة في مشروعك
import { Button } from './ui/button';
import { LogOut, User, Menu } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';

export const AppHeader: React.FC = () => {
  const navigate = useNavigate();
  // يمكنك تفعيل سطر useAuth إذا كنت تستخدم نظام تسجيل الدخول عبر السقيفة العلوية
  // const { session, signOut } = useAuth(); 

  // الرابط المباشر الجديد والواضح للشعار
  const logoUrl = "https://i.postimg.cc/1tT7gNZz/Whats-App-Image-2026-02-02-at-1-09-00-PM.png";

  const handleLogout = async () => {
    // كود تسجيل الخروج الافتراضي للمنصة
    try {
      // await signOut();
      navigate({ to: '/login' });
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-4 mx-auto">
        
        {/* قسم الشعار واسم الموقع (الجانب الأيمن/الأيسر حسب اتجاه الموقع) */}
        <Link to="/" className="flex items-center gap-3 font-bold text-xl text-primary transition-opacity hover:opacity-90">
          <img 
            src={logoUrl} 
            alt="شعار مجمع القرآن الكريم" 
            className="h-11 w-auto object-contain max-w-[160px] transition-transform hover:scale-105" 
            onError={(e) => {
              (e.target as HTMLImageElement).src = "/placeholder.svg";
            }}
          />
          <span className="hidden md:inline-block font-bold text-base text-neutral-800 dark:text-neutral-200 tracking-tight font-serif">
            منصة حلقات القرآن الكريم
          </span>
        </Link>

        {/* أزرار التحكم والقوائم العلوية المحمية لمستخدمي النظام */}
        <div className="flex items-center gap-4">
          
          {/* قائمة تفاعلية للمستخدم (Dropdown Menu من مكونات shadcn/ui) */}
          <DropdownMenu dir="rtl">
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-full border bg-muted">
                <User className="h-5 w-5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 mt-1">
              <DropdownMenuItem onClick={() => navigate({ to: '/dashboard' })} className="cursor-pointer gap-2 justify-start text-right">
                <User className="h-4 w-4" />
                <span>لوحة التحكم</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout} className="cursor-pointer gap-2 justify-start text-destructive text-right">
                <LogOut className="h-4 w-4" />
                <span>تسجيل الخروج</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* زر استجابة إضافي للشاشات الصغيرة للموبايل */}
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="h-5 w-5" />
          </Button>

        </div>

      </div>
    </header>
  );
};
