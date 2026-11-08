/**
 * The till's service worker (SKILL.md §43): makes /pos open with no connection. Generated route (like
 * app/firebase-messaging-sw.js) so it is served from /pos/sw.js with `Service-Worker-Allowed: /pos` — the till
 * registers it with scope "/pos" (the page itself has no trailing slash).
 *
 *   /pos page (navigation, RSC)   network first, cached copy when offline (only a 200 that was not a redirect, so
 *                                 a signed-out redirect is never cached as the till)
 *   /_next/static/*               cache first (content-hashed, immutable)
 *   /pos/api/*                    never cached: the till's data lives in IndexedDB, writes go through its queue
 */
const VERSION = "pos-shell-v1";

const script = `
const CACHE = ${JSON.stringify(VERSION)};

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(["/pos", "/pos/manifest.webmanifest"]).catch(() => undefined)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith("pos-shell-") && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && !response.redirected) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = (await cache.match(request, { ignoreVary: true })) || (fallbackUrl && (await cache.match(fallbackUrl)));
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/pos/api/")) return;
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  const isTill = url.pathname === "/pos" || url.pathname === "/pos/manifest.webmanifest";
  if (isTill || (request.mode === "navigate" && url.pathname.startsWith("/pos"))) {
    event.respondWith(networkFirst(request, request.mode === "navigate" ? "/pos" : null));
  }
});
`;

export function GET(): Response {
  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache",
      "Service-Worker-Allowed": "/pos",
    },
  });
}
