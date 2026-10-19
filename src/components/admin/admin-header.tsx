"use client";

import { AdminBreadcrumb } from "@/components/admin/admin-sidebar";
import { SoundToggleButton } from "@/components/admin/order-sound-notifications";

/**
 * The admin's top bar, on the same night surface as the sidebar (unchanged colours): where you are on the left
 * (breadcrumb), the branch in scope and the new-order sound on the right. The account (name, role, Platform admin,
 * Sign out) lives in the sidebar's user card.
 */
export function AdminHeader({
  restaurantSlug,
  restaurantName,
  mobileNav,
  branch,
  showSoundToggle = false,
}: {
  restaurantSlug: string;
  /** phones: the bar names the restaurant (there is no sidebar brand block below lg) */
  restaurantName: string;
  /** menu button for screens without the sidebar */
  mobileNav?: React.ReactNode;
  /** branch selector (owner/admin) or the member's own branch (read-only) */
  branch?: React.ReactNode;
  /** only staff who can see orders get the "new order" sound toggle */
  showSoundToggle?: boolean;
}) {
  // same height as the sidebar's brand block, so the two bottom rules line up
  return (
    <header className="tone-night sticky top-0 z-30 flex h-16 items-center justify-between gap-2.5 border-b border-[var(--rule)] px-3 sm:h-14 sm:gap-3 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
        {mobileNav}
        {/* phones: who (the restaurant) and where (the current screen) in one compact stack */}
        <div className="flex min-w-0 items-center gap-2.5 sm:hidden">
          <span
            aria-hidden
            className="hidden size-8 shrink-0 place-items-center rounded-full bg-[var(--color-brand)] min-[400px]:grid font-[family-name:var(--font-heading)] text-[15px] font-semibold text-[var(--color-brand-foreground)] ring-1 ring-[color-mix(in_srgb,var(--color-brand-accent)_55%,transparent)] ring-offset-2 ring-offset-[var(--color-night)]"
          >
            {restaurantName.slice(0, 1)}
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-[family-name:var(--font-heading)] text-[16px] font-semibold">{restaurantName}</span>
            <span className="block truncate text-[12px] text-[var(--color-muted-ink)]">
              <AdminBreadcrumb restaurantSlug={restaurantSlug} compact />
            </span>
          </span>
        </div>
        <div className="hidden min-w-0 sm:block">
          <AdminBreadcrumb restaurantSlug={restaurantSlug} />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {branch}
        {showSoundToggle ? <SoundToggleButton /> : null}
      </div>
    </header>
  );
}
