import type { Metadata } from "next";
import { adminPath } from "@/shared/utils";
import Link from "next/link";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listCustomersForAdmin } from "@/server/services/customers";
import { formatMoney } from "@/shared/money";
import { getAdminRestaurant } from "@/web/admin";
import { requireAdminPage } from "@/web/session";
import { isRestaurantWide } from "@/server/auth/branch-scope";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { StatusPill, tableHead } from "@/components/admin/admin-ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Customers" };

interface CustomersPageProps {
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{ q?: string; sort?: string; page?: string }>;
}

export default async function AdminCustomersPage({ params, searchParams }: CustomersPageProps) {
  const { restaurantSlug } = await params;
  const actor = await requireAdminPage("customers.view", restaurantSlug);
  const restaurant = await getAdminRestaurant(restaurantSlug);
  const { q, sort, page } = await searchParams;
  // customers are restaurant-wide records, but their lifetime order count and spend add up every branch:
  // branch staff get the directory without them (their branch's figures are on the customer's page)
  const showTotals = isRestaurantWide(actor);
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

  const pageNum = Number.parseInt(page ?? "1", 10) || 1;
  const activeSort = sort === "spend" && showTotals ? "spend" : "recent";

  const result = await listCustomersForAdmin(restaurant.id, { search: q, sort: activeSort, page: pageNum, pageSize: 20 }, ctx);

  const linkFor = (params: { page?: number }) => {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    search.set("sort", activeSort);
    if (params.page && params.page > 1) search.set("page", String(params.page));
    return `${adminPath(restaurantSlug)}/customers?${search.toString()}`;
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Customers" description={`${result.total} total`} />

      <div className="flex flex-wrap items-center gap-3">
        <form action={adminPath(restaurantSlug, "/customers")} className="flex max-w-md flex-1 gap-2">
          <input type="hidden" name="sort" value={activeSort} />
          <Input name="q" defaultValue={q ?? ""} placeholder="Search name, phone or email" />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
        {showTotals ? (
        <div className="flex gap-2 text-sm">
          <Link
            href={`${adminPath(restaurantSlug)}/customers?${new URLSearchParams({ ...(q ? { q } : {}), sort: "recent" }).toString()}`}
            className={activeSort === "recent" ? "font-medium text-[var(--color-brand)]" : "text-[var(--color-muted-ink)]"}
          >
            Recent
          </Link>
          <span className="text-[var(--color-hairline)]">·</span>
          <Link
            href={`${adminPath(restaurantSlug)}/customers?${new URLSearchParams({ ...(q ? { q } : {}), sort: "spend" }).toString()}`}
            className={activeSort === "spend" ? "font-medium text-[var(--color-brand)]" : "text-[var(--color-muted-ink)]"}
          >
            Top spenders
          </Link>
        </div>
        ) : null}
      </div>

      <Card className="overflow-hidden">
        {result.rows.length === 0 ? (
          <AdminEmptyState icon={Users} title="No customers match this search." />
        ) : (
          <div className="overflow-x-auto"><table className="tabular w-full min-w-[42rem] text-sm">
            <thead className={tableHead}>
              <tr>
                <th className="px-4 py-3 font-medium">Customer</th>
                {showTotals ? (
                  <>
                    <th className="px-4 py-3 font-medium">Orders</th>
                    <th className="px-4 py-3 font-medium">Total spent</th>
                  </>
                ) : null}
                <th className="px-4 py-3 font-medium">Last order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-hairline)]">
              {result.rows.map((customer) => (
                <tr key={customer.id} className="hover:bg-[color-mix(in_srgb,var(--color-ink)_3%,transparent)]">
                  <td className="px-4 py-3">
                    <Link href={`${adminPath(restaurantSlug)}/customers/${customer.id}`} className="font-medium text-[var(--color-brand)] hover:underline">
                      {customer.fullName}
                    </Link>
                    <p className="text-xs text-[var(--color-muted-ink)]">{customer.phone}</p>
                    <div className="mt-1 flex gap-1.5">
                      {customer.isGuest ? <StatusPill tone="neutral">Guest</StatusPill> : null}
                      {customer.isBlocked ? <StatusPill tone="danger">Blocked</StatusPill> : null}
                    </div>
                  </td>
                  {showTotals ? (
                    <>
                      <td className="px-4 py-3">{customer.totalOrders}</td>
                      <td className="px-4 py-3 font-medium">{formatMoney(customer.totalSpent, { currency: restaurant.currency })}</td>
                    </>
                  ) : null}
                  <td className="px-4 py-3 text-[var(--color-muted-ink)]">
                    {customer.lastOrderAt
                      ? new Date(customer.lastOrderAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>

      <AdminPagination page={pageNum} totalPages={result.totalPages} linkFor={(page) => linkFor({ page })} />
    </div>
  );
}
