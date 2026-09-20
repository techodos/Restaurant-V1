/**
 * Single logging seam for server code. Swap the body for a structured logger
 * (pino, Datadog, …) without touching callers. Client-facing errors never carry
 * what is logged here.
 */
type Scope = "db" | "action" | "storage" | "unexpected";

export const logger = {
  error(scope: Scope, message: string, detail?: unknown): void {
    if (detail === undefined) console.error(`[${scope}] ${message}`);
    else console.error(`[${scope}] ${message}`, detail);
  },
};
