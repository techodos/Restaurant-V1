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
  "border-b border-[var(--admin-line,var(--color-hairline))] bg-[color-mix(in_srgb,var(--color-ink)_2.5%,var(--color-surface))] text-left text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[var(--color-muted-ink)]";
export const tableRow = "transition-colors hover:bg-[color-mix(in_srgb,var(--color-brand)_3.5%,transparent)]";

/**
 * One KPI: label, big figure, optional note, an icon disc that never collides with the label (the label wraps
 * beside it, the figure sits on its own line below). `tone` tints the disc (brand accent by default).
 */
export function StatTile({
  label,
  value,
  note,
  icon: Icon,
  tone = "brand",
  size = "md",
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  /** lg: the headline figure of a bento grid (bigger number, pushed to the bottom) */
  size?: "md" | "lg";
  note?: React.ReactNode;
  icon?: LucideIcon;
  tone?: StatusTone;
  className?: string;
}) {
  return (
    <div className={cn("surface-card @container flex min-w-0 flex-col gap-3 p-4 sm:p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-[12px] font-semibold uppercase leading-snug tracking-[0.08em] text-[var(--color-muted-ink)]">{label}</p>
        {Icon ? (
          <span aria-hidden className={cn("grid size-8 shrink-0 place-items-center rounded-full ring-1 ring-inset", TONE[tone])}>
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      {/* never "…": the figure is sized from its own length and the tile's width (cqi), so a short figure stays
          big and a long amount shrinks only as far as it must; the currency code is set small, and a figure that
          still does not fit wraps between code and number (`anywhere` is only the last resort) */}
      <p
        title={typeof value === "string" ? value : undefined}
        className="tabular min-w-0 font-semibold leading-[1.05] tracking-[-0.02em] [overflow-wrap:anywhere]"
        style={{ fontSize: figureSize(value, size), marginTop: size === "lg" ? "auto" : undefined }}
      >
        <StatFigure value={value} />
      </p>
      {note ? <p className="text-[12.5px] text-[var(--color-muted-ink)]">{note}</p> : null}
    </div>
  );
}

/** "PKR 112,474.39" / "Rs 2,450" / "$12.50": a currency code or symbol, then the number. Words ("Oct 18") don't match. */
const MONEY = /^([A-Z]{2,4}|Rs\.?|[$€£¥₹₨])\s?(-?\d[\d.,]*)$/;

/** CSS font size that fits the figure on one line where it can: ~0.6em per digit, the small code ~2em. */
function figureSize(value: React.ReactNode, size: "md" | "lg"): string {
  const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  const money = MONEY.exec(text);
  const units = money ? money[2]!.length + 2.2 : Math.max(text.length, 1);
  const [min, max, factor] = size === "lg" ? ["1.4rem", "2.6rem", 1.55] : ["0.95rem", "1.75rem", 1.55];
  return `clamp(${min}, calc(100cqi * ${factor} / ${units}), ${max})`;
}

/** a small currency code, then the number; anything else as given */
function StatFigure({ value }: { value: React.ReactNode }) {
  const money = typeof value === "string" ? MONEY.exec(value.trim()) : null;
  if (!money) return <>{value}</>;
  return (
    <>
      <span className="mr-[0.25em] text-[0.55em] font-semibold tracking-[0.02em] text-[var(--color-muted-ink)]">{money[1]}</span>{" "}
      <span className="whitespace-nowrap">{money[2]}</span>
    </>
  );
}

/** A dashed "add" tile that ends a grid or list of cards (opens the manager's create form). */
export const addTileClass =
  "group flex min-h-[4.5rem] w-full items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-[color-mix(in_srgb,var(--color-ink)_22%,transparent)] px-4 py-3 text-[14px] font-semibold text-[var(--color-muted-ink)] transition-colors hover:border-[var(--color-brand)] hover:bg-[color-mix(in_srgb,var(--color-brand)_5%,transparent)] hover:text-[var(--color-brand)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand)]";

/** Initials in a tinted disc (people lists: customers, staff). */
export function Avatar({ name, className }: { name: string; className?: string }) {
  const letters = name.trim().split(/\s+/).filter(Boolean).map((part) => part.charAt(0)).join("").slice(0, 2).toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-brand)_12%,var(--color-surface))] text-[13px] font-semibold text-[var(--color-brand)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--color-brand)_20%,transparent)]",
        className,
      )}
    >
      {letters}
    </span>
  );
}

/**
 * Marks a WhatsApp-checkout order and where it stands (the customer reports sending it; wa.me itself reports nothing):
 * awaiting send (grey), sent (green), not sent / lapsed (red). Pass the stage from `shared/whatsapp-order#whatsappStage`.
 */
export function WhatsAppOrderBadge({ stage = "sent", className }: { stage?: "awaiting" | "sent" | "not_sent" | "cancelled" | null; className?: string }) {
  const tone =
    stage === "awaiting"
      ? "bg-[var(--tint)] text-[var(--color-muted-ink)] ring-[var(--rule)]"
      : stage === "not_sent"
        ? "bg-[color-mix(in_srgb,var(--color-danger)_9%,var(--color-surface))] text-[color-mix(in_srgb,var(--color-danger)_85%,var(--color-ink))] ring-[color-mix(in_srgb,var(--color-danger)_22%,transparent)]"
        : "bg-[color-mix(in_srgb,#25D366_15%,var(--color-surface))] text-[#146c38] ring-[color-mix(in_srgb,#25D366_35%,transparent)]";
  const label = stage === "awaiting" ? "WhatsApp · awaiting send" : stage === "not_sent" ? "WhatsApp · not sent" : "WhatsApp";
  return (
    <span
      title={stage === "awaiting" ? "Saved; the customer has not confirmed sending it on WhatsApp yet" : stage === "not_sent" ? "Never sent on WhatsApp — not a real order" : "Sent to the restaurant on WhatsApp"}
      className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", tone, className)}
    >
      {label}
    </span>
  );
}
