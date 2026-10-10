"use client";

import { useEffect, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ArrowRight, Check, ChevronDown, MapPin, MapPinOff } from "lucide-react";
import { formatDistance, type BranchOption } from "@/shared/branching";
import { cn } from "@/shared/utils";
import { Badge } from "@/components/ui/badge";
import { useBranching } from "./branching";
import { useLocalCart } from "./local-cart";

/**
 * The order's branch, in the global header on every page (multi-branch ordering only; renders nothing
 * with the feature off). It reads the provider's state and nothing else — `selected` is the tray's
 * branch, `branches` the ones this order type may use (delivery: zone-matched, city-bounded, nearest
 * first) — and changes it only through the provider's `pickBranch` / location sheet, so menu, cart and
 * checkout follow the same choice.
 *
 *   branch chosen      "📍 MM Alam Road · Lahore ▾" → popover: serving branch, eligible branches, change location
 *   nobody delivers    the destination, warning tint → popover explains, offers "Change location"
 *   no location / branch yet  nothing (2026-10-09, owner's request): the customer is asked for both at "Add to cart"
 *                      (quick-add / item customizer / cart call `resolveGate`), and the pill appears once they are set
 */
export function HeaderBranchPill({
  tone,
  align = "end",
  className,
  divider = false,
}: {
  tone: "night" | "paper";
  /** desktop: a hairline before the pill, separating it from the logo (shown only when the pill is) */
  divider?: boolean;
  /** which edge of the pill the popover lines up with: "start" next to the logo, "end" among the actions */
  align?: "start" | "end";
  className?: string;
}) {
  const branching = useBranching();
  const { cart } = useLocalCart();
  const [open, setOpen] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  // portalled into `.theme-root` (like Sheet / useConfirm) so the restaurant's theme variables apply
  useEffect(() => setContainer(document.querySelector<HTMLElement>(".theme-root")), []);

  if (!branching.enabled) return null;

  const { destination, selected, branches } = branching;
  const gate = branching.gate();
  const delivery = cart.orderType === "delivery";
  const iconTone = tone === "night" ? "text-[var(--color-brand-accent)]" : "text-[var(--color-brand)]";
  const pill =
    "press group/branch flex h-8 min-w-0 items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--rule-strong)] bg-[var(--tint)] pl-2 pr-2.5 text-left text-[12px] text-[var(--color-ink)] transition-[background-color,border-color] duration-200 hover:border-[color-mix(in_srgb,var(--color-ink)_34%,transparent)] hover:bg-[var(--tint-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-accent)] data-[state=open]:bg-[var(--tint-strong)]";

  // nothing to show until the customer has chosen a location and branch (asked at "Add to cart")
  if (gate === "need-location" || gate === "need-branch") return null;

  const unserved = gate === "no-service";
  const close = () => setOpen(false);

  return (
    <>
      {divider ? <span aria-hidden className="hidden h-6 w-px shrink-0 bg-[var(--rule-strong)] xl:block" /> : null}
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          className={cn(pill, unserved && "border-[color-mix(in_srgb,var(--color-warning)_55%,transparent)]", "lg:max-xl:size-8 lg:max-xl:shrink-0 lg:max-xl:justify-center lg:max-xl:px-0", className)}
          // the full name on hover: narrow desktop widths shorten the pill to the branch name alone
          title={unserved ? destination?.label : [selected?.name, selected?.city].filter(Boolean).join(" · ")}
          aria-label={
            unserved
              ? `Ordering isn't available in ${destination?.label ?? "your location"}. Change location`
              : `${delivery ? "Serving from" : cart.orderType === "pickup" ? "Picking up from" : "Dining at"} ${selected?.name ?? ""}${
                  selected?.city ? `, ${selected.city}` : ""
                }. Change branch or location`
          }
        >
          {unserved ? (
            <MapPinOff className="size-3.5 shrink-0 text-[var(--color-warning)]" aria-hidden />
          ) : (
            <MapPin className={cn("size-3.5 shrink-0", iconTone)} aria-hidden />
          )}
          <span className="flex min-w-0 flex-1 items-baseline gap-1.5 lg:max-xl:hidden">
            <span className="min-w-0 max-w-[6.5rem] truncate font-semibold min-[400px]:max-w-[8.5rem] sm:max-w-[11rem]">
              {unserved ? (destination?.label ?? "Your location") : selected?.name}
            </span>
            {!unserved && selected?.city ? (
              <span className="hidden min-w-0 max-w-[7rem] shrink-[2] truncate text-[var(--color-muted-ink)] md:inline lg:hidden 2xl:inline">· {selected.city}</span>
            ) : null}
          </span>
          <ChevronDown
            className="size-3 shrink-0 text-[var(--color-muted-ink)] transition-transform duration-200 group-data-[state=open]/branch:rotate-180 motion-reduce:transition-none lg:max-xl:hidden"
            aria-hidden
          />
        </Popover.Trigger>

        <Popover.Portal container={container}>
          <Popover.Content
            align={align}
            sideOffset={10}
            collisionPadding={12}
            className="animate-popover z-50 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-hairline)] bg-[var(--color-surface)] text-[var(--color-ink)] shadow-[var(--shadow-raised)] outline-none"
          >
            {unserved ? (
              <div role="status" className="p-4">
                <p className="flex items-start gap-2.5 text-sm font-semibold">
                  <MapPinOff className="mt-0.5 size-4 shrink-0 text-[var(--color-warning)]" aria-hidden />
                  Ordering isn&apos;t available in {destination?.label ?? "that location"} yet
                </p>
                <p className="mt-1.5 pl-[1.625rem] text-[13px] leading-relaxed text-[var(--color-muted-ink)]">
                  {branching.deliveryCities.length ? `We currently deliver in ${listCities(branching.deliveryCities)}. ` : ""}
                  You can still browse the whole menu. To order, choose an address one of our branches delivers to.
                </p>
              </div>
            ) : (
              <>
                <div className="px-4 pb-2 pt-3.5">
                  <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted-ink)]">
                    <span aria-hidden className="size-1.5 rounded-full bg-[var(--color-success)]" />
                    {delivery ? "Serving from" : cart.orderType === "pickup" ? "Pick up from" : "Dining at"}
                  </p>
                  {delivery && destination ? (
                    <p className="mt-1 truncate text-[12.5px] text-[var(--color-muted-ink)]">Delivering to {destination.label}</p>
                  ) : null}
                </div>
                <ul
                  role="radiogroup"
                  aria-label="Branch"
                  className="max-h-[min(19rem,50vh)] space-y-1 overflow-y-auto px-1.5 pb-1.5"
                >
                  {branches.map((branch) => (
                    <BranchRow
                      key={branch.id}
                      branch={branch}
                      on={branch.id === selected?.id}
                      nearest={branch.id === branches[0]?.id && branch.distanceKm != null && branches.length > 1}
                      onPick={() => {
                        close();
                        if (branch.id !== selected?.id) void branching.pickBranch(branch);
                      }}
                    />
                  ))}
                </ul>
              </>
            )}

            <div className="border-t border-[var(--color-hairline)] p-1.5">
              <button
                type="button"
                onClick={() => {
                  close();
                  branching.openLocation();
                }}
                className="group flex w-full items-center justify-between gap-3 rounded-[calc(var(--radius-card)-4px)] px-3 py-2.5 text-left text-[13.5px] font-medium transition-colors duration-150 hover:bg-[var(--tint)] focus-visible:bg-[var(--tint)] focus-visible:outline-none"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <MapPin className="size-4 shrink-0 text-[var(--color-muted-ink)]" aria-hidden />
                  <span className="truncate">{destination ? (delivery ? "Change delivery location" : "Change location") : "Set your location"}</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-[var(--color-muted-ink)] transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
              </button>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </>
  );
}

function BranchRow({ branch, on, nearest, onPick }: { branch: BranchOption; on: boolean; nearest: boolean; onPick: () => void }) {
  const detail = [branch.address, branch.city && !branch.address.includes(branch.city) ? branch.city : null].filter(Boolean).join(", ");
  return (
    <li>
      <button
        type="button"
        role="radio"
        aria-checked={on}
        onClick={onPick}
        className={cn(
          "flex w-full items-start gap-3 rounded-[calc(var(--radius-card)-4px)] px-3 py-2.5 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand)]",
          on ? "bg-[var(--brand-tint)]" : "hover:bg-[var(--tint)]",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full border",
            on ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-[var(--color-brand-foreground)]" : "border-[var(--rule-strong)]",
          )}
        >
          {on ? <Check className="size-3" strokeWidth={3} /> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="break-words text-sm font-semibold leading-snug">{branch.name}</span>
            {nearest ? <Badge variant="soft">Nearest</Badge> : null}
          </span>
          {detail ? <span className="mt-0.5 block break-words text-[12.5px] leading-snug text-[var(--color-muted-ink)]">{detail}</span> : null}
        </span>
        {branch.distanceKm !== null ? (
          <span className="tabular shrink-0 pt-0.5 text-[12px] text-[var(--color-muted-ink)]">{formatDistance(branch.distanceKm)}</span>
        ) : null}
      </button>
    </li>
  );
}

/** "Lahore", "Lahore and Islamabad", "Lahore, Islamabad and Karachi" */
function listCities(cities: string[]): string {
  return cities.length > 1 ? `${cities.slice(0, -1).join(", ")} and ${cities.at(-1)}` : (cities[0] ?? "");
}
