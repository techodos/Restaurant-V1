import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Google Sign-In via the OAuth2 authorization-code flow (no server-side SDK; `jose`,
 * already a dependency for our own JWTs, verifies the returned id_token against
 * Google's published keys). Server-only: the client secret never reaches the browser.
 */

export interface GoogleOAuthOptions {
  clientId: string;
  clientSecret: string;
}

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const TIMEOUT_MS = 10_000;

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function googleJwks() {
  jwks ??= createRemoteJWKSet(new URL(JWKS_URL));
  return jwks;
}

export function buildGoogleAuthUrl(options: GoogleOAuthOptions & { redirectUri: string; state: string }): string {
  const params = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: options.state,
    prompt: "select_account",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

/** Exchanges an authorization code for a verified Google identity. Throws on any failure. */
export async function resolveGoogleIdentity(
  options: GoogleOAuthOptions & { code: string; redirectUri: string },
): Promise<GoogleIdentity> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: options.code,
      client_id: options.clientId,
      client_secret: options.clientSecret,
      redirect_uri: options.redirectUri,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`google token exchange ${response.status}`);
  const body = (await response.json()) as { id_token?: string };
  if (!body.id_token) throw new Error("google response had no id_token");

  const { payload } = await jwtVerify(body.id_token, googleJwks(), { audience: options.clientId });
  if (typeof payload.iss !== "string" || !ISSUERS.has(payload.iss)) throw new Error("unexpected token issuer");
  if (typeof payload.sub !== "string" || typeof payload.email !== "string") throw new Error("incomplete google identity");

  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : payload.email,
  };
}
