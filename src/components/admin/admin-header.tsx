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
  mobileNav,
  branch,
  showSoundToggle = false,
}: {
  restaurantSlug: string;
  /** menu button for screens without the sidebar */
  mobileNav?: React.ReactNode;
  /** branch selector (owner/admin) or the member's own branch (read-only) */
  branch?: React.ReactNode;
  /** only staff who can see orders get the "new order" sound toggle */
  showSoundToggle?: boolean;
}) {
  // same height as the sidebar's brand block, so the two bottom rules line up
  return (
    <header className="tone-night sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-[var(--rule)] px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {mobileNav}
        <AdminBreadcrumb restaurantSlug={restaurantSlug} />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {branch}
        {showSoundToggle ? <SoundToggleButton /> : null}
      </div>
    </header>
  );
}
