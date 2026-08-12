"use client";

interface StarRatingProps {
  value: number;
  onChange?: (stars: number) => void;
  readonly?: boolean;
  size?: "sm" | "md" | "lg";
}

const SIZES = { sm: "text-xl", md: "text-2xl", lg: "text-4xl" };

export default function StarRating({
  value,
  onChange,
  readonly = false,
  size = "md",
}: StarRatingProps) {
  return (
    <div className={`flex flex-row-reverse gap-1 ${SIZES[size]}`} dir="ltr">
      {[5, 4, 3, 2, 1].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(star)}
          className={`transition-colors ${
            readonly ? "cursor-default" : "cursor-pointer hover:scale-110"
          } ${star <= value ? "text-secondary" : "text-gray-300"}`}
          aria-label={`${star} نجوم`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
