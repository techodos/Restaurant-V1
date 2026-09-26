import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every change that makes the DB trigger queue a notification (placing an order, booking a table, staff
 * changing an order or reservation status) must drain the outbox right away with dispatchDueNotifications,
 * or the email / push waits for the scheduler. Guards against a new action forgetting it.
 */
const QUEUEING_CALLS = /\b(placeOrder|bookTable|changeOrderStatus|changeReservationStatus)\(/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("notification dispatch wiring", () => {
  const offenders = files(join(__dirname, "..", "src", "app"))
    .map((path) => ({ path, source: readFileSync(path, "utf8") }))
    .filter(({ source }) => QUEUEING_CALLS.test(source));

  it("finds the queueing actions", () => {
    expect(offenders.length).toBeGreaterThanOrEqual(4);
  });

  it.each(offenders.map(({ path }) => [path]))("%s dispatches immediately after the change", (path) => {
    const source = readFileSync(path, "utf8");
    expect(source).toMatch(/after\(\(\) => dispatchDueNotifications\(/);
  });
});
