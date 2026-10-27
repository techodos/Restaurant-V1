"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CONSENT_COOKIE, CONSENT_MAX_AGE, encodeConsent, type CookieConsent } from "@/shared/consent";
import { cn } from "@/shared/utils";

/**
 * Cookie consent, the way established sites ask (equal-weight "Accept all" / "Necessary only", a "Customize"
 * view with per-category switches, nothing optional pre-ticked, the choice kept ~6 months and changeable at
 * any time from "Cookie settings" in the footer). Strictly necessary cookies need no permission and keep
 * working either way; only the optional categories in `shared/consent.ts` wait for a yes.
 *
 * The layout reads the cookie on the server and passes it in, so a returning visitor never sees the banner
 * flash and a first-time visitor sees it on the very first paint.
 */
interface ConsentContextValue {
  /** null until the visitor has chosen */
  consent: CookieConsent | null;
  update: (choice: Omit<CookieConsent, "decidedAt">) => void;
  openSettings: () => void;
}

const ConsentContext = createContext<ConsentContextValue | null>(null);

/**
 * The consent state, or null outside the storefront (the admin is a staff tool and has no banner):
 * callers treat "no provider" as allowed.
 */
export function useCookieConsent(): ConsentContextValue | null {
  return useContext(ConsentContext);
}

function writeConsentCookie(consent: CookieConsent): void {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${encodeConsent(consent)}; path=/; max-age=${CONSENT_MAX_AGE}; samesite=lax${secure}`;
}

export function CookieConsentProvider({ initial, children }: { initial: CookieConsent | null; children: React.ReactNode }) {
  const [consent, setConsent] = useState<CookieConsent | null>(initial);
  const [panel, setPanel] = useState<"closed" | "banner" | "customize">(initial ? "closed" : "banner");

  const update = useCallback((choice: Omit<CookieConsent, "decidedAt">) => {
    const next = { ...choice, decidedAt: Date.now() };
    const withdrewMaps = consent?.maps === true && !next.maps;
    writeConsentCookie(next);
    setConsent(next);
    setPanel("closed");
    // a script already on the page cannot be unloaded: reload so Google Maps is really gone
    if (withdrewMaps && typeof window.google?.maps === "object") window.location.reload();
  }, [consent]);

  const openSettings = useCallback(() => setPanel("customize"), []);
  const value = useMemo(() => ({ consent, update, openSettings }), [consent, update, openSettings]);

  return (
    <ConsentContext.Provider value={value}>
      {children}
      {panel !== "closed" ? (
        <ConsentPanel
          mode={panel}
          current={consent}
          onCustomize={() => setPanel("customize")}
          onChoose={update}
          // closing without choosing only makes sense once a choice exists (from "Cookie settings")
          onClose={consent ? () => setPanel("closed") : undefined}
        />
      ) : null}
    </ConsentContext.Provider>
  );
}

/** "Cookie settings" for the footer: reopens the choices at any time. */
export function CookieSettingsButton({ className }: { className?: string }) {
  const consent = useCookieConsent();
  if (!consent) return null;
  return (
    <button type="button" onClick={consent.openSettings} className={className}>
      Cookie settings
    </button>
  );
}

function ConsentPanel({
  mode,
  current,
  onCustomize,
  onChoose,
  onClose,
}: {
  mode: "banner" | "customize";
  current: CookieConsent | null;
  onCustomize: () => void;
  onChoose: (choice: Omit<CookieConsent, "decidedAt">) => void;
  onClose?: () => void;
}) {
  const titleId = useId();
  const mapsId = useId();
  // optional categories start OFF (no pre-ticked boxes) unless the visitor already said yes
  const [maps, setMaps] = useState(current?.maps ?? false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // opened on purpose (footer link or "Customize"): move focus into it; the first-visit banner does not steal focus
  useEffect(() => {
    if (mode === "customize") headingRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    if (!onClose) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className={cn(
        "animate-overlay fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[60] max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain",
        "rounded-[var(--radius-panel)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-5 text-[var(--color-ink)] shadow-[var(--shadow-raised)]",
        "md:inset-x-auto md:left-6 md:bottom-6 md:w-[26rem] md:p-6",
      )}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--brand-tint)] text-[var(--color-brand)]">
          <Cookie className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <h2 id={titleId} ref={headingRef} tabIndex={-1} className="text-[1.15rem] leading-tight outline-none">
            {mode === "banner" ? "We value your privacy" : "Cookie settings"}
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--color-muted-ink)]">
            {mode === "banner"
              ? "We use essential cookies to keep you signed in and remember your cart. With your permission, we also use Google Maps to find your delivery address, which sets Google's own cookies."
              : "Choose which optional cookies we may use. You can change this at any time from “Cookie settings” at the bottom of every page."}{" "}
            <Link href="/privacy#cookies" className="font-medium text-[var(--color-ink)] underline underline-offset-4">
              Cookie policy
            </Link>
          </p>
        </div>
      </div>

      {mode === "customize" ? (
        <ul className="mt-4 divide-y divide-[var(--rule)] rounded-[var(--radius-card)] border border-[var(--rule)]">
          <li className="flex items-start justify-between gap-4 p-3.5">
            <div className="min-w-0">
              <p className="text-sm font-medium">Strictly necessary</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--color-muted-ink)]">
                Sign-in, your cart, your delivery location, orders placed on this device and security. The site cannot work without them.
              </p>
            </div>
            <span className="shrink-0 pt-0.5 text-[12.5px] font-medium text-[var(--color-muted-ink)]">Always on</span>
          </li>
          <li className="flex items-start justify-between gap-4 p-3.5">
            <div className="min-w-0">
              <label htmlFor={mapsId} className="text-sm font-medium">
                Google Maps
              </label>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--color-muted-ink)]">
                Address search and the map for placing your delivery pin. Google sets its own cookies. Without it you can still type your address or use your current location.
              </p>
            </div>
            <button
              id={mapsId}
              type="button"
              role="switch"
              aria-checked={maps}
              onClick={() => setMaps((value) => !value)}
              className={cn(
                "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200",
                maps ? "bg-[var(--color-brand)]" : "bg-[var(--rule-strong)]",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "size-5 rounded-full bg-white shadow transition-transform duration-200 motion-reduce:transition-none",
                  maps ? "translate-x-[22px]" : "translate-x-0.5",
                )}
              />
            </button>
          </li>
        </ul>
      ) : null}

      {/* the two answers carry equal weight; neither is the "easy" one */}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {mode === "banner" ? (
          <>
            <Button type="button" variant="outline" onClick={() => onChoose({ maps: false })}>
              Necessary only
            </Button>
            <Button type="button" onClick={() => onChoose({ maps: true })}>
              Accept all
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="outline" onClick={() => onChoose({ maps })}>
              Save choices
            </Button>
            <Button type="button" onClick={() => onChoose({ maps: true })}>
              Accept all
            </Button>
          </>
        )}
      </div>
      <div className="mt-2.5 flex justify-center gap-5 text-[13px]">
        {mode === "banner" ? (
          <button type="button" onClick={onCustomize} className="font-medium text-[var(--color-muted-ink)] underline underline-offset-4 hover:text-[var(--color-ink)]">
            Customize
          </button>
        ) : onClose ? (
          <button type="button" onClick={onClose} className="font-medium text-[var(--color-muted-ink)] underline underline-offset-4 hover:text-[var(--color-ink)]">
            Cancel
          </button>
        ) : null}
      </div>
    </section>
  );
}
