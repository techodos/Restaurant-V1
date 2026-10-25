import type { EmailMessage, EmailProvider, EmailResult } from "@/server/notifications/types";

/**
 * Emitlo transactional email over its REST API (no SDK, no extra dependency).
 * Server-only: the secret key never leaves this module. Only the documented
 * fields are sent; Emitlo's docs list no reply-to, plain-text or idempotency
 * field, so those are not sent (a retry after a lost response may duplicate).
 */

const ENDPOINT = "https://api.emitlo.com/api/v1/messages";
const TIMEOUT_MS = 20_000; // Emitlo is sometimes slow; a timeout is retried and it has no idempotency key, so avoid false timeouts

export interface EmitloOptions {
  secretKey: string;
  /** verified sender address; the display name comes from each message */
  fromAddress: string;
  /** send rate cap for this process */
  maxPerSecond?: number;
}

export function createEmitloProvider(options: EmitloOptions): EmailProvider {
  const interval = 1000 / Math.max(1, options.maxPerSecond ?? 2);
  let nextSlot = 0;
  /** Concurrent callers are handed consecutive send slots, so a burst is spread out instead of rejected with 429. */
  async function waitForSlot(): Promise<void> {
    const now = Date.now();
    const at = Math.max(now, nextSlot);
    nextSlot = at + interval;
    if (at > now) await new Promise((resolve) => setTimeout(resolve, at - now));
  }

  return {
    name: "emitlo",
    async send(message: EmailMessage): Promise<EmailResult> {
      await waitForSlot();
      let response: Response;
      try {
        response = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.secretKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
            // Emitlo sits behind Cloudflare, which challenges requests carrying Node's default agent ("Just a moment...").
            "User-Agent": "restaurant-platform/1.0 (+transactional-email)",
          },
          body: JSON.stringify({
            from_email: options.fromAddress,
            from_name: cleanName(message.fromName),
            to_email: message.to,
            subject: message.subject,
            body: message.html,
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        return { ok: false, retryable: true, error: `network: ${error instanceof Error ? error.message : "request failed"}` };
      }

      if (response.ok) {
        const body = (await response.json().catch(() => null)) as { data?: { message_id?: string } } | null;
        return { ok: true, id: body?.data?.message_id ?? null };
      }

      const detail = await response.text().catch(() => "");
      // a Cloudflare challenge page (HTML 403) is transient; a real 403 from Emitlo is JSON (e.g. DOMAIN_MISMATCH) and is final
      const retryable = response.status === 429 || response.status >= 500 || (response.status === 403 && /<html/i.test(detail));
      return { ok: false, retryable, error: `emitlo ${response.status}: ${detail.slice(0, 300)}` };
    },
  };
}

function cleanName(name: string): string {
  return name.replace(/[\r\n"<>]/g, " ").replace(/\s+/g, " ").trim() || "Restaurant";
}
