import { getPushClientConfig } from "@/server/services/notifications";

/**
 * Firebase Cloud Messaging service worker, served at the site root
 * (/firebase-messaging-sw.js) because that is the scope FCM registers.
 *
 * It is generated here so the public web-app config comes from server
 * configuration rather than being copied into a static file. Only the public
 * Firebase web config is included; server credentials never appear.
 *
 * A push that carries a `notification` payload is displayed by the Firebase SDK,
 * and tapping it opens the `fcm_options.link` the server set (the order page).
 */

export const dynamic = "force-dynamic";

// gstatic hosts every release; pin to the version installed in package.json.
const FIREBASE_CDN = "https://www.gstatic.com/firebasejs/12.19.0";

export function GET(): Response {
  const firebase = getPushClientConfig();
  if (!firebase) return new Response("Push notifications are not configured.", { status: 404 });

  const script = `importScripts("${FIREBASE_CDN}/firebase-app-compat.js");
importScripts("${FIREBASE_CDN}/firebase-messaging-compat.js");
firebase.initializeApp(${JSON.stringify({
    apiKey: firebase.apiKey,
    projectId: firebase.projectId,
    messagingSenderId: firebase.messagingSenderId,
    appId: firebase.appId,
  })});
firebase.messaging();
`;

  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache",
      "Service-Worker-Allowed": "/",
    },
  });
}
