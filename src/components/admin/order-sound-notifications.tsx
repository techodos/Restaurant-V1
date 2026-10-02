"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminPath } from "@/shared/utils";

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
const POLL_MS = 7_000;

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
      aria-pressed={enabled}
      aria-label={enabled ? "Order sound notifications on" : "Order sound notifications off"}
      title={enabled ? "Order sound notifications: on" : "Order sound notifications: off"}
      onClick={() => {
        const next = !enabled;
        setEnabled(next);
        if (next) playChime("new-order"); // the unlocking gesture + an audible confirmation it's on
      }}
    >
      {enabled ? <Bell className="size-4" aria-hidden /> : <BellOff className="size-4" aria-hidden />}
    </Button>
  );
}

/**
 * Mounted once (admin dashboard layout) so it watches every page, not just /orders. Polls a small
 * JSON endpoint rather than router.refresh() (KitchenAutoRefresh's approach) so it never re-renders
 * whatever page the staff member is actually looking at. A brand-new order (created_at === updated_at)
 * plays the "new order" chime; any row that is now `cancelled` plays the cancellation chime — once each,
 * tracked by the server's own clock (`now` in the response) so clock skew can't replay or skip events.
 */
export function OrderActivityWatcher({ restaurantSlug }: { restaurantSlug: string }) {
  const [enabled] = useSoundPreference();
  const sinceRef = useRef<string>(new Date().toISOString());
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const poll = useCallback(async () => {
    try {
      const url = `${adminPath(restaurantSlug, "/orders/activity")}?since=${encodeURIComponent(sinceRef.current)}`;
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) return;
      const body = await response.json();
      if (!body?.success) return;
      const { now, events } = body.data as { now: string; events: { status: string; isNew: boolean }[] };
      if (enabledRef.current) {
        for (const event of events) {
          if (event.status === "cancelled") playChime("cancelled");
          else if (event.isNew) playChime("new-order");
        }
      }
      sinceRef.current = now;
    } catch {
      /* a missed poll just means the next one covers a wider window; nothing to recover */
    }
  }, [restaurantSlug]);

  useEffect(() => {
    const timer = setInterval(poll, POLL_MS);
    return () => clearInterval(timer);
  }, [poll]);

  return null;
}
