import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Layer boundaries (see docs/skills/restaurant-platform/SKILL.md). These are what keep the backend
 * extractable and the database swappable, so they fail the build when crossed:
 *
 *   app / components → web → server/services → server/repositories → server/db
 *   shared            ← usable from every layer, imports nothing but itself
 */

const SRC = path.resolve(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

function importsOf(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const specifiers = new Set<string>();
  for (const match of text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) specifiers.add(match[1]!);
  return [...specifiers];
}

function inDir(dir: string): string[] {
  return sourceFiles(path.join(SRC, dir));
}

function rel(file: string): string {
  return path.relative(SRC, file).replace(/\\/g, "/");
}

function violations(files: string[], forbidden: RegExp): string[] {
  return files.flatMap((file) => importsOf(file).filter((spec) => forbidden.test(spec)).map((spec) => `${rel(file)} imports ${spec}`));
}

const FRAMEWORK = /^(next|react|react-dom)(\/|$)/;

describe("architecture boundaries", () => {
  it("keeps server/ free of framework and UI code so it can move to a standalone backend", () => {
    expect(violations(inDir("server"), new RegExp(`${FRAMEWORK.source}|^@/(web|components|app)(/|$)`))).toEqual([]);
  });

  it("keeps shared/ free of server, framework and UI code", () => {
    expect(violations(inDir("shared"), new RegExp(`${FRAMEWORK.source}|^@/(server|web|components|app)(/|$)`))).toEqual([]);
  });

  it("lets pages and components reach data only through services", () => {
    const ui = [...inDir("app"), ...inDir("components")];
    expect(violations(ui, /^@\/server\/(repositories|db|context|auth\/(auth-service|tokens))(\/|$)/)).toEqual([]);
  });

  it("keeps SQL and connection handling out of services and domain code", () => {
    const files = [...inDir("server/services"), ...inDir("server/domain")];
    expect(violations(files, /^@\/server\/db(\/|$)|^pg$/)).toEqual([]);
  });

  it("creates connection pools in exactly one place", () => {
    const creators = sourceFiles(SRC)
      .filter((file) => /new Pool\(/.test(readFileSync(file, "utf8")))
      .map(rel);
    expect(creators).toEqual(["server/db/database.ts"]);
  });

  it("reads process.env only inside the config module", () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => !rel(file).startsWith("server/config/"))
      .filter((file) => /process\.env/.test(readFileSync(file, "utf8")))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("keeps provider credentials and provider code out of client components", () => {
    // Client components get the public Firebase config as a prop; they never touch config or integrations.
    const offenders = violations(inDir("components"), /^@\/server\/(config|integrations|notifications|services\/notifications)(\/|$)/);
    expect(offenders).toEqual([]);
  });

  it("mentions server secret names only inside the config module and the example env file", () => {
    const secrets = /RESEND_API_KEY|FCM_PRIVATE_KEY|FCM_CLIENT_EMAIL|NOTIFICATIONS_DISPATCH_SECRET/;
    const offenders = sourceFiles(SRC)
      .filter((file) => !rel(file).startsWith("server/config/"))
      .filter((file) => secrets.test(readFileSync(file, "utf8")))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("keeps the order flow decoupled from notification providers", () => {
    // Order/checkout code may not import Resend/FCM or the notification service; delivery runs from the outbox.
    const orderFlow = ["server/services/checkout.ts", "server/services/cart.ts", "server/repositories/orders.ts"].map((file) =>
      path.join(SRC, file),
    );
    expect(violations(orderFlow, /^@\/server\/(integrations\/(resend|fcm)|notifications|services\/notifications)(\/|$)/)).toEqual([]);
  });
});
