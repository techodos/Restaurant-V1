"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellRing, Share, SquarePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { registerPushTokenAction } from "@/app/r/[restaurantSlug]/order/actions";

/**
 * "Notify me about this order". Asks for browser permission only when the
 * customer clicks, fetches an FCM token, and hands it to the server, which
 * links it to the customer who placed the order.
 *
 * The Firebase web config is public by design and arrives as a prop from a
 * server component; no server credential is ever present in this bundle. The
 * Firebase SDK is loaded lazily, only when push is actually used.
 *
 * This component never displays a notification. The service worker
 * (app/firebase-messaging-sw.js/route.ts) shows every one of them, so the customer
 * gets the same system notification with this page open, on another page, or with
 * the browser minimised — and still gets it once this card has unmounted (it is
 * hidden for completed and cancelled orders, which are pushed too). All this page
 * does with a push is re-read the order.
 */

export interface FirebaseWebConfig {
  apiKey: string;
  projectId: string;
  messagingSenderId: string;
  appId: string;
  vapidKey: string;
}

interface PushOptInProps {
  restaurantSlug: string;
  orderNumber: string;
  /** signed link token, when the page was opened from an email */
  accessToken?: string;
  firebase: FirebaseWebConfig;
}

type State = "unsupported" | "ios-install" | "idle" | "working" | "enabled" | "blocked";

const SERVICE_WORKER_URL = "/firebase-messaging-sw.js";

function supported(): boolean {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}

/** iPhone/iPad, including iPadOS 13+ which reports as "Macintosh" but has touch support. */
function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/**
 * Launched from a Home Screen icon (manifest.webmanifest's `display: standalone`, or Apple's older
 * `navigator.standalone`). iOS only delivers Web Push to a page running in this mode — a normal Safari
 * tab never receives it, even after the permission prompt is accepted — so this gates the whole flow
 * on iOS regardless of what feature detection alone reports.
 */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

/**
 * Resolves once the registration has an active worker. `register()` resolves as soon as the
 * registration exists, and subscribing to push before the worker is activated throws.
 */
function activated(registration: ServiceWorkerRegistration): Promise<unknown> {
  if (registration.active) return Promise.resolve();
  const worker = registration.installing ?? registration.waiting;
  if (!worker) return navigator.serviceWorker.ready;
  return new Promise((resolve) => {
    const check = () => {
      if (worker.state === "activated" || worker.state === "redundant") resolve(undefined);
    };
    worker.addEventListener("statechange", check);
    check();
  });
}

export function PushOptIn({ restaurantSlug, orderNumber, accessToken, firebase }: PushOptInProps) {
  const router = useRouter();
  const [state, setState] = useState<State>("idle");
  // The config object is rebuilt by every server render, so depending on it directly would give
  // `connect` a new identity on each refresh: the effect below would re-register the worker and
  // re-issue a token on every status change. A ref keeps the latest values without that churn.
  const config = useRef(firebase);
  config.current = firebase;

  const connect = useCallback(async (): Promise<boolean> => {
    const [{ getApp, getApps, initializeApp }, { getMessaging, getToken }] = await Promise.all([
      import("firebase/app"),
      import("firebase/messaging"),
    ]);
    const { apiKey, projectId, messagingSenderId, appId, vapidKey } = config.current;
    const app = getApps().length ? getApp() : initializeApp({ apiKey, projectId, messagingSenderId, appId });
    const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL);
    // pushManager.subscribe() (inside getToken) needs an *activated* worker; register() can resolve
    // while it is still installing, which is what makes a first "Notify me" click fail.
    await activated(registration);
    const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: registration });
    if (!token) return false;

    const result = await registerPushTokenAction(restaurantSlug, { orderNumber, token, platform: "web", accessToken });
    if (!result.success) throw new Error(result.error.message);
    return true;
  }, [accessToken, orderNumber, restaurantSlug]);

  useEffect(() => {
    // iOS (16.4+) only delivers Web Push to a Home Screen app, never a normal Safari tab — checked
    // first because iOS can report Notification/PushManager as present in a plain tab without push
    // actually working there, which would otherwise pass the generic `supported()` check below.
    if (isIos() && !isStandalone()) {
      setState("ios-install");
      return;
    }
    if (!supported()) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("blocked");
      return;
    }
    if (Notification.permission !== "granted") return; // waits for the button
    // Already allowed earlier: quietly re-link this browser to this order's customer.
    let cancelled = false;
    connect()
      .then((ok) => !cancelled && setState(ok ? "enabled" : "idle"))
      .catch(() => !cancelled && setState("idle"));
    return () => {
      cancelled = true;
    };
  }, [connect]);

  useEffect(() => {
    // The worker posts this after it has shown the notification, so the page catches up even where
    // live updates (SSE) are unavailable. Independent of the subscription above: no push is ever
    // lost because this listener happened to be between a teardown and a re-subscribe.
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onWorkerMessage = (event: MessageEvent) => {
      const message = event.data as { type?: string; data?: { orderNumber?: string } } | null;
      if (message?.type === "order-push" && message.data?.orderNumber === orderNumber) router.refresh();
    };
    navigator.serviceWorker.addEventListener("message", onWorkerMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onWorkerMessage);
  }, [orderNumber, router]);

  async function enable() {
    setState("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "idle");
        if (permission === "denied") {
          toast.error("Notifications are blocked", { description: "Allow them in this browser's site settings to get order updates." });
        }
        return;
      }
      const ok = await connect();
      setState(ok ? "enabled" : "idle");
      if (ok) toast.success("Notifications on", { description: "We will let you know as your order progresses." });
      else toast.error("Could not turn on notifications on this device.");
    } catch {
      setState("idle");
      toast.error("Could not turn on notifications", { description: "Please try again in a moment." });
    }
  }

  if (state === "unsupported") return null;

  return (
    <section className="border-t border-[var(--rule)] pt-5">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        {state === "enabled" ? <BellRing className="size-4" aria-hidden /> : <Bell className="size-4" aria-hidden />}
        Order updates
      </h2>
      {state === "enabled" ? (
        <p className="mt-2 text-sm text-[var(--color-muted-ink)]">
          Notifications are on for this device. We will tell you when your order is being prepared, ready, on its way, and done.
        </p>
      ) : state === "ios-install" ? (
        <>
          <p className="mt-2 text-sm text-[var(--color-muted-ink)]">
            iPhone and iPad need this page added to your Home Screen before it can send order notifications.
          </p>
          <ol className="mt-3 space-y-2 text-sm text-[var(--color-muted-ink)]">
            <li className="flex items-center gap-2">
              <Share className="size-4 shrink-0" aria-hidden />
              Tap the Share button in Safari's toolbar
            </li>
            <li className="flex items-center gap-2">
              <SquarePlus className="size-4 shrink-0" aria-hidden />
              Choose "Add to Home Screen"
            </li>
            <li>Open this order from the new Home Screen icon, then tap "Notify me" there</li>
          </ol>
        </>
      ) : state === "blocked" ? (
        <p className="mt-2 text-sm text-[var(--color-muted-ink)]">
          Notifications are blocked in this browser. Allow them in the site settings to get order updates, or keep this page open.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-[var(--color-muted-ink)]">
            Get a notification when your order is prepared, ready, or on its way, even if you close this page.
          </p>
          <Button type="button" variant="outline" className="mt-4 w-full" onClick={enable} disabled={state === "working"}>
            {state === "working" ? "Turning on…" : "Notify me"}
          </Button>
        </>
      )}
    </section>
  );
}
