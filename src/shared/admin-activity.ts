/**
 * The admin's order poll (OrderActivityWatcher, every 7 s) sees new orders and status changes. Should the page the
 * staff member is on be re-rendered for them? Only screens that SHOW orders: the dashboard, the orders list, the
 * kitchen, and an order's own page when that order changed. Never menu/settings/staff/… screens, where a refresh
 * could reset what someone is typing.
 */
export function pageShowsActivity(pathname: string, adminRoot: string, changedOrderNumbers: readonly string[]): boolean {
  if (changedOrderNumbers.length === 0) return false;
  const path = pathname.replace(/\/+$/, "");
  if (path === adminRoot || path === `${adminRoot}/orders` || path === `${adminRoot}/kitchen`) return true;
  const detail = path.startsWith(`${adminRoot}/orders/`) ? decodeURIComponent(path.slice(`${adminRoot}/orders/`.length)) : null;
  return detail !== null && !detail.includes("/") && changedOrderNumbers.includes(detail);
}
