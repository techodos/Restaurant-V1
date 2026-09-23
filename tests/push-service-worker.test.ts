import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The generated Firebase service worker is what displays every order notification, so the
 * two properties this file pins are the whole fix:
 *
 *   1. our `push` listener is registered BEFORE `firebase.messaging()` and stops the event,
 *      otherwise the SDK's own handler takes over and shows nothing whenever any window of
 *      the site is visible (it posts the payload to page code instead);
 *   2. the worker takes over immediately (`skipWaiting` + `clients.claim`), otherwise a
 *      changed worker waits until the last tab is closed and the previous one keeps running.
 */

const PUSH_ENV = {
  FCM_PROJECT_ID: "demo-project",
  FCM_CLIENT_EMAIL: "svc@demo.iam.gserviceaccount.com",
  FCM_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----\n",
  NEXT_PUBLIC_FIREBASE_API_KEY: "web-api-key",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-project",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "1234567890",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:1234567890:web:abc",
  NEXT_PUBLIC_FIREBASE_VAPID_KEY: "vapid-public-key",
};

async function generate(env: Record<string, string | undefined>): Promise<Response> {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) vi.stubEnv(key, "");
    else vi.stubEnv(key, value);
  }
  const { GET } = await import("@/app/firebase-messaging-sw.js/route");
  return GET();
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllEnvs());

describe("generated push service worker", () => {
  it("handles the push event itself, ahead of the Firebase SDK", async () => {
    const script = await (await generate(PUSH_ENV)).text();

    const ourListener = script.indexOf('self.addEventListener("push"');
    const sdkStart = script.indexOf("firebase.messaging()");
    expect(ourListener).toBeGreaterThan(-1);
    expect(sdkStart).toBeGreaterThan(-1);
    // registration order decides which handler runs first
    expect(ourListener).toBeLessThan(sdkStart);
    expect(script).toContain("event.stopImmediatePropagation()");
    expect(script).toContain("self.registration.showNotification(");
  });

  it("is syntactically valid javascript", async () => {
    const script = await (await generate(PUSH_ENV)).text();
    // parsed, never run: the worker globals (self, firebase, importScripts) do not exist here.
    // A template literal is only checked by the browser otherwise, and a typo would silently
    // break registration for everyone.
    expect(() => new Function(script)).not.toThrow();
  });

  it("takes over from a previous worker at once", async () => {
    const script = await (await generate(PUSH_ENV)).text();
    expect(script).toContain("self.skipWaiting()");
    expect(script).toContain("self.clients.claim()");
  });

  it("tells open pages about the push and opens the order on click", async () => {
    const script = await (await generate(PUSH_ENV)).text();
    expect(script).toContain('client.postMessage({ type: "order-push"');
    expect(script).toContain('self.addEventListener("notificationclick"');
    // an already open tab has no access token in its URL, so paths are compared, not whole URLs
    expect(script).toContain("open.pathname === target.pathname");
  });

  it("carries only the public web config, never a server credential", async () => {
    const script = await (await generate(PUSH_ENV)).text();
    expect(script).toContain("web-api-key");
    expect(script).not.toContain("PRIVATE KEY");
    expect(script).not.toContain(PUSH_ENV.FCM_CLIENT_EMAIL);
    // the VAPID key belongs to the page (getToken), not to the worker
    expect(script).not.toContain("vapid-public-key");
  });

  it("is a javascript response scoped to the whole site", async () => {
    const response = await generate(PUSH_ENV);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("javascript");
    expect(response.headers.get("Service-Worker-Allowed")).toBe("/");
  });

  it("is not served when push is not configured", async () => {
    const response = await generate({ ...PUSH_ENV, FCM_PRIVATE_KEY: undefined });
    expect(response.status).toBe(404);
  });
});
