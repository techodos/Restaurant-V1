import { SignJWT, importPKCS8 } from "jose";
import type { PushMessage, PushOutcome, PushProvider } from "@/server/notifications/types";

/**
 * Firebase Cloud Messaging via the HTTP v1 API, authenticated with a service
 * account (OAuth2 JWT bearer flow). No firebase-admin dependency. Server-only:
 * the private key is read by config and never reaches the browser.
 */

export interface FcmOptions {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TIMEOUT_MS = 10_000;

interface CachedToken {
  value: string;
  expiresAt: number;
}

export function createFcmProvider(options: FcmOptions): PushProvider {
  let cached: CachedToken | null = null;
  let inflight: Promise<string> | null = null;

  /** Cached OAuth token; concurrent callers share one request instead of each fetching their own. */
  function accessToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && cached && cached.expiresAt > Date.now() + 60_000) return Promise.resolve(cached.value);
    inflight ??= fetchAccessToken().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  async function fetchAccessToken(): Promise<string> {
    const key = await importPKCS8(options.privateKey, "RS256");
    const assertion = await new SignJWT({ scope: SCOPE })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(options.clientEmail)
      .setSubject(options.clientEmail)
      .setAudience(TOKEN_URL)
      .setIssuedAt()
      .setExpirationTime("55m")
      .sign(key);

    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`fcm auth ${response.status}`);
    const body = (await response.json()) as { access_token: string; expires_in?: number };
    cached = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return cached.value;
  }

  async function sendOne(token: string, message: PushMessage, retryAuth = true): Promise<PushOutcome> {
    let bearer: string;
    try {
      bearer = await accessToken(!retryAuth);
    } catch (error) {
      return { token, ok: false, invalidToken: false, retryable: true, error: errorText(error) };
    }

    let response: Response;
    try {
      response = await fetch(`https://fcm.googleapis.com/v1/projects/${options.projectId}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: message.title, body: message.body },
            data: message.data,
            webpush: {
              fcm_options: { link: message.link },
              ...(message.dedupeKey ? { notification: { tag: message.dedupeKey } } : {}),
            },
          },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      return { token, ok: false, invalidToken: false, retryable: true, error: `network: ${errorText(error)}` };
    }

    if (response.ok) return { token, ok: true };

    // An expired OAuth token: refresh once and try again.
    if (response.status === 401 && retryAuth) {
      cached = null;
      return sendOne(token, message, false);
    }

    const body = (await response.json().catch(() => null)) as FcmErrorBody | null;
    const code = body?.error?.details?.find((detail) => detail.errorCode)?.errorCode ?? body?.error?.status ?? "";
    const text = `fcm ${response.status} ${code}: ${(body?.error?.message ?? "").slice(0, 200)}`;

    // UNREGISTERED / bad registration token: the device will never receive pushes again.
    const invalidToken =
      response.status === 404 ||
      code === "UNREGISTERED" ||
      (response.status === 400 && /registration token/i.test(body?.error?.message ?? ""));
    if (invalidToken) return { token, ok: false, invalidToken: true, retryable: false, error: text };

    return { token, ok: false, invalidToken: false, retryable: response.status === 429 || response.status >= 500, error: text };
  }

  return {
    name: "fcm",
    async send(tokens, message) {
      return Promise.all(tokens.map((token) => sendOne(token, message)));
    },
  };
}

interface FcmErrorBody {
  error?: { status?: string; message?: string; details?: { errorCode?: string }[] };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}
