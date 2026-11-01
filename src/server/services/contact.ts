import { randomUUID } from "node:crypto";
import type { Restaurant } from "@/shared/contract/models";
import { errors } from "@/server/errors";
import { logger } from "@/server/logger";
import { escapeHtml } from "@/server/notifications/templates/layout";
import type { ContactMessageInput } from "@/server/validation/contact";
import { getEmailProvider } from "./notifications";

/**
 * Contact form: the message is emailed straight to the restaurant's inbox (replies go to the sender).
 * Nothing is stored. Without a configured email provider or inbox the caller gets a clear error instead of a
 * silent "sent".
 */
export async function sendContactMessage(restaurant: Pick<Restaurant, "name">, inbox: string | null, input: ContactMessageInput): Promise<void> {
  const provider = getEmailProvider();
  if (!provider || !inbox) throw errors.internal("We cannot take messages here right now. Please call or email us directly.");

  const rows: [string, string][] = [
    ["Name", input.name],
    ["Phone", input.phone || "-"],
    ["Email", input.email || "-"],
  ];
  const result = await provider.send({
    to: inbox,
    fromName: restaurant.name,
    replyTo: input.email || null,
    subject: `New message from ${input.name}`,
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1d1a16;">${rows
      .map(([label, value]) => `<p style="margin:0;"><strong>${label}:</strong> ${escapeHtml(value)}</p>`)
      .join("")}<p style="margin:16px 0 0;white-space:pre-wrap;">${escapeHtml(input.message)}</p></div>`,
    text: `${rows.map(([label, value]) => `${label}: ${value}`).join("\n")}\n\n${input.message}`,
    idempotencyKey: `contact-${randomUUID()}`,
  });
  if (!result.ok) {
    logger.error("notifications", `contact message to ${inbox} failed`, result.error);
    throw errors.internal("We could not send your message. Please try again in a moment.");
  }
}
