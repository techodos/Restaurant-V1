/**
 * Cookie consent: what a visitor allowed beyond the strictly necessary cookies (sign-in, cart, delivery
 * location, guest order access, security), which work without asking. Pure and isomorphic: the browser writes
 * the cookie (components/storefront/cookie-consent.tsx), the layout reads it (web/cookies.ts) so the banner is
 * decided on the server and never flashes.
 *
 * The only optional category today is Google Maps (address search + map at checkout and in the address book),
 * which loads Google's scripts and lets Google set its own cookies. Add a category here only for something that
 * really exists, and bump CONSENT_VERSION so everyone is asked again.
 */
export const CONSENT_COOKIE = "rp_consent";
export const CONSENT_VERSION = 1;
/** about six months, then the visitor is asked again (the usual regulator guidance for how long a choice lasts) */
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 182;

export interface CookieConsent {
  maps: boolean;
  /** when the choice was made (ms since epoch) */
  decidedAt: number;
}

/** `<version>.<maps 0|1>.<seconds>`: short, and cookie-safe without escaping */
export function encodeConsent(consent: CookieConsent): string {
  return `${CONSENT_VERSION}.${consent.maps ? 1 : 0}.${Math.floor(consent.decidedAt / 1000)}`;
}

/** null = never asked, an older version, or anything unreadable: the banner asks (again) */
export function decodeConsent(raw: string | null | undefined): CookieConsent | null {
  const match = /^(\d+)\.([01])\.(\d{1,12})$/.exec(raw ?? "");
  if (!match || Number(match[1]) !== CONSENT_VERSION) return null;
  return { maps: match[2] === "1", decidedAt: Number(match[3]) * 1000 };
}
