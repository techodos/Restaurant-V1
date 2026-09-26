/**
 * Uniform API/server-action contract.
 *   success: { success: true, data }
 *   failure: { success: false, error: { code, message, details? } }
 * Database errors are never forwarded to customers; they are mapped to codes.
 */

export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "CONFLICT",
  "RATE_LIMITED",
  "CART_EMPTY",
  "CART_EXPIRED",
  "ITEM_UNAVAILABLE",
  "VARIANT_REQUIRED",
  "VARIANT_INVALID",
  "ADDON_REQUIRED",
  "ADDON_INVALID",
  "ADDON_LIMIT",
  "MIN_ORDER_NOT_MET",
  "DELIVERY_UNAVAILABLE",
  "DELIVERY_ZONE_REQUIRED",
  "ORDERING_DISABLED",
  "COUPON_INVALID",
  "COUPON_EXPIRED",
  "COUPON_MIN_ORDER",
  "COUPON_USAGE_LIMIT",
  "COUPON_ORDER_TYPE",
  "RESERVATION_UNAVAILABLE",
  "RESERVATION_CLOSED",
  "RESERVATION_CAPACITY",
  "RESTAURANT_CLOSED",
  "PAYMENT_UNAVAILABLE",
  "PAYMENT_FAILED",
  "INVALID_STATUS_TRANSITION",
  "EMAIL_NOT_VERIFIED",
  "SIGN_IN_REQUIRED",
  "CART_TOKEN_TAKEN",
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export type ApiResult<T> = { success: true; data: T } | { success: false; error: ApiError };

export function ok<T>(data: T): ApiResult<T> {
  return { success: true, data };
}

export function fail<T = never>(code: ErrorCode, message: string, details?: Record<string, unknown>): ApiResult<T> {
  return { success: false, error: details ? { code, message, details } : { code, message } };
}

export interface Paginated<T> {
  rows: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function paginate<T>(rows: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return {
    rows,
    page,
    pageSize,
    total,
    totalPages: pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1,
  };
}

export const DEFAULT_PAGE_SIZE = 20;

export function parsePagination(searchParams: URLSearchParams | Record<string, string | undefined>): {
  page: number;
  pageSize: number;
  offset: number;
} {
  const get = (key: string): string | undefined =>
    searchParams instanceof URLSearchParams ? (searchParams.get(key) ?? undefined) : searchParams[key];

  const rawPage = Number.parseInt(get("page") ?? "1", 10);
  const rawSize = Number.parseInt(get("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize = Number.isFinite(rawSize) ? Math.min(Math.max(rawSize, 1), 100) : DEFAULT_PAGE_SIZE;
  return { page, pageSize, offset: (page - 1) * pageSize };
}
