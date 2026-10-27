import { redirect } from "next/navigation";
import { isOrderTypeEnabled } from "@/shared/ordering";
import { normaliseTable } from "@/shared/dine-in";
import { requireStorefront, seatAtTable } from "@/web/storefront";
import { instanceRestaurantSlug } from "@/web/instance";

export const dynamic = "force-dynamic";

/**
 * Where a table's QR code points (admin → Locations → "Table QR codes"): seats this browser at that table of that
 * branch for the sitting, then opens the menu. A code for an unknown or inactive branch, a malformed table, or a
 * restaurant without dine-in just opens the menu.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ branchId: string; table: string }> }): Promise<never> {
  const { branchId, table } = await params;
  const context = await requireStorefront(instanceRestaurantSlug());
  const branch = context.locations.find((location) => location.id === branchId && location.isActive);
  let label: string | null = null;
  try {
    label = normaliseTable(decodeURIComponent(table));
  } catch {
    label = null;
  }
  if (branch && label && isOrderTypeEnabled(context.restaurant.features, "dine_in")) {
    await seatAtTable(context, { branchId: branch.id, table: label });
  }
  redirect("/menu");
}
