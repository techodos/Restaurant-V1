import type { LucideIcon } from "lucide-react";
import type { OrderStatus, ReservationStatus } from "@/shared/contract/enums";
import { cn } from "@/shared/utils";

/**
 * Restaurant-admin design primitives (2026-10 redesign, direction A). Every colour is a theme token from the restaurant's
 * own websites.theme (`themeCssVariables` on the admin shell): brand for actions, the semantic success/warning/danger/info
 * tokens for states. Nothing here is used by the dashboard, which stays exactly as it was.
 */

export type StatusTone = "success" | "warning" | "danger" | "info" | "brand" | "neutral";

const TONE: Record<StatusTone, string> = {
  success: "text-[color-mix(in_srgb,var(--color-success)_82%,var(--color-ink))] bg-[color-mix(in_srgb,var(--color-success)_10%,var(--color-surface))] ring-[color-mix(in_srgb,var(--color-success)_24%,transparent)]",
  warning: "text-[color-mix(in_srgb,var(--color-warning)_82%,var(--color-ink))] bg-[color-mix(in_srgb,var(--color-warning)_11%,var(--color-surface))] ring-[color-mix(in_srgb,var(--color-warning)_26%,transparent)]",
  danger: "text-[color-mix(in_srgb,var(--color-danger)_85%,var(--color-ink))] bg-[color-mix(in_srgb,var(--color-danger)_9%,var(--color-surface))] ring-[color-mix(in_srgb,var(--color-danger)_22%,transparent)]",
  info: "text-[color-mix(in_srgb,var(--color-info)_85%,var(--color-ink))] bg-[color-mix(in_srgb,var(--color-info)_9%,var(--color-surface))] ring-[color-mix(in_srgb,var(--color-info)_22%,transparent)]",
  brand: "text-[var(--color-brand)] bg-[color-mix(in_srgb,var(--color-brand)_10%,var(--color-surface))] ring-[color-mix(in_srgb,var(--color-brand)_22%,transparent)]",
  neutral: "text-[var(--color-muted-ink)] bg-[var(--tint)] ring-[var(--rule)]",
};

/** Compact status pill: a dot plus the word, so the state never rests on colour alone. */
export function StatusPill({ tone, children, dot = true, className }: { tone: StatusTone; children: React.ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", TONE[tone], className)}>
      {dot ? <span aria-hidden className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

export function orderStatusTone(status: OrderStatus): StatusTone {
  switch (status) {
    case "pending":
      return "warning";
    case "confirmed":
    case "preparing":
    case "out_for_delivery":
      return "info";
    case "ready":
      return "brand";
    case "completed":
      return "success";
    case "cancelled":
      return "danger";
    default:
      return "neutral";
  }
}

export function reservationStatusTone(status: ReservationStatus): StatusTone {
  switch (status) {
    case "pending":
      return "warning";
    case "confirmed":
      return "info";
    case "seated":
      return "brand";
    case "completed":
      return "success";
    case "cancelled":
      return "danger";
    default:
      return "neutral";
  }
}

/** The shared `Badge` variants -> status tones, for lists that already decide a variant. */
export function badgeTone(variant: "neutral" | "brand" | "soft" | "success" | "warning" | "danger" | "info" | null | undefined): StatusTone {
  if (variant === "soft" || variant === "brand") return "brand";
  return variant ?? "neutral";
}

/** A titled card section: header (icon, title, description, right-side meta/actions) above its body. */
export function AdminSection({
  title,
  description,
  icon: Icon,
  actions,
  children,
  className,
  bodyClassName,
  id,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("surface-card scroll-mt-24 overflow-hidden", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-hairline)] px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <span aria-hidden className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--tint-strong)] text-[var(--color-muted-ink)]">
              <Icon className="size-4" />
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold leading-6">{title}</h2>
            {description ? <p className="text-[13px] leading-5 text-[var(--color-muted-ink)]">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      <div className={cn("px-5 py-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Table header cell / row classes shared by the admin lists, so every table reads the same. */
export const tableHead =
  "border-b border-[var(--color-hairline)] bg-[color-mix(in_srgb,var(--color-ink)_2.5%,var(--color-surface))] text-left text-xs font-semibold tracking-[0.01em] text-[var(--color-muted-ink)]";
export const tableRow = "transition-colors hover:bg-[color-mix(in_srgb,var(--color-ink)_2.5%,transparent)]";
