import type { EmailMessage, EmailProvider, EmailResult } from "@/server/notifications/types";

/**
 * Resend transactional email over its REST API (no SDK, no extra dependency).
 * Server-only: the API key never leaves this module. The `Idempotency-Key`
 * header makes Resend drop a repeat of the same send, so a retry after a lost
 * response cannot produce a second email.
 */

const ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

export interface ResendOptions {
  apiKey: string;
  /** verified sender address; the display name comes from each message */
  fromAddress: string;
  /** send rate cap for this process (Resend's default account limit is 2 requests/second) */
  maxPerSecond?: number;
}

export function createResendProvider(options: ResendOptions): EmailProvider {
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
    name: "resend",
    async send(message: EmailMessage): Promise<EmailResult> {
      await waitForSlot();
      const from = `${sanitizeName(message.fromName)} <${options.fromAddress}>`;
      let response: Response;
      try {
        response = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": message.idempotencyKey,
          },
          body: JSON.stringify({
            from,
            to: [message.to],
            reply_to: message.replyTo || undefined,
            subject: message.subject,
            html: message.html,
            text: message.text,
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        return { ok: false, retryable: true, error: `network: ${error instanceof Error ? error.message : "request failed"}` };
      }

      if (response.ok) {
        const body = (await response.json().catch(() => null)) as { id?: string } | null;
        return { ok: true, id: body?.id ?? null };
      }

      const detail = await response.text().catch(() => "");
      const retryable = response.status === 429 || response.status >= 500;
      return { ok: false, retryable, error: `resend ${response.status}: ${detail.slice(0, 300)}` };
    },
  };
}

/** Display names cannot contain quotes, angle brackets or line breaks. */
function sanitizeName(name: string): string {
  const cleaned = name.replace(/[\r\n"<>]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? `"${cleaned}"` : '"Restaurant"';
}
