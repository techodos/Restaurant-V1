import type { Metadata } from "next";
import { adminPath } from "@/shared/utils";
import Link from "next/link";
import Form from "next/form";
import { ChevronRight, Search, Users } from "lucide-react";
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
import { Avatar, StatusPill, tableHead, tableRow } from "@/components/admin/admin-ui";
import { AdminStatusTabs } from "@/components/admin/admin-status-tabs";
import { instanceRestaurantSlug } from "@/web/instance";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Customers" };

interface CustomersPageProps {
  searchParams: Promise<{ q?: string; sort?: string; page?: string }>;
}

export default async function AdminCustomersPage({ searchParams }: CustomersPageProps) {
  const restaurantSlug = instanceRestaurantSlug();
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
    return `${adminPath()}/customers?${search.toString()}`;
  };

  const sortHref = (key: "recent" | "spend") =>
    `${adminPath()}/customers?${new URLSearchParams({ ...(q ? { q } : {}), sort: key }).toString()}`;
  const lastOrder = (value: string | null) =>
    value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "No orders yet";

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Customers" description={`${result.total} ${result.total === 1 ? "customer" : "customers"} in your directory`} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Form action={adminPath("/customers")} className="flex w-full gap-2 sm:max-w-md">
          <input type="hidden" name="sort" value={activeSort} />
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search customers</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted-ink)]" aria-hidden />
            <Input name="q" defaultValue={q ?? ""} placeholder="Search name, phone or email" className="h-11 pl-10" />
          </label>
          <Button type="submit" variant="secondary" className="h-11 shrink-0">
            Search
          </Button>
        </Form>
        {showTotals ? (
          <AdminStatusTabs
            label="Sort customers"
            options={[
              { key: "recent", label: "Recent" },
              { key: "spend", label: "Top spenders" },
            ]}
            active={activeSort}
            linkFor={sortHref}
          />
        ) : null}
      </div>

      {result.rows.length === 0 ? (
        <Card>
          <AdminEmptyState icon={Users} title={q ? "No customers match this search." : "No customers yet. They appear here after their first order or sign-up."} />
        </Card>
      ) : (
        <>
          {/* phones: one card per customer */}
          <ul className="grid gap-3 md:hidden">
            {result.rows.map((customer) => (
              <li key={customer.id}>
                <Link
                  href={`${adminPath()}/customers/${customer.id}`}
                  prefetch={false}
                  className="surface-card flex items-center gap-3.5 p-4 transition-shadow hover:shadow-[var(--admin-shadow-hover)]"
                >
                  <Avatar name={customer.fullName} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-[15px] font-semibold">{customer.fullName}</span>
                      {customer.isGuest ? <StatusPill tone="neutral">Guest</StatusPill> : null}
                      {customer.isBlocked ? <StatusPill tone="danger">Blocked</StatusPill> : null}
                    </span>
                    <span className="tabular block text-[13px] text-[var(--color-muted-ink)]">{customer.phone}</span>
                    <span className="tabular mt-1 block text-[12.5px] text-[var(--color-muted-ink)]">
                      {customer.lastOrderAt ? (
                        <>
                          {showTotals ? (
                            <>
                              <span className="font-semibold text-[var(--color-ink)]">{formatMoney(customer.totalSpent, { currency: restaurant.currency })}</span>
                              {` · ${customer.totalOrders} ${customer.totalOrders === 1 ? "order" : "orders"} · `}
                            </>
                          ) : "Last order "}
                          {lastOrder(customer.lastOrderAt)}
                        </>
                      ) : (
                        "No orders yet"
                      )}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-[var(--color-muted-ink)]" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>

          {/* tablets and up: the table */}
          <Card className="hidden overflow-hidden md:block">
            <div className="relative overflow-x-auto">
              <table className="tabular w-full min-w-[40rem] text-sm">
                <thead className={tableHead}>
                  <tr>
                    <th className="px-5 py-3">Customer</th>
                    {showTotals ? (
                      <>
                        <th className="px-5 py-3 text-right">Orders</th>
                        <th className="px-5 py-3 text-right">Total spent</th>
                      </>
                    ) : null}
                    <th className="px-5 py-3">Last order</th>
                    <th className="w-10 px-3 py-3"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--admin-line,var(--color-hairline))]">
                  {result.rows.map((customer) => (
                    <tr key={customer.id} className={`${tableRow} group relative`}>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar name={customer.fullName} className="size-9 text-[12px]" />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Link
                                href={`${adminPath()}/customers/${customer.id}`}
                                prefetch={false}
                                className="font-semibold text-[var(--color-ink)] after:absolute after:inset-0 group-hover:text-[var(--color-brand)]"
                              >
                                {customer.fullName}
                              </Link>
                              {customer.isGuest ? <StatusPill tone="neutral">Guest</StatusPill> : null}
                              {customer.isBlocked ? <StatusPill tone="danger">Blocked</StatusPill> : null}
                            </div>
                            <p className="text-xs text-[var(--color-muted-ink)]">{customer.phone}</p>
                          </div>
                        </div>
                      </td>
                      {showTotals ? (
                        <>
                          <td className="px-5 py-3.5 text-right">{customer.totalOrders}</td>
                          <td className="px-5 py-3.5 text-right font-semibold">{formatMoney(customer.totalSpent, { currency: restaurant.currency })}</td>
                        </>
                      ) : null}
                      <td className="px-5 py-3.5 text-[var(--color-muted-ink)]">{customer.lastOrderAt ? lastOrder(customer.lastOrderAt) : "—"}</td>
                      <td className="px-3 py-3.5 text-[var(--color-muted-ink)]">
                        <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <AdminPagination page={pageNum} totalPages={result.totalPages} linkFor={(page) => linkFor({ page })} />
    </div>
  );
}
