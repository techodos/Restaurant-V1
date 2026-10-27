import type { Metadata } from "next";
import Link from "next/link";
import { getLocationsForAdmin } from "@/server/services/restaurants";
import { config } from "@/server/config";
import { memberBranch } from "@/server/auth/branch-scope";
import { getAdminRestaurant } from "@/web/admin";
import { requireAdminPage } from "@/web/session";
import { instanceRestaurantSlug } from "@/web/instance";
import { adminPath } from "@/shared/utils";
import { normaliseTable } from "@/shared/dine-in";
import { isOrderTypeEnabled } from "@/shared/ordering";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { TableLinks } from "@/components/admin/table-links";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Table QR codes" };

/**
 * One link per table for dine-in ordering at the table (`/table/<branchId>/<table>`, see shared/dine-in.ts): print
 * them as QR codes and put one on each table. Scanning seats the guest's phone at that table for the sitting.
 * `?branch=<id>&tables=1-20` or `?tables=T1,T2,Terrace 3`. Branch staff see their own branch only.
 */
export default async function TableQrPage({ searchParams }: { searchParams: Promise<{ branch?: string; tables?: string }> }) {
  const restaurantSlug = instanceRestaurantSlug();
  const actor = await requireAdminPage("locations.view", restaurantSlug);
  const restaurant = await getAdminRestaurant(restaurantSlug);
  const own = memberBranch(actor);
  const branches = (await getLocationsForAdmin(restaurant.id, { userId: actor.userId, actor: actor.name })).filter(
    (location) => location.isActive && (own === null || location.id === own),
  );
  const params = await searchParams;
  const branch = branches.find((location) => location.id === params.branch) ?? branches[0] ?? null;
  const tablesInput = params.tables ?? "1-12";
  const tables = parseTables(tablesInput);
  const site = config.app.siteUrl;

  return (
    <div className="qr-page space-y-6">
      <AdminPageHeader
        className="print:hidden"
        title="Table QR codes"
        description="Put one on each table: guests scan it, order from the menu, and the order arrives with their table number."
        backHref={adminPath("/locations")}
        backLabel="Locations"
      />
      {!isOrderTypeEnabled(restaurant.features, "dine_in") ? (
        // a scanned code only seats a guest while dine-in is on (the /table route checks the same)
        <p className="text-sm text-[var(--color-muted-ink)]">
          Dine-in is switched off, so table QR codes would only open the menu. Turn on Dine-in in{" "}
          <Link href={adminPath("/settings")} className="underline">
            Settings
          </Link>{" "}
          to use them.
        </p>
      ) : branch ? (
        <TableLinks
          branches={branches.map((location) => ({ id: location.id, name: location.name }))}
          branchId={branch.id}
          tablesInput={tablesInput}
          links={tables.map((table) => ({ table, url: `${site}/table/${branch.id}/${encodeURIComponent(table)}` }))}
        />
      ) : (
        <p className="text-sm text-[var(--color-muted-ink)]">
          No active branch yet.{" "}
          <Link href={adminPath("/locations")} className="underline">
            Add one in Locations
          </Link>
          .
        </p>
      )}
    </div>
  );
}

/** "1-20" or "T1, T2, Terrace 3" (or a mix): at most 200 tables, invalid labels dropped, duplicates removed. */
function parseTables(input: string): string[] {
  const out = new Set<string>();
  for (const part of input.split(",")) {
    const range = /^\s*(\d{1,3})\s*-\s*(\d{1,3})\s*$/.exec(part);
    if (range) {
      for (let n = Number(range[1]); n <= Number(range[2]) && out.size < 200; n++) out.add(String(n));
      continue;
    }
    const label = normaliseTable(part);
    if (label && out.size < 200) out.add(label);
  }
  return [...out];
}
