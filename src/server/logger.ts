/**
 * Single logging seam for server code. Swap the body for a structured logger
 * (pino, Datadog, …) without touching callers. Client-facing errors never carry
 * what is logged here.
 */
type Scope = "db" | "action" | "storage" | "cache" | "notifications" | "payments" | "unexpected";

export const logger = {
  info(scope: Scope, message: string, detail?: Record<string, unknown>): void {
    if (detail === undefined) console.info(`[${scope}] ${message}`);
    else console.info(`[${scope}] ${message}`, detail);
  },
  warn(scope: Scope, message: string, detail?: unknown): void {
    if (detail === undefined) console.warn(`[${scope}] ${message}`);
    else console.warn(`[${scope}] ${message}`, detail);
  },
  error(scope: Scope, message: string, detail?: unknown): void {
    if (detail === undefined) console.error(`[${scope}] ${message}`);
    else console.error(`[${scope}] ${message}`, detail);
  },
};
