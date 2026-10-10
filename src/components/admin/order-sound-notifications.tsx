"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePathname, useRouter } from "next/navigation";
import { adminPath } from "@/shared/utils";
import { pageShowsActivity } from "@/shared/admin-activity";

/**
 * Admin "new order" / "cancelled order" sound notifications. No SSE/LISTEN infra exists for a
 * multi-order staff feed (the one stream in this app is scoped to a single order, section 8 of the
 * skill) — this polls the same way KitchenAutoRefresh already does, just for "did anything change"
 * instead of a full page refresh, so it can run on every admin page, not only /kitchen.
 *
 * Two tones are synthesised with the Web Audio API (no bundled audio asset, no new dependency):
 * a short rising two-note chime for a new order, a single lower tone for a cancellation. Browsers
 * refuse to start an AudioContext before a user gesture on the page — the toggle button's click is
 * that gesture (it resumes/creates the context immediately), so sound "just works" once a staff
 * member has clicked anything on the page; before that, a poll that wants to play simply no-ops.
 */

const STORAGE_KEY = "rp_admin_sound_enabled";
const PREF_EVENT = "rp-admin-sound-pref";
const POLL_MS = 3_000;

function readPreference(): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === null ? true : raw === "1";
  } catch {
    return true;
  }
}

function writePreference(enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* private mode / storage blocked: preference just won't persist across reloads */
  }
  window.dispatchEvent(new CustomEvent(PREF_EVENT, { detail: enabled }));
}

/** Reads the sound on/off preference and stays in sync across every mounted instance in this tab. */
export function useSoundPreference(): [boolean, (value: boolean) => void] {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(readPreference());
    const onPref = (event: Event) => setEnabled(Boolean((event as CustomEvent<boolean>).detail));
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setEnabled(readPreference());
    };
    window.addEventListener(PREF_EVENT, onPref);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(PREF_EVENT, onPref);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return [enabled, (value: boolean) => writePreference(value)];
}

let sharedContext: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  sharedContext ??= new Ctor();
  return sharedContext;
}

/** A short, deliberately quiet tone sequence — notification, not an alarm. */
function playTones(notes: { freq: number; startMs: number; durationMs: number }[], volume = 0.16): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => undefined);
  const now = ctx.currentTime;
  for (const note of notes) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = note.freq;
    const start = now + note.startMs / 1000;
    const end = start + note.durationMs / 1000;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.015);
    gain.gain.linearRampToValueAtTime(0, end);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  }
}

export type ChimeKind = "new-order" | "cancelled";

/**
 * Exported so the toggle button can play a one-off confirmation tone when sound is turned on.
 * Each kind repeats a few times over ~2s (not a single quick blip) so it actually gets noticed on a
 * busy counter — alarm-like in cadence, but still two clean sine notes, not a harsh buzzer.
 */
export function playChime(kind: ChimeKind): void {
  if (kind === "new-order") {
    const pulse = (startMs: number) => [
      { freq: 740, startMs, durationMs: 140 },
      { freq: 988, startMs: startMs + 150, durationMs: 220 },
    ];
    playTones([...pulse(0), ...pulse(650), ...pulse(1300)]);
  } else {
    const pulse = (startMs: number) => [{ freq: 330, startMs, durationMs: 320 }];
    playTones([...pulse(0), ...pulse(600), ...pulse(1200)], 0.15);
  }
}

/** Bell icon in the admin header: on/off, persisted per browser (this is a device preference, not a restaurant setting). */
export function SoundToggleButton() {
  const [enabled, setEnabled] = useSoundPreference();
  return (
    <Button
      variant="outline"
      size="icon"
      className="size-9 rounded-[var(--radius-brand)] border-[var(--rule-strong)]"
      aria-pressed={enabled}
      aria-label={enabled ? "Order sound notifications on" : "Order sound notifications off"}
      title={enabled ? "Order sound notifications: on" : "Order sound notifications: off"}
      onClick={() => {
        const next = !enabled;
        setEnabled(next);
        if (next) playChime("new-order"); // the unlocking gesture + an audible confirmation it's on
      }}
    >
      {enabled ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
    </Button>
  );
}

const ACTIVITY_COUNT_EVENT = "rp-admin-order-activity-count";
let activityCount = 0;

function bumpActivityCount(by: number): void {
  activityCount += by;
  window.dispatchEvent(new CustomEvent(ACTIVITY_COUNT_EVENT, { detail: activityCount }));
}

/** Exported for nav links that land on an order screen — arriving there is as good as a tap on the banner. */
export function resetActivityCount(): void {
  if (activityCount === 0) return;
  activityCount = 0;
  window.dispatchEvent(new CustomEvent(ACTIVITY_COUNT_EVENT, { detail: 0 }));
}

/**
 * How many new/cancelled orders the poll has seen since the count was last reset (by visiting an
 * order screen or tapping the banner below) — unlike the sidebar's `activeOrders`, this is pure
 * client state from the same poll that plays the chime, so it never depends on a server re-render.
 */
export function useOrderActivityCount(): number {
  const [count, setCount] = useState(activityCount);
  useEffect(() => {
    setCount(activityCount);
    const onEvent = (event: Event) => setCount((event as CustomEvent<number>).detail);
    window.addEventListener(ACTIVITY_COUNT_EVENT, onEvent);
    return () => window.removeEventListener(ACTIVITY_COUNT_EVENT, onEvent);
  }, []);
  return count;
}

/**
 * The visible half of the fix: a staff member reported the chime playing while the order list stayed
 * stale until a manual reload. `router.refresh()` on its own background timer is what filled the list
 * before, and may just need a moment — this banner means they are never stuck guessing: it shows the
 * count the instant the poll sees it (independent of any refresh), and tapping it forces a fresh
 * render right now, from a real click rather than an interval. Drop it near the top of any admin page.
 */
export function OrderActivityBanner() {
  const count = useOrderActivityCount();
  const router = useRouter();
  if (count === 0) return null;
  return (
    <button
      type="button"
      onClick={() => {
        resetActivityCount();
        router.refresh();
      }}
      className="press mb-4 flex w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-brand-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-accent-foreground)]"
    >
      <Bell className="size-4" aria-hidden />
      {count} new order{count === 1 ? "" : "s"} — tap to refresh
    </button>
  );
}

/**
 * Mounted once (admin dashboard layout) so it watches every page, not just /orders. Polls a small
 * JSON endpoint rather than router.refresh() so it never re-renders whatever page the staff member is
 * actually looking at. A brand-new order plays the "new order" chime; any row that is now `cancelled`
 * plays the cancellation chime — once each, tracked by the server's own clock (`now` in the response)
 * so clock skew can't replay or skip events.
 *
 * `since` lags the server's reported `now` by `CURSOR_SAFETY_MARGIN_MS` instead of using it exactly.
 * Reproduced 2026-10-10 against the live dev DB: `createOrder` is a multi-statement transaction that
 * can take over a second to commit on the hosted pooler, and its `updated_at` is stamped by `now()` at
 * transaction START, not at COMMIT (when the row actually becomes visible to other sessions). A poll
 * whose query ran while that transaction was still open correctly saw nothing, then advanced its cursor
 * past that row's timestamp anyway — permanently excluding it from every later poll (no duplicate, no
 * retry, nothing). The chime depends on the same cursor, so that poll's "new order" sound and the list
 * update were both silently lost together, matching the reported "sound plays, order never appears"
 * exactly. A trailing margin re-checks the last few seconds on every poll, so a row that lands in that
 * window is seen again rather than skipped — a duplicate chime/refresh is harmless (see "No
 * duplicate/repeat sounds" below for why a genuine repeat still can't happen), a silent loss is not.
 */
const CURSOR_SAFETY_MARGIN_MS = 5_000;

export function OrderActivityWatcher({ restaurantSlug }: { restaurantSlug: string }) {
  const [enabled] = useSoundPreference();
  const sinceRef = useRef<string>(new Date().toISOString());
  const seenRef = useRef<Set<string>>(new Set());
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const router = useRouter();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  const poll = useCallback(async () => {
    try {
      const url = `${adminPath(restaurantSlug, "/orders/activity")}?since=${encodeURIComponent(sinceRef.current)}`;
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) return;
      const body = await response.json();
      if (!body?.success) return;
      const { now, events } = body.data as { now: string; events: { orderNumber: string; status: string; isNew: boolean }[] };
      // dedupe across the safety-margin re-check: `id` would be tighter, but orderNumber+status already
      // can't legitimately repeat for the kinds of event this plays a sound for (a cancelled order stays
      // cancelled; a brand-new order's `isNew` row is only ever seen once since its own updated_at never
      // repeats a "pending, isNew" row) — so a key the seen-set naturally caps in size without needing ids.
      const fresh = events.filter((event) => {
        const key = `${event.orderNumber}:${event.status}:${event.isNew}`;
        if (seenRef.current.has(key)) return false;
        seenRef.current.add(key);
        return true;
      });
      if (seenRef.current.size > 200) seenRef.current.clear(); // bounded: this is dedupe, not an audit log
      if (enabledRef.current) {
        for (const event of fresh) {
          if (event.status === "cancelled") playChime("cancelled");
          else if (event.isNew) playChime("new-order");
        }
      }
      sinceRef.current = new Date(Math.max(0, Date.parse(now) - CURSOR_SAFETY_MARGIN_MS)).toISOString();
      const notable = fresh.filter((event) => event.isNew || event.status === "cancelled");
      // the sound alone left the list stale until a manual reload: re-render the page when it shows these
      // orders (dashboard, orders list, kitchen, that order's page) — never on forms like menu or settings
      if (pageShowsActivity(pathRef.current, adminPath(restaurantSlug), fresh.map((event) => event.orderNumber))) {
        router.refresh();
      }
      // kept separate from the refresh above: the banner stays up until a staff member actually taps it,
      // since a background router.refresh() succeeding is not guaranteed to be visible the moment it happens
      if (notable.length > 0) bumpActivityCount(notable.length);
    } catch {
      /* a missed poll just means the next one covers a wider window; nothing to recover */
    }
  }, [restaurantSlug, router]);

  useEffect(() => {
    const timer = setInterval(poll, POLL_MS);
    return () => clearInterval(timer);
  }, [poll]);

  return null;
}
