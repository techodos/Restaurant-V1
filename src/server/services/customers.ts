import type { Customer, OrderSummary } from "@/shared/contract/models";
import type { Paginated } from "@/shared/contract/api";
import type { RequestContext } from "@/server/context";
import { getCustomerById, getCustomerStats, listCustomers, type CustomerListFilters } from "@/server/repositories/customers";
import { listCustomerOrders } from "@/server/repositories/orders";

/** Staff-facing customer directory (admin, view only). */
export function listCustomersForAdmin(
  restaurantId: string,
  filters: CustomerListFilters,
  ctx: RequestContext,
): Promise<Paginated<Customer>> {
  return listCustomers(restaurantId, filters, ctx);
}

export function getCustomerForAdmin(customerId: string, ctx: RequestContext): Promise<Customer | null> {
  return getCustomerById(customerId, ctx);
}

// Customers are restaurant-wide records; their orders are branch data, so stats and history take the
// admin's branch scope (null = every branch).
export function getCustomerStatsForAdmin(
  customerId: string,
  ctx: RequestContext,
  locationId: string | null = null,
): Promise<{ orders: number; spent: string; averageOrderValue: string; lastOrderAt: string | null }> {
  return getCustomerStats(customerId, ctx, locationId);
}

export function getCustomerOrderHistory(customerId: string, ctx: RequestContext, limit = 20, locationId: string | null = null): Promise<OrderSummary[]> {
  return listCustomerOrders(customerId, ctx, limit, locationId);
}
