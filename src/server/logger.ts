/**
 * Single logging seam for server code. Swap the body for a structured logger
 * (pino, Datadog, …) without touching callers. Client-facing errors never carry
 * what is logged here.
 */
type Scope = "db" | "action" | "storage" | "notifications" | "unexpected";

export const logger = {
  warn(scope: Scope, message: string, detail?: unknown): void {
    if (detail === undefined) console.warn(`[${scope}] ${message}`);
    else console.warn(`[${scope}] ${message}`, detail);
  },
  error(scope: Scope, message: string, detail?: unknown): void {
    if (detail === undefined) console.error(`[${scope}] ${message}`);
    else console.error(`[${scope}] ${message}`, detail);
  },
};
