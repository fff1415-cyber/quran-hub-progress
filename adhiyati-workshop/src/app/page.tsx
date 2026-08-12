"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import FixedQRCode from "@/components/FixedQRCode";
import ZadLogo from "@/components/ZadLogo";
import { WORKSHOP_TITLE, WORKSHOP_YEAR } from "@/lib/content/presentation";

export default function HomePage() {
  const [appUrl, setAppUrl] = useState("");

  useEffect(() => {
    setAppUrl(window.location.origin);
  }, []);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-primary via-primary to-secondary px-6">
      {appUrl && <FixedQRCode url={appUrl} label="امسح للانضمام للورشة" />}

      <div className="flex max-w-lg flex-col items-center gap-8 text-center text-white">
        <ZadLogo variant="white" width={200} height={80} />

        <div>
          <h1 className="text-4xl font-extrabold md:text-5xl">{WORKSHOP_TITLE}</h1>
          <p className="mt-2 text-2xl text-white/90">لعام {WORKSHOP_YEAR}هـ</p>
        </div>

        <p className="text-lg text-white/80">
          مرحباً بكم في ورشة تطوير مشروع أضحيتي. اختر دورك للمتابعة.
        </p>

        <div className="flex w-full flex-col gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/participant"
            className="rounded-2xl bg-white px-8 py-4 text-lg font-bold text-primary shadow-lg transition hover:bg-white/90"
          >
            مشارك في الورشة
          </Link>
          <Link
            href="/voting"
            className="rounded-2xl border-2 border-white px-8 py-4 text-lg font-bold text-white transition hover:bg-white/10"
          >
            التصويت العام
          </Link>
        </div>

        <div className="mt-4 flex gap-4 text-sm text-white/60">
          <Link href="/presentation" className="hover:text-white">
            العرض التقديمي
          </Link>
          <span>•</span>
          <Link href="/dashboard" className="hover:text-white">
            لوحة التحكم
          </Link>
        </div>
      </div>
    </div>
  );
}
