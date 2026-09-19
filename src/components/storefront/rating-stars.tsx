import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function RatingStars({
  rating,
  size = "sm",
  className,
}: {
  rating: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const rounded = Math.round(rating * 2) / 2;
  const dimension = size === "md" ? "size-5" : "size-4";
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} role="img" aria-label={`${rating.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((step) => (
        <Star
          key={step}
          className={cn(
            dimension,
            step <= rounded
              ? "fill-[var(--color-brand-accent)] text-[var(--color-brand-accent)]"
              : step - 0.5 === rounded
                ? "fill-[var(--color-brand-accent)]/50 text-[var(--color-brand-accent)]"
                : "text-[var(--color-hairline)]",
          )}
          aria-hidden
        />
      ))}
    </span>
  );
}
