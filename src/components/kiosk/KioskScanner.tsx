import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, Loader2 } from "lucide-react";
import {
  createKioskAudioContext,
  playKioskSound,
  unlockKioskAudio,
  type KioskAudioKind,
} from "@/lib/kiosk-audio";
import { kioskCheckIn, type KioskCheckInStatus } from "@/lib/kiosk-service";
import { KioskFeedback } from "@/components/kiosk/KioskFeedback";

const SCANNER_ID = "kiosk-qr-reader";
const COOLDOWN_MS = 2000;

type Props = {
  token: string;
  sessionReady: boolean;
  onActivateSession: () => Promise<void>;
};

function statusToSound(status: KioskCheckInStatus): KioskAudioKind {
  if (status === "success") {
    return "success";
  }
  if (status === "invalid_qr" || status === "error") {
    return "error";
  }
  return "warning";
}

export function KioskScanner({ token, sessionReady, onActivateSession }: Props) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const busyRef = useRef(false);
  const lastScanRef = useRef("");

  const [starting, setStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    status: KioskCheckInStatus;
    message: string;
    studentName?: string;
  } | null>(null);

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
    [showFeedback, token],
  );

  const startScanner = useCallback(async () => {
    if (!sessionReady || scannerRef.current) {
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
  }, [handleDecoded, sessionReady]);

  useEffect(() => {
    if (sessionReady) {
      void startScanner();
    }
    return () => {
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) {
        void scanner.stop().catch(() => {});
        scanner.clear();
      }
    };
  }, [sessionReady, startScanner]);

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
      <div className="flex flex-col items-center justify-center gap-6 py-16 px-6 text-center">
        <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center gold-glow">
          <Camera className="w-12 h-12 text-primary" />
        </div>
        <div className="space-y-2 max-w-md">
          <h2 className="text-2xl font-bold text-primary">جلسة تحضير الطلاب</h2>
          <p className="text-muted-foreground">
            اضغط لتفعيل الكاميرا والصوت. يُفضّل فتح هذه الصفحة على جهاز ثابت عند مدخل المجمع.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void activate()}
          disabled={starting}
          className="px-8 py-4 rounded-2xl gold-gradient text-primary-foreground font-bold text-lg shadow-lg disabled:opacity-60"
        >
          {starting ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" /> جاري التفعيل…
            </span>
          ) : (
            "تفعيل جلسة التحضير"
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-xl mx-auto">
      <div
        id={SCANNER_ID}
        className="overflow-hidden rounded-3xl border-2 border-primary/20 bg-black/90 shadow-xl min-h-[320px]"
      />
      {starting ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background/70 rounded-3xl">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      ) : null}
      {cameraError ? (
        <p className="mt-4 text-center text-destructive text-sm">{cameraError}</p>
      ) : (
        <p className="mt-4 text-center text-muted-foreground text-sm">
          وجّه بطاقة QR أمام الكاميرا لتسجيل الحضور تلقائياً
        </p>
      )}
      <KioskFeedback
        visible={Boolean(feedback)}
        status={feedback?.status ?? "error"}
        message={feedback?.message ?? ""}
        studentName={feedback?.studentName}
      />
    </div>
  );
}
