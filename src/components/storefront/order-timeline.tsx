import { Check, CircleDashed, X } from "lucide-react";
import type { TimelineStep } from "@/shared/order-timeline";
import { cn } from "@/shared/utils";

/** Renders order_status_history as a customer-facing timeline. */
export function OrderTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="space-y-0">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        return (
          <li key={step.status} className="relative flex gap-4 pb-6 last:pb-0">
            {!isLast ? (
              <span
                aria-hidden
                className={cn(
                  "absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-0.5",
                  step.state === "done" ? "bg-[var(--color-brand)]" : "bg-[var(--color-hairline)]",
                )}
              />
            ) : null}
            <span
              className={cn(
                "relative z-10 mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border",
                step.state === "done" && "border-[var(--color-brand)] bg-[var(--color-brand)] text-[var(--color-brand-foreground)]",
                step.state === "current" && "border-[var(--color-brand)] bg-[var(--color-surface)] text-[var(--color-brand)]",
                step.state === "upcoming" && "border-[var(--color-hairline)] bg-[var(--color-surface)] text-[var(--color-muted-ink)]",
                step.state === "cancelled" && "border-red-500 bg-red-500 text-white",
              )}
              aria-hidden
            >
              {step.state === "done" ? <Check className="size-4" /> : step.state === "cancelled" ? <X className="size-4" /> : <CircleDashed className="size-4" />}
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <p className={cn("text-sm font-medium", step.state === "upcoming" && "text-[var(--color-muted-ink)]")}>
                {step.label}
              </p>
              {step.at ? (
                <p className="text-xs text-[var(--color-muted-ink)]">
                  {new Date(step.at).toLocaleString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                    day: "numeric",
                    month: "short",
                  })}
                </p>
              ) : step.state === "current" ? (
                <p className="text-xs text-[var(--color-brand)]">In progress</p>
              ) : null}
              {step.note ? <p className="mt-1 text-xs italic text-[var(--color-muted-ink)]">{step.note}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
