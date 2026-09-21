"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellRing } from "lucide-react";
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

type State = "unsupported" | "idle" | "working" | "enabled" | "blocked";

const SERVICE_WORKER_URL = "/firebase-messaging-sw.js";

function supported(): boolean {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}

export function PushOptIn({ restaurantSlug, orderNumber, accessToken, firebase }: PushOptInProps) {
  const router = useRouter();
  const [state, setState] = useState<State>("idle");
  const unsubscribe = useRef<(() => void) | null>(null);

  const connect = useCallback(async (): Promise<boolean> => {
    const [{ getApp, getApps, initializeApp }, { getMessaging, getToken, onMessage }] = await Promise.all([
      import("firebase/app"),
      import("firebase/messaging"),
    ]);
    const app = getApps().length
      ? getApp()
      : initializeApp({
          apiKey: firebase.apiKey,
          projectId: firebase.projectId,
          messagingSenderId: firebase.messagingSenderId,
          appId: firebase.appId,
        });
    const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL);
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: firebase.vapidKey, serviceWorkerRegistration: registration });
    if (!token) return false;

    const result = await registerPushTokenAction(restaurantSlug, { orderNumber, token, platform: "web", accessToken });
    if (!result.success) throw new Error(result.error.message);

    // While the page is open FCM does not show a system notification: surface it and refresh the live status.
    unsubscribe.current?.();
    unsubscribe.current = onMessage(messaging, (payload) => {
      const title = payload.notification?.title;
      if (title) toast(title, { description: payload.notification?.body });
      router.refresh();
    });
    return true;
  }, [accessToken, firebase, orderNumber, restaurantSlug, router]);

  useEffect(() => {
    if (!supported()) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("blocked");
      return;
    }
    // Already allowed earlier: quietly re-link this browser to this order's customer.
    if (Notification.permission === "granted") {
      connect()
        .then((ok) => setState(ok ? "enabled" : "idle"))
        .catch(() => setState("idle"));
    }
    return () => unsubscribe.current?.();
  }, [connect]);

  async function enable() {
    setState("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "idle");
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
    <section className="rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-6">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        {state === "enabled" ? <BellRing className="size-4" aria-hidden /> : <Bell className="size-4" aria-hidden />}
        Order updates
      </h2>
      {state === "enabled" ? (
        <p className="mt-2 text-sm text-[var(--color-muted-ink)]">
          Notifications are on for this device. We will tell you when your order is being prepared, ready, on its way, and done.
        </p>
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
