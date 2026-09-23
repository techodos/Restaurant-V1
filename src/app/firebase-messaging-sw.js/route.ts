import { getPushClientConfig } from "@/server/services/notifications";

/**
 * Firebase Cloud Messaging service worker, served at the site root
 * (/firebase-messaging-sw.js) because that is the scope FCM registers.
 *
 * It is generated here so the public web-app config comes from server
 * configuration rather than being copied into a static file. Only the public
 * Firebase web config is included; server credentials never appear.
 *
 * This worker — not page code — displays every order notification. The Firebase
 * SDK's own push handler deliberately shows nothing whenever ANY window of this
 * origin is visible: it posts the payload to those windows and leaves the display
 * to page code. That is why notifications went missing on every page except the
 * order page (and on the order page itself as soon as the opt-in card unmounted,
 * which is exactly what happens when the order completes). Handling `push` here,
 * ahead of the SDK, gives the customer the same real system notification whether
 * the order page is in front of them, another page of the site is open, the tab is
 * in the background, or the browser is minimised.
 */

export const dynamic = "force-dynamic";

// gstatic hosts every release; pin to the version installed in package.json.
const FIREBASE_CDN = "https://www.gstatic.com/firebasejs/12.19.0";

export function GET(): Response {
  const firebase = getPushClientConfig();
  if (!firebase) return new Response("Push notifications are not configured.", { status: 404 });

  const script = `importScripts("${FIREBASE_CDN}/firebase-app-compat.js");
importScripts("${FIREBASE_CDN}/firebase-messaging-compat.js");

// Take over as soon as a changed worker is installed. Without this a new version sits in
// "waiting" until the last tab of the site is closed, so the previous worker keeps handling
// every push and a fix shipped here looks like it did nothing.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Registered ahead of the Firebase SDK on purpose: listeners run in registration order, so
// stopping the event here pre-empts the SDK's own push handler and this stays the one and only
// place a notification is displayed (no duplicates, nothing suppressed because a tab is visible).
self.addEventListener("push", (event) => {
  event.stopImmediatePropagation();
  let payload = null;
  try {
    payload = event.data ? event.data.json() : null;
  } catch (error) {
    payload = null;
  }
  if (!payload) return;

  const notification = payload.notification || {};
  const data = payload.data || {};
  const title = notification.title || data.title;
  if (!title) return;
  const fcmOptions = payload.fcmOptions || payload.fcm_options || {};
  const url = data.url || fcmOptions.link;
  const tag = notification.tag || (data.orderId && data.status ? "order-" + data.orderId + "-" + data.status : undefined);

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body: notification.body || data.body,
        tag: tag,
        data: { url: url, orderNumber: data.orderNumber, status: data.status },
      }),
      // Tell any open page of the app, so it can re-read the order. This is only a refresh hint:
      // the notification above is shown either way, whether or not a page is listening.
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
        for (const client of clients) client.postMessage({ type: "order-push", data: data });
      }),
    ]),
  );
});

firebase.initializeApp(${JSON.stringify({
    apiKey: firebase.apiKey,
    projectId: firebase.projectId,
    messagingSenderId: firebase.messagingSenderId,
    appId: firebase.appId,
  })});
// Still needed for token issuance and for pushsubscriptionchange (the SDK re-registers a rotated
// subscription with FCM). Its push handler never runs, because of the listener above.
try {
  firebase.messaging();
} catch (error) {
  // The worker must keep displaying pushes even if the SDK cannot start here.
}

self.addEventListener("notificationclick", (event) => {
  const url = event.notification.data && event.notification.data.url;
  event.notification.close();
  if (!url) return;
  const target = new URL(url, self.location.href);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        // Compare paths, not whole URLs: the link carries a one-order access token that a tab
        // already open on that order does not have, and an exact match would open a second tab.
        const open = new URL(client.url);
        if (open.origin === target.origin && open.pathname === target.pathname && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
`;

  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache",
      "Service-Worker-Allowed": "/",
    },
  });
}
