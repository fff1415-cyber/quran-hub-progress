import { cn } from "@/lib/utils";
import type { PlanTaskType, PlanTrack, TapValue } from "@/lib/plan-types";
import { tapLabel, tapsForTrack } from "@/lib/plan-translator";

interface QuickTapInputProps {
  track: PlanTrack;
  task: PlanTaskType;
  disabled?: boolean;
  onTap: (tap: TapValue) => void;
  className?: string;
}

export function QuickTapInput({ track, task, disabled, onTap, className }: QuickTapInputProps) {
  const taps = tapsForTrack(track);
  return (
    <div className={cn("flex gap-0.5 justify-center", className)} data-task={task}>
      {taps.map((tap) => (
        <button
          key={tap}
          type="button"
          disabled={disabled}
          onClick={() => onTap(tap)}
          className={cn(
            "min-w-[2rem] px-1.5 py-1 rounded text-xs font-bold border transition-colors",
            "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20",
            "disabled:opacity-40 disabled:cursor-not-allowed",
          )}
          title={`${task}: ${tapLabel(tap)}`}
        >
          {tapLabel(tap)}
        </button>
      ))}
    </div>
  );
}
