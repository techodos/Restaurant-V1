import { Flame } from "lucide-react";
import { cn } from "@/shared/utils";

/** Spice as flame icons (0-3), never emoji. */
export function SpiceLevel({ level, className }: { level: number; className?: string }) {
  const value = Math.min(Math.max(level, 0), 3);
  if (value === 0) return null;
  return (
    <span
      role="img"
      aria-label={`Spice level ${value} of 3`}
      className={cn("inline-flex items-center gap-px text-[#c2410c]", className)}
    >
      {Array.from({ length: 3 }, (_, index) => (
        <Flame key={index} aria-hidden className={cn("size-3.5", index < value ? "fill-current" : "opacity-25")} />
      ))}
    </span>
  );
}
