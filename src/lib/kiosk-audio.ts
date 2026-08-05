export type KioskAudioKind = "success" | "warning" | "error";

function tone(
  ctx: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  volume = 0.15,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

export function playKioskSound(ctx: AudioContext, kind: KioskAudioKind): void {
  const now = ctx.currentTime;
  if (kind === "success") {
    tone(ctx, 880, now, 0.12);
    tone(ctx, 1175, now + 0.14, 0.16, 0.12);
    return;
  }
  if (kind === "warning") {
    tone(ctx, 620, now, 0.18, 0.1);
    tone(ctx, 520, now + 0.2, 0.22, 0.08);
    return;
  }
  tone(ctx, 220, now, 0.28, 0.14);
  tone(ctx, 180, now + 0.12, 0.32, 0.12);
}

export function createKioskAudioContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }
  const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) {
    return null;
  }
  return new Ctx();
}

export async function unlockKioskAudio(ctx: AudioContext): Promise<void> {
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
  tone(ctx, 440, ctx.currentTime, 0.04, 0.001);
}
