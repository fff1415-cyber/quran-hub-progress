import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, Clock, Loader2, Lock } from "lucide-react";
import {
  createKioskAudioContext,
  playKioskSound,
  unlockKioskAudio,
  type KioskAudioKind,
} from "@/lib/kiosk-audio";
import {
  formatCountdown,
  formatKioskClock,
  isKioskScanAllowed,
  kioskCheckIn,
  type KioskCheckInStatus,
  type KioskScanWindow,
} from "@/lib/kiosk-service";
import { KioskFeedback } from "@/components/kiosk/KioskFeedback";

const SCANNER_ID = "kiosk-qr-reader";
const COOLDOWN_MS = 2000;

type Props = {
  token: string;
  sessionReady: boolean;
  scanWindow: KioskScanWindow;
  windowFetchedAt: number;
  onActivateSession: () => Promise<void>;
  onRefreshWindow: () => Promise<void>;
};

function statusToSound(status: KioskCheckInStatus): KioskAudioKind {
  if (status === "success") {
    return "success";
  }
  if (status === "success_late") {
    return "warning";
  }
  if (status === "invalid_qr" || status === "error") {
    return "error";
  }
  return "warning";
}

function WindowStatusBanner({
  scanWindow,
  windowFetchedAt,
}: {
  scanWindow: KioskScanWindow;
  windowFetchedAt: number;
}) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  void tick;

  const elapsedSec = Math.floor((Date.now() - windowFetchedAt) / 1000);

  if (scanWindow.phase === "present") {
    const remaining = Math.max(0, scanWindow.secondsUntilPresentEnd - elapsedSec);
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-center space-y-1">
        <p className="text-sm font-semibold text-emerald-800">نافذة الحضور — يُسجّل حاضر</p>
        <p className="text-xs text-emerald-700/90">
          حتى {formatKioskClock(scanWindow.presentUntilAt)} — متبقٍ {formatCountdown(remaining)}
        </p>
      </div>
    );
  }

  if (scanWindow.phase === "late") {
    const remaining = Math.max(0, scanWindow.secondsUntilClose - elapsedSec);
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center space-y-1">
        <p className="text-sm font-semibold text-amber-900">نافذة التأخر — يُسجّل متأخر</p>
        <p className="text-xs text-amber-800/90">
          يُغلق {formatKioskClock(scanWindow.closeAt)} — متبقٍ {formatCountdown(remaining)}
        </p>
      </div>
    );
  }

  if (scanWindow.phase === "before") {
    const untilOpen = Math.max(0, scanWindow.secondsUntilOpen - elapsedSec);
    return (
      <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-center space-y-1">
        <p className="text-sm font-semibold text-sky-900 flex items-center justify-center gap-2">
          <Clock className="w-4 h-4" />
          لم يُفتح وقت التحضير بعد
        </p>
        <p className="text-xs text-sky-800/90">
          يفتح {formatKioskClock(scanWindow.openAt)} — حضور حتى {formatKioskClock(scanWindow.presentUntilAt)} — إغلاق {formatKioskClock(scanWindow.closeAt)}
        </p>
        <p className="text-xs font-medium text-sky-900">يفتح خلال {formatCountdown(untilOpen)}</p>
        <p className="text-xs text-muted-foreground">العصر {formatKioskClock(scanWindow.asrTime)} · {scanWindow.city}</p>
      </div>
    );
  }

  if (scanWindow.phase === "closed") {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-center space-y-1">
        <p className="text-sm font-semibold text-destructive flex items-center justify-center gap-2">
          <Lock className="w-4 h-4" />
          انتهى وقت التحضير الذاتي
        </p>
        <p className="text-xs text-destructive/90">
          أُغلق الساعة {formatKioskClock(scanWindow.closeAt)} (العصر + {scanWindow.closeMinutesAfterAsr} د)
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-900">
      {scanWindow.message || "تعذّر تحديد وقت التحضير"}
    </div>
  );
}

export function KioskScanner({
  token,
  sessionReady,
  scanWindow,
  windowFetchedAt,
  onActivateSession,
  onRefreshWindow,
}: Props) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const busyRef = useRef(false);
  const lastScanRef = useRef("");

  const scanAllowed = isKioskScanAllowed(scanWindow);

  const [starting, setStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    status: KioskCheckInStatus;
    message: string;
    studentName?: string;
  } | null>(null);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) {
      return;
    }
    try {
      await scanner.stop();
    } catch {
      /* already stopped */
    }
    scanner.clear();
  }, []);

  const showFeedback = useCallback(
    (status: KioskCheckInStatus, message: string, studentName?: string) => {
      setFeedback({ status, message, studentName });
      const ctx = audioRef.current;
      if (ctx) {
        playKioskSound(ctx, statusToSound(status));
      }
      window.setTimeout(() => setFeedback(null), COOLDOWN_MS);
    },
    [],
  );

  const handleDecoded = useCallback(
    async (decoded: string) => {
      if (!scanAllowed) {
        return;
      }
      const studentId = decoded.trim();
      if (!studentId || busyRef.current) {
        return;
      }
      if (lastScanRef.current === studentId) {
        return;
      }

      busyRef.current = true;
      lastScanRef.current = studentId;

      try {
        const result = await kioskCheckIn(token, studentId);
        showFeedback(result.status, result.message, result.studentName);
      } catch (e) {
        showFeedback("error", e instanceof Error ? e.message : "تعذّر تسجيل التحضير");
      } finally {
        window.setTimeout(() => {
          busyRef.current = false;
          lastScanRef.current = "";
        }, COOLDOWN_MS);
      }
    },
    [scanAllowed, showFeedback, token],
  );

  const startScanner = useCallback(async () => {
    if (!sessionReady || !scanAllowed || scannerRef.current) {
      return;
    }
    setStarting(true);
    setCameraError(null);
    try {
      const scanner = new Html5Qrcode(SCANNER_ID);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 280, height: 280 }, aspectRatio: 1 },
        (text) => {
          void handleDecoded(text);
        },
        () => {},
      );
    } catch (e) {
      setCameraError(e instanceof Error ? e.message : "تعذّر تشغيل الكاميرا");
      scannerRef.current = null;
    } finally {
      setStarting(false);
    }
  }, [handleDecoded, scanAllowed, sessionReady]);

  useEffect(() => {
    if (sessionReady && scanAllowed) {
      void startScanner();
    } else {
      void stopScanner();
    }
    return () => {
      void stopScanner();
    };
  }, [scanAllowed, sessionReady, startScanner, stopScanner]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void onRefreshWindow();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [onRefreshWindow]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - windowFetchedAt) / 1000);
      if (scanWindow.phase === "present" && scanWindow.secondsUntilPresentEnd - elapsed <= 0) {
        void onRefreshWindow();
      }
      if (scanWindow.phase === "late" && scanWindow.secondsUntilClose - elapsed <= 0) {
        void onRefreshWindow();
      }
      if (scanWindow.phase === "before" && scanWindow.secondsUntilOpen - elapsed <= 0) {
        void onRefreshWindow();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [onRefreshWindow, scanWindow, windowFetchedAt]);

  const activate = async () => {
    setStarting(true);
    try {
      if (!audioRef.current) {
        audioRef.current = createKioskAudioContext();
      }
      if (audioRef.current) {
        await unlockKioskAudio(audioRef.current);
      }
      await onActivateSession();
    } finally {
      setStarting(false);
    }
  };

  if (!sessionReady) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-16 px-6 text-center w-full max-w-xl">
        <WindowStatusBanner scanWindow={scanWindow} windowFetchedAt={windowFetchedAt} />
        <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center gold-glow">
          <Camera className="w-12 h-12 text-primary" />
        </div>
        <div className="space-y-2 max-w-md">
          <h2 className="text-2xl font-bold text-primary">جلسة تحضير الطلاب</h2>
          <p className="text-muted-foreground">
            فتح من {formatKioskClock(scanWindow.openAt)} · حضور ثم تأخر · توقيت {scanWindow.city}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void activate()}
          disabled={starting || !scanAllowed}
          className="px-8 py-4 rounded-2xl gold-gradient text-primary-foreground font-bold text-lg shadow-lg disabled:opacity-60"
        >
          {starting ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" /> جاري التفعيل…
            </span>
          ) : scanAllowed ? (
            "تفعيل جلسة التحضير"
          ) : (
            "انتظر فتح وقت التحضير"
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-xl mx-auto space-y-4">
      <WindowStatusBanner scanWindow={scanWindow} windowFetchedAt={windowFetchedAt} />

      {!scanAllowed ? (
        <div className="rounded-3xl border-2 border-dashed border-muted-foreground/25 bg-muted/20 min-h-[320px] flex flex-col items-center justify-center gap-3 px-6 text-center">
          <Lock className="w-12 h-12 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">{scanWindow.message || "المسح متوقف حالياً"}</p>
        </div>
      ) : (
        <div
          id={SCANNER_ID}
          className="overflow-hidden rounded-3xl border-2 border-primary/20 bg-black/90 shadow-xl min-h-[320px]"
        />
      )}

      {starting ? (
        <div className="absolute inset-x-0 top-24 flex items-center justify-center pointer-events-none">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      ) : null}
      {cameraError ? (
        <p className="text-center text-destructive text-sm">{cameraError}</p>
      ) : scanAllowed ? (
        <p className="text-center text-muted-foreground text-sm">
          وجّه بطاقة QR أمام الكاميرا لتسجيل الحضور تلقائياً
        </p>
      ) : null}
      <KioskFeedback
        visible={Boolean(feedback)}
        status={feedback?.status ?? "error"}
        message={feedback?.message ?? ""}
        studentName={feedback?.studentName}
      />
    </div>
  );
}
