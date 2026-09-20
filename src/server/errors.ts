import { ZodError } from "zod";
import { fail, type ApiError, type ApiResult, type ErrorCode } from "@/shared/contract/api";
import { logger } from "./logger";

/**
 * Errors that are safe to show a customer. Anything else is logged server-side
 * and reported as a generic INTERNAL_ERROR so database details never leak.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;
  readonly status: number;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
    this.status = statusForCode(code);
  }
}

function statusForCode(code: ErrorCode): number {
  switch (code) {
    case "VALIDATION_ERROR":
      return 422;
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
      return 409;
    case "RATE_LIMITED":
      return 429;
    default:
      return 400;
  }
}

export const errors = {
  notFound: (what = "Resource") => new AppError("NOT_FOUND", `${what} not found.`),
  unauthorized: (message = "Please sign in to continue.") => new AppError("UNAUTHORIZED", message),
  forbidden: (message = "You do not have permission to do that.") => new AppError("FORBIDDEN", message),
  validation: (message = "Please check the highlighted fields.", details?: Record<string, unknown>) =>
    new AppError("VALIDATION_ERROR", message, details),
  conflict: (message: string, details?: Record<string, unknown>) => new AppError("CONFLICT", message, details),
  rateLimited: (message = "Too many attempts. Please try again shortly.") => new AppError("RATE_LIMITED", message),
  internal: (message = "Something went wrong on our side.") => new AppError("INTERNAL_ERROR", message),
  custom: (code: ErrorCode, message: string, details?: Record<string, unknown>) => new AppError(code, message, details),
};

interface PgLikeError {
  code?: string;
  constraint?: string;
  detail?: string;
  message: string;
}

function isPgError(error: unknown): error is PgLikeError {
  return typeof error === "object" && error !== null && typeof (error as PgLikeError).code === "string";
}

function mapPgError(error: PgLikeError): ApiError {
  switch (error.code) {
    case "23505":
      return { code: "CONFLICT", message: "That record already exists." };
    case "23503":
      return { code: "VALIDATION_ERROR", message: "A referenced record is missing or still in use." };
    case "23514":
    case "22P02":
      return { code: "VALIDATION_ERROR", message: "Some of the provided values are invalid." };
    case "23502":
      return { code: "VALIDATION_ERROR", message: "A required field was empty." };
    case "40001":
    case "40P01":
      return { code: "CONFLICT", message: "The request conflicted with another update. Please retry." };
    case "check_violation":
      return { code: "INVALID_STATUS_TRANSITION", message: "That status change is not allowed." };
    default:
      if (error.message?.includes("Invalid order status transition")) {
        return { code: "INVALID_STATUS_TRANSITION", message: "That status change is not allowed." };
      }
      return { code: "INTERNAL_ERROR", message: "Something went wrong on our side." };
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof AppError) {
    return { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) };
  }
  if (error instanceof ZodError) {
    const details: Record<string, unknown> = {};
    for (const issue of error.issues) {
      const key = issue.path.join(".") || "_";
      if (!details[key]) details[key] = issue.message;
    }
    return { code: "VALIDATION_ERROR", message: "Please check the highlighted fields.", details };
  }
  if (isPgError(error)) return mapPgError(error);
  if (error instanceof Error && /Invalid order status transition/i.test(error.message)) {
    return { code: "INVALID_STATUS_TRANSITION", message: "That status change is not allowed." };
  }
  return { code: "INTERNAL_ERROR", message: "Something went wrong on our side." };
}

/** Unexpected failures are logged with full detail here and reported to clients generically. */
function reportUnexpected(error: unknown, apiError: ApiError): void {
  if (apiError.code !== "INTERNAL_ERROR") return;
  logger.error(isPgError(error) ? "db" : "unexpected", error instanceof Error ? error.message : "non-error thrown", error);
}

/** Wrap a server action so it always returns the ApiResult contract. */
export async function action<T>(handler: () => Promise<T>): Promise<ApiResult<T>> {
  try {
    const data = await handler();
    return { success: true, data };
  } catch (error) {
    const apiError = toApiError(error);
    reportUnexpected(error, apiError);
    return fail(apiError.code, apiError.message, apiError.details);
  }
}

/** Route-handler JSON error response with the correct HTTP status. */
export function jsonError(error: unknown): { body: ApiResult<never>; status: number } {
  const apiError = toApiError(error);
  reportUnexpected(error, apiError);
  const status = error instanceof AppError ? error.status : apiError.code === "INTERNAL_ERROR" ? 500 : 400;
  return { body: { success: false, error: apiError }, status };
}
