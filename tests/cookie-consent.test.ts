import { describe, expect, it } from "vitest";
import { CONSENT_VERSION, decodeConsent, encodeConsent } from "@/shared/consent";

/** The cookie-consent record (shared/consent.ts): what the server reads to decide whether to ask. DB-free. */
describe("cookie consent cookie", () => {
  it("round-trips a choice (to the second)", () => {
    const decidedAt = Date.UTC(2026, 9, 27, 10, 30, 15);
    expect(decodeConsent(encodeConsent({ maps: true, decidedAt }))).toEqual({ maps: true, decidedAt });
    expect(decodeConsent(encodeConsent({ maps: false, decidedAt: decidedAt + 999 }))).toEqual({ maps: false, decidedAt });
  });

  it("asks again when there is no choice, an unreadable one, or one made under an older version", () => {
    expect(decodeConsent(undefined)).toBeNull();
    expect(decodeConsent("")).toBeNull();
    expect(decodeConsent("yes")).toBeNull();
    expect(decodeConsent(`${CONSENT_VERSION}.2.1700000000`)).toBeNull(); // not 0/1
    expect(decodeConsent(`${CONSENT_VERSION - 1}.1.1700000000`)).toBeNull();
    expect(decodeConsent(`${CONSENT_VERSION}.1.1700000000;maps=1`)).toBeNull();
  });

  it("never treats a missing optional category as allowed", () => {
    expect(decodeConsent(`${CONSENT_VERSION}.0.1700000000`)?.maps).toBe(false);
  });
});
