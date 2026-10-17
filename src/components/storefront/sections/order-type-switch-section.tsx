import Image from "next/image";
import { enabledOrderTypes } from "@/shared/ordering";
import { ArrowRight, ArrowUpRight, Check, ShoppingBag, Store, UtensilsCrossed } from "lucide-react";
import type { StorefrontContext } from "@/shared/contract/models";
import type { OrderTypeSwitchSection as SwitchConfig } from "@/shared/contract/sections";
import { ORDER_TYPE_LABELS, type OrderType } from "@/shared/contract/enums";
import { SectionShell, type SectionTone } from "@/components/storefront/section-shell";
import { OrderTypeDoor } from "@/components/storefront/sections/order-type-door";
import { resolveImage } from "@/web/media";
import { cn } from "@/shared/utils";

const ICONS: Record<OrderType, typeof ShoppingBag> = {
  delivery: ShoppingBag,
  pickup: Store,
  dine_in: UtensilsCrossed,
};

const BLURBS: Record<OrderType, string> = {
  delivery: "Hot to your door, tracked from the kitchen.",
  pickup: "Skip the queue. Ready when you arrive.",
  dine_in: "Order at the table or ahead of your visit.",
};

const ACTIONS: Record<OrderType, string> = {
  delivery: "Order delivery",
  pickup: "Order for pickup",
  dine_in: "Order to your table",
};

/** keyboard focus ring in the brand accent, and a slight press on tap/click (every layout) */
const PRESS =
  "outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-[var(--color-brand-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-canvas)] active:scale-[0.985]";

const TEXT_KEY = { delivery: "deliveryText", pickup: "pickupText", dine_in: "dineInText" } as const;
const IMAGE_KEY = { delivery: "deliveryImage", pickup: "pickupImage", dine_in: "dineInImage" } as const;

type Door = { type: OrderType; Icon: typeof ShoppingBag; label: string; text: string; eta: number | null; href: string };

/** the door's trailing arrow, swapped for a check while it is the tray's order type */
function DoorMark({ className }: { className?: string }) {
  return (
    <>
      <ArrowRight className={cn("group-data-[selected]:hidden", className)} aria-hidden />
      <Check className={cn("hidden group-data-[selected]:block", className)} strokeWidth={2.5} aria-hidden />
    </>
  );
}

/** delivery time as its own small tag beside the label, so it never wraps onto an extra line of the blurb */
function EtaTag({ minutes, className }: { minutes: number | null; className?: string }) {
  if (!minutes) return null;
  return (
    <span
      className={cn(
        "tabular inline-flex shrink-0 items-center rounded-full bg-[var(--tint-strong)] px-2 py-0.5 font-sans text-[11px] font-medium leading-4 tracking-normal text-[var(--color-muted-ink)]",
        className,
      )}
    >
      {minutes} min
    </span>
  );
}

/**
 * Doors into the menu, one per enabled order type. Choosing one sets the tray's order type and opens the menu
 * with ?orderType=…; the door matching the tray's current order type is marked selected. `layout` only changes
 * presentation (super admin → Pages → section → Layout): "band" right after a hero joins its bottom edge as one
 * strip; the others carry their own heading. The ground comes from the page rhythm (section-rhythm.ts →
 * ORDER_SWITCH_TONE / `tone`). Phones get their own compact arrangement of each layout, not a shrunk desktop.
 */
export function OrderTypeSwitchSection({
  section,
  context,
  tone = "night",
}: {
  section: SwitchConfig;
  context: StorefrontContext;
  tone?: SectionTone;
}) {
  const options = enabledOrderTypes(context.restaurant.features, section.orderTypes);
  if (!options.length) return null;

  const doors: Door[] = options.map((type) => ({
    type,
    Icon: ICONS[type],
    label: ORDER_TYPE_LABELS[type],
    text: section[TEXT_KEY[type]] || BLURBS[type],
    eta: section.showEta && type === "delivery" ? context.restaurant.settings.delivery.defaultEtaMinutes : null,
    href: `/menu?orderType=${type}`,
  }));
  const cols = doors.length === 3 ? "md:grid-cols-3" : doors.length === 2 ? "md:grid-cols-2" : "";

  const heading = (center: boolean) =>
    section.showHeading && section.title ? (
      <div className={cn("mb-6 md:mb-10", center && "mx-auto max-w-2xl text-center")}>
        <h2 className="display-2 text-balance">{section.title}</h2>
        {section.subtitle ? (
          <p className={cn("lede mt-2 text-pretty md:mt-3", center && "mx-auto")}>{section.subtitle}</p>
        ) : null}
      </div>
    ) : null;

  switch (section.layout) {
    case "cards":
      return (
        <SectionShell tone={tone} aria-label={section.title || undefined}>
          {heading(true)}
          {/* ticket stubs: the door's details above a perforated tear line, its action pinned beneath it.
              Phones: icon, label and time share one row so a ticket stays compact. */}
          <ul className={cn("grid gap-3 sm:gap-6", cols)}>
            {doors.map((door) => (
              <li key={door.type} className="reveal">
                <OrderTypeDoor
                  type={door.type}
                  href={door.href}
                  className={cn(
                    "group flex h-full flex-col overflow-hidden rounded-[14px] bg-[var(--color-surface)] shadow-[var(--shadow-card)] transition-[transform,box-shadow] duration-500 ease-[var(--ease-out)] hover:-translate-y-1 hover:shadow-[var(--shadow-raised)] data-[selected]:ring-2 data-[selected]:ring-[var(--color-brand-accent)]",
                    PRESS,
                  )}
                >
                  <span className="grid flex-1 grid-cols-[auto_minmax(0,1fr)_auto] content-start items-center gap-x-3 p-4 [grid-template-areas:'icon_label_eta'_'text_text_text'] sm:p-6 md:p-7 md:[grid-template-areas:'icon_._eta'_'label_label_label'_'text_text_text']">
                    <span className="grid size-10 place-items-center rounded-[10px] bg-[color-mix(in_srgb,var(--color-brand-accent)_14%,transparent)] text-[var(--color-brand-accent)] transition-colors duration-300 [grid-area:icon] group-data-[selected]:bg-[var(--color-brand-accent)] group-data-[selected]:text-[var(--color-canvas)]">
                      <door.Icon className="size-[18px]" aria-hidden />
                    </span>
                    <span className="display-3 block [grid-area:label] md:display-2 md:mt-7">{door.label}</span>
                    <EtaTag minutes={door.eta} className="[grid-area:eta] justify-self-end" />
                    <span className="mt-1.5 block max-w-[34ch] text-pretty text-[13.5px] leading-relaxed text-[var(--color-muted-ink)] [grid-area:text] md:mt-2 md:text-[14px]">
                      {door.text}
                    </span>
                  </span>
                  <span aria-hidden className="relative mx-4 border-t border-dashed border-[var(--rule-strong)] sm:mx-5">
                    <span className="absolute -left-[1.625rem] -top-2.5 size-5 rounded-full bg-[var(--color-canvas)] sm:-left-[1.875rem]" />
                    <span className="absolute -right-[1.625rem] -top-2.5 size-5 rounded-full bg-[var(--color-canvas)] sm:-right-[1.875rem]" />
                  </span>
                  <span className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13.5px] font-semibold sm:px-6 sm:py-4 md:px-7">
                    {ACTIONS[door.type]}
                    <span className="grid size-8 place-items-center rounded-full bg-[var(--color-ink)] text-[var(--color-canvas)] transition-[transform,background-color] duration-500 ease-[var(--ease-out)] group-hover:translate-x-0.5 group-hover:bg-[var(--color-brand-accent)] group-data-[selected]:bg-[var(--color-brand-accent)]">
                      <DoorMark className="size-3.5" />
                    </span>
                  </span>
                </OrderTypeDoor>
              </li>
            ))}
          </ul>
        </SectionShell>
      );

    case "photo": {
      const cover = resolveImage(context.restaurant.coverUrl);
      return (
        <SectionShell tone={tone} aria-label={section.title || undefined}>
          {heading(false)}
          {/* phones: a swipeable row (so the cover triptych still reads across the doors); md+: a grid */}
          <ul
            className={cn(
              "scrollbar-none -mx-5 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 py-1 md:mx-0 md:grid md:gap-4 md:overflow-visible md:px-0 md:py-0",
              cols,
            )}
          >
            {doors.map((door, index) => {
              const own = section[IMAGE_KEY[door.type]];
              const src = resolveImage(own?.url) ?? cover;
              return (
                <li
                  key={door.type}
                  className={cn("reveal shrink-0 snap-start md:w-auto", doors.length > 1 ? "w-[80%] min-[480px]:w-[62%]" : "w-full")}
                >
                  <OrderTypeDoor
                    type={door.type}
                    href={door.href}
                    className={cn(
                      "group relative isolate flex h-[16.5rem] flex-col justify-end overflow-hidden rounded-[var(--radius-panel)] bg-[var(--color-night)] p-5 text-white transition-transform duration-500 ease-[var(--ease-out)] data-[selected]:ring-2 data-[selected]:ring-[var(--color-brand-accent)] data-[selected]:ring-offset-2 data-[selected]:ring-offset-[var(--color-canvas)] sm:h-[19rem] sm:p-6 md:h-[26rem] md:p-7",
                      PRESS,
                    )}
                  >
                    {own?.url && src ? (
                      <Image
                        src={src}
                        alt={own.alt}
                        fill
                        sizes="(min-width: 768px) 33vw, 80vw"
                        className="-z-10 object-cover transition-transform duration-700 ease-[var(--ease-out)] group-hover:scale-[1.04]"
                      />
                    ) : src ? (
                      // no photo of its own: the cover photo spread across the doors as one triptych
                      <span
                        aria-hidden
                        style={{ "--n": doors.length, "--i": index } as React.CSSProperties}
                        className="absolute inset-y-0 -z-10 w-[calc(var(--n)*100%)] transition-transform duration-700 ease-[var(--ease-out)] [left:calc(var(--i)*-100%)] group-hover:scale-[1.04]"
                      >
                        <Image src={src} alt="" fill sizes="100vw" className="object-cover" />
                      </span>
                    ) : (
                      <door.Icon aria-hidden className="absolute -right-6 -top-6 -z-10 size-48 text-white/[0.06]" />
                    )}
                    <span
                      aria-hidden
                      className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(0_0_0/0.05)_30%,rgb(0_0_0/0.8)_100%)]"
                    />
                    <span className="absolute right-4 top-4 grid size-10 place-items-center rounded-full border border-white/30 bg-black/20 transition-colors duration-300 group-hover:border-[var(--color-brand-accent)] group-hover:bg-[var(--color-brand-accent)] group-data-[selected]:border-[var(--color-brand-accent)] group-data-[selected]:bg-[var(--color-brand-accent)] md:right-5 md:top-5 md:size-11">
                      <ArrowUpRight
                        className="size-[18px] transition-transform duration-500 ease-[var(--ease-out)] group-hover:-translate-y-px group-hover:translate-x-px group-data-[selected]:hidden"
                        aria-hidden
                      />
                      <Check className="hidden size-[18px] group-data-[selected]:block" strokeWidth={2.5} aria-hidden />
                    </span>
                    <span className="flex items-center gap-2 text-[12px] font-medium text-white/80">
                      <door.Icon className="size-4 text-[var(--color-brand-accent)]" aria-hidden />
                      {door.eta ? <span className="tabular">About {door.eta} min</span> : null}
                    </span>
                    <span className="display-2 mt-1.5 block md:mt-2">{door.label}</span>
                    <span className="mt-1.5 block max-w-[34ch] text-pretty text-[13.5px] leading-snug text-white/80 md:mt-2 md:text-[14px] md:leading-relaxed">
                      {door.text}
                    </span>
                  </OrderTypeDoor>
                </li>
              );
            })}
          </ul>
        </SectionShell>
      );
    }

    case "capsule":
      return (
        <SectionShell tone={tone} aria-label={section.title || undefined}>
          {heading(true)}
          <ul className="reveal mx-auto flex max-w-6xl flex-col gap-1 rounded-[1.5rem] border border-[var(--rule)] bg-[var(--color-surface)] p-1.5 shadow-[var(--shadow-card)] lg:flex-row lg:gap-1.5 lg:rounded-full">
            {doors.map((door) => (
              <li key={door.type} className="min-w-0 flex-1">
                <OrderTypeDoor
                  type={door.type}
                  href={door.href}
                  className={cn(
                    "group flex h-full min-h-14 items-center gap-3 rounded-[1.125rem] px-3 py-2.5 transition-[background-color,transform] duration-300 ease-[var(--ease-out)] hover:bg-[color-mix(in_srgb,var(--color-brand-accent)_12%,transparent)] data-[selected]:bg-[color-mix(in_srgb,var(--color-brand-accent)_16%,transparent)] sm:gap-3.5 sm:px-3.5 sm:py-3 lg:rounded-full lg:pr-5",
                    PRESS,
                  )}
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-ink)_7%,transparent)] text-[var(--color-ink)] transition-colors duration-300 group-hover:bg-[var(--color-brand-accent)] group-hover:text-[var(--color-canvas)] group-data-[selected]:bg-[var(--color-brand-accent)] group-data-[selected]:text-[var(--color-canvas)] sm:size-11">
                    <door.Icon className="size-[18px]" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-[15px] font-semibold leading-tight">{door.label}</span>
                      <EtaTag minutes={door.eta} />
                    </span>
                    <span className="mt-0.5 block text-pretty text-[12.5px] leading-snug text-[var(--color-muted-ink)]">{door.text}</span>
                  </span>
                  <DoorMark className="size-4 shrink-0 text-[var(--color-muted-ink)] transition-[transform,color] duration-300 group-hover:translate-x-0.5 group-hover:text-[var(--color-ink)] group-data-[selected]:text-[var(--color-brand-accent)]" />
                </OrderTypeDoor>
              </li>
            ))}
          </ul>
        </SectionShell>
      );

    case "split":
      return (
        <SectionShell tone={tone} aria-label={section.title || undefined}>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:gap-14">
            <div className="[&>div]:mb-0">{heading(false)}</div>
            <ul className="grid gap-2.5 md:gap-3">
              {doors.map((door, index) => (
                <li key={door.type} className="reveal">
                  <OrderTypeDoor
                    type={door.type}
                    href={door.href}
                    className={cn(
                      "group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--radius-panel)] border border-[var(--rule)] px-4 py-3.5 transition-[border-color,background-color,transform] duration-300 ease-[var(--ease-out)] hover:border-[color-mix(in_srgb,var(--color-brand-accent)_60%,transparent)] hover:bg-[var(--tint)] data-[selected]:border-[var(--color-brand-accent)] data-[selected]:bg-[color-mix(in_srgb,var(--color-brand-accent)_8%,transparent)] sm:gap-4 sm:p-5 md:gap-6 md:p-6",
                      PRESS,
                    )}
                  >
                    <span className="tabular w-[1.9rem] font-[family-name:var(--font-display)] text-[1.4rem] leading-none text-[var(--color-brand-accent)] sm:w-[2.4rem] sm:text-[1.75rem] md:w-[3.1rem] md:text-[2.25rem]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span className="display-3 flex items-center gap-2">
                          {door.label}
                          <door.Icon className="hidden size-4 shrink-0 text-[var(--color-brand-accent)] opacity-80 sm:block" aria-hidden />
                        </span>
                        <EtaTag minutes={door.eta} />
                      </span>
                      <span className="mt-1 block text-pretty text-[13px] leading-snug text-[var(--color-muted-ink)] md:mt-1.5 md:text-[13.5px]">
                        {door.text}
                      </span>
                    </span>
                    <span className="grid size-9 place-items-center rounded-full border border-[var(--rule-strong)] transition-colors duration-300 group-hover:border-[var(--color-brand-accent)] group-hover:bg-[var(--color-brand-accent)] group-hover:text-[var(--color-night)] group-data-[selected]:border-[var(--color-brand-accent)] group-data-[selected]:bg-[var(--color-brand-accent)] group-data-[selected]:text-[var(--color-night)] md:size-10">
                      <DoorMark className="size-4 transition-transform duration-500 ease-[var(--ease-out)] group-hover:translate-x-0.5" />
                    </span>
                  </OrderTypeDoor>
                </li>
              ))}
            </ul>
          </div>
        </SectionShell>
      );

    default:
      return (
        <section
          aria-label={section.title}
          className={cn(
            `tone-${tone} border-t border-[var(--rule)]`,
            tone === "night" && "[[data-after=hero]>&]:border-t-[color-mix(in_srgb,var(--color-on-night)_10%,transparent)]",
          )}
        >
          <div className="container-page">
            <h2 className="sr-only">{section.title}</h2>
            <ul
              className={cn(
                "grid divide-y divide-[var(--rule)] sm:divide-x sm:divide-y-0",
                doors.length === 3 ? "sm:grid-cols-3" : doors.length === 2 ? "sm:grid-cols-2" : "",
              )}
            >
              {doors.map((door) => (
                <li key={door.type}>
                  <OrderTypeDoor
                    type={door.type}
                    href={door.href}
                    className={cn(
                      "group flex h-full items-center gap-3.5 rounded-sm py-4 sm:gap-4 sm:px-6 sm:py-7 sm:first:pl-0 lg:px-10 lg:first:pl-0",
                      PRESS,
                    )}
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-full border border-[var(--rule-strong)] text-[var(--color-brand-accent)] transition-colors duration-300 group-hover:border-[var(--color-brand-accent)] group-data-[selected]:border-[var(--color-brand-accent)] group-data-[selected]:bg-[var(--color-brand-accent)] group-data-[selected]:text-[var(--color-canvas)]">
                      <door.Icon className="size-[18px]" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span className="display-3">{door.label}</span>
                        <EtaTag minutes={door.eta} />
                      </span>
                      <span className="mt-1 block text-pretty text-[13px] leading-snug text-[var(--color-muted-ink)]">{door.text}</span>
                    </span>
                    <DoorMark className="size-5 shrink-0 text-[var(--color-muted-ink)] transition-[transform,color] duration-300 group-hover:translate-x-1 group-hover:text-[var(--color-ink)] group-data-[selected]:text-[var(--color-brand-accent)]" />
                  </OrderTypeDoor>
                </li>
              ))}
            </ul>
          </div>
        </section>
      );
  }
}
