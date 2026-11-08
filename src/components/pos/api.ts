"use client";

/** Calls to the till's own routes (/pos/api/*). Never throws: offline and HTTP errors come back as `ok: false`. */
export type PosApiResult<T> = { ok: true; data: T } | { ok: false; status: number; code: string; message: string };

export async function posApi<T>(path: string, body?: unknown): Promise<PosApiResult<T>> {
  try {
    const response = await fetch(`/pos/api/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as
      | { success: true; data: T }
      | { success: false; error: { code: string; message: string } }
      | null;
    if (payload?.success) return { ok: true, data: payload.data };
    return {
      ok: false,
      status: response.status,
      code: payload && !payload.success ? payload.error.code : "HTTP_ERROR",
      message: payload && !payload.success ? payload.error.message : `The server answered ${response.status}.`,
    };
  } catch {
    return { ok: false, status: 0, code: "OFFLINE", message: "No connection. Try again when the till is back online." };
  }
}
