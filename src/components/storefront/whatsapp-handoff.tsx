"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, ChevronDown, Clock, Copy, Loader2, MessageCircle, Phone, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ReorderButton } from "@/components/storefront/reorder-button";
import { confirmWhatsAppSentAction } from "@/app/(site)/order/actions";
import type { WhatsAppStage } from "@/shared/whatsapp-order";

/**
 * WhatsApp checkout tracking (no Business API: wa.me reports nothing back, so "sent" is the customer's own answer).
 *
 * - awaiting: the order is saved; WhatsApp opens once right after checkout (`autoOpen`). When the customer comes back
 *   (tab visible again, or the page reloads after the hand-off) the card asks "Did you press Send?" — "Yes" records it
 *   (`confirmWhatsAppSentAction`), "Not yet" re-opens WhatsApp. A countdown shows the send window.
 * - sent: what really tracks the order is the WhatsApp chat → "Open chat" / "Call", plus a staff status line if an
 *   agent ever moved it in the admin.
 * - not_sent: never confirmed within the window (or replaced by a newer order) → "Order again".
 * - cancelled: cancelled after it was sent.
 */
/** phones: one full-width button per row (labels never wrap inside a Button, so they need the room) */
const fullOnPhone = "w-full sm:w-auto";

export function WhatsAppHandoff({
  restaurantSlug,
  orderNumber,
  accessToken,
  restaurantName,
  restaurantPhone,
  link,
  chatLink,
  message,
  autoOpen,
  stage,
  deadline,
  staffStatus,
}: {
  restaurantSlug: string;
  orderNumber: string;
  accessToken?: string;
  restaurantName: string;
  restaurantPhone: string | null;
  link: string | null;
  chatLink: string | null;
  message: string;
  autoOpen: boolean;
  stage: WhatsAppStage;
  /** ISO end of the send window (awaiting only) */
  deadline: string;
  /** e.g. "Ready" when staff moved the order on in the admin; null otherwise */
  staffStatus: string | null;
}) {
  const router = useRouter();
  const handoffKey = `wa-handoff:${orderNumber}`;
  const [asking, setAsking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showMessage, setShowMessage] = useState(false);
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const remember = () => {
    try {
      window.sessionStorage.setItem(handoffKey, "1");
    } catch {
      // storage blocked: the visibility listener below still asks once they come back to this tab
    }
  };
  const handedOff = () => {
    try {
      return window.sessionStorage.getItem(handoffKey) === "1";
    } catch {
      return false;
    }
  };

  // awaiting: auto-open once after checkout, and ask "did you send it?" whenever they come back from WhatsApp
  useEffect(() => {
    if (stage !== "awaiting") return;
    let timer: number | undefined;
    if (autoOpen) {
      const url = new URL(window.location.href);
      url.searchParams.delete("wa"); // a refresh/share of this URL never re-triggers the hand-off
      window.history.replaceState(window.history.state, "", url.toString());
      if (link && !handedOff()) {
        remember();
        timer = window.setTimeout(() => {
          window.location.href = link;
        }, 700);
      }
    } else if (handedOff()) {
      setAsking(true); // the page was reloaded after going to WhatsApp
    }
    const onReturn = () => {
      if (document.visibilityState === "visible" && handedOff()) setAsking(true);
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("pageshow", onReturn); // back/forward cache restore on phones
    return () => {
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("pageshow", onReturn);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, autoOpen, link]);

  // awaiting: countdown to the end of the send window; at zero the server decides it was not sent
  useEffect(() => {
    if (stage !== "awaiting") return;
    const end = new Date(deadline).getTime();
    const tick = () => {
      const left = Math.ceil((end - Date.now()) / 60_000);
      setMinutesLeft(Math.max(0, left));
      if (left <= 0) router.refresh();
    };
    tick();
    const id = window.setInterval(tick, 20_000);
    return () => window.clearInterval(id);
  }, [stage, deadline, router]);

  function confirmSent() {
    startTransition(async () => {
      const result = await confirmWhatsAppSentAction(restaurantSlug, orderNumber, accessToken);
      if (!result.success) {
        toast.error(result.error.message);
        router.refresh();
        return;
      }
      try {
        window.sessionStorage.removeItem(handoffKey);
      } catch {
        // nothing to clean up
      }
      router.refresh();
    });
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setShowMessage(true);
      toast.error("Couldn't copy automatically", { description: "Select the message below and copy it." });
    }
  }

  const callButton = restaurantPhone ? (
    <Button asChild size="lg" variant="outline" className={fullOnPhone}>
      <a href={`tel:${restaurantPhone.replace(/\s+/g, "")}`}>
        <Phone aria-hidden />
        Call {restaurantName}
      </a>
    </Button>
  ) : null;
  const waButton = "bg-[#1fa855] text-white hover:bg-[#178a45]";

  if (stage === "sent") {
    return (
      <Card tone="success" icon={<CheckCircle2 className="size-6" />} title={`Sent to ${restaurantName} on WhatsApp`}>
        <p>They&apos;ll confirm the time and total in your WhatsApp chat. Updates about this order happen there.</p>
        {staffStatus ? (
          <p className="mt-2 font-medium text-[var(--color-ink)]">Restaurant update: {staffStatus}</p>
        ) : null}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {chatLink ? (
            <Button asChild size="lg" className={`${fullOnPhone} ${waButton}`}>
              <a href={chatLink} target="_blank" rel="noopener noreferrer">
                <MessageCircle aria-hidden />
                Open chat with {restaurantName}
              </a>
            </Button>
          ) : null}
          {callButton}
        </div>
      </Card>
    );
  }

  if (stage === "not_sent" || stage === "cancelled") {
    return (
      <Card tone="muted" icon={<XCircle className="size-6" />} title={stage === "not_sent" ? "This order was not sent" : "This order was cancelled"}>
        <p>
          {stage === "not_sent"
            ? `It wasn't sent to ${restaurantName} on WhatsApp in time, so it was not placed. Nothing was charged.`
            : `${restaurantName} or you cancelled this order.`}
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <ReorderButton restaurantSlug={restaurantSlug} orderNumber={orderNumber} accessToken={accessToken} />
          {stage === "cancelled" && chatLink ? (
            <Button asChild size="lg" variant="outline" className={fullOnPhone}>
              <a href={chatLink} target="_blank" rel="noopener noreferrer">
                <MessageCircle aria-hidden />
                Message {restaurantName}
              </a>
            </Button>
          ) : null}
        </div>
      </Card>
    );
  }

  // awaiting
  if (asking) {
    return (
      <Card tone="whatsapp" icon={<MessageCircle className="size-6" />} title="Did you press Send in WhatsApp?">
        <p>{restaurantName} only receives your order once you send the message. Let us know so we can track it for you.</p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Button type="button" size="lg" className={`${fullOnPhone} ${waButton}`} onClick={confirmSent} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
            Yes, I sent it
          </Button>
          {link ? (
            <Button asChild size="lg" variant="outline" className={fullOnPhone}>
              <a href={link} target="_blank" rel="noopener noreferrer" onClick={() => remember()}>
                <MessageCircle aria-hidden />
                Not yet, open WhatsApp
              </a>
            </Button>
          ) : null}
        </div>
        {minutesLeft !== null ? <Countdown minutes={minutesLeft} /> : null}
      </Card>
    );
  }

  return (
    <Card
      tone="whatsapp"
      icon={<MessageCircle className="size-6" />}
      title={link ? "Last step: send your order on WhatsApp" : "Your order is saved"}
    >
      <p>
        {link
          ? `Your order is saved. Press Send in WhatsApp so ${restaurantName} receives it — they'll confirm the time and total in the chat.`
          : `${restaurantName} hasn't set up WhatsApp yet. Please call them with your order number ${orderNumber}.`}
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {link ? (
          <Button asChild size="lg" className={`${fullOnPhone} ${waButton}`}>
            <a href={link} target="_blank" rel="noopener noreferrer" onClick={() => remember()}>
              <MessageCircle aria-hidden />
              Send order on WhatsApp
            </a>
          </Button>
        ) : (
          callButton
        )}
        <Button type="button" size="lg" variant="outline" className={fullOnPhone} onClick={copyMessage}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Copied" : "Copy order message"}
        </Button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        {minutesLeft !== null ? <Countdown minutes={minutesLeft} /> : null}
        {link ? (
          <button
            type="button"
            onClick={() => setAsking(true)}
            className="rounded-sm text-sm font-medium text-[var(--color-ink)] underline decoration-1 underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand)]"
          >
            I&apos;ve already sent it
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setShowMessage((value) => !value)}
          aria-expanded={showMessage}
          className="inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-[var(--color-muted-ink)] hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand)]"
        >
          <ChevronDown className={`size-4 transition-transform motion-reduce:transition-none ${showMessage ? "rotate-180" : ""}`} aria-hidden />
          {showMessage ? "Hide message" : "See the message"}
        </button>
      </div>
      {showMessage ? (
        <pre className="mt-3 max-h-80 select-all overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-brand)] bg-[var(--color-surface)] p-4 font-[family-name:var(--font-sans)] text-[13px] leading-relaxed text-[var(--color-ink)]">
          {message}
        </pre>
      ) : null}
    </Card>
  );
}

function Countdown({ minutes }: { minutes: number }) {
  return (
    <p className="mt-4 inline-flex items-center gap-1.5 text-sm text-[var(--color-muted-ink)]" role="status">
      <Clock className="size-4" aria-hidden />
      {minutes > 0 ? `Send within ${minutes} min, or the order lapses.` : "Time's up — checking…"}
    </p>
  );
}

function Card({
  tone,
  icon,
  title,
  children,
}: {
  tone: "whatsapp" | "success" | "muted";
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  const ring =
    tone === "muted"
      ? "border-[var(--rule)] bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)]"
      : "border-[color-mix(in_srgb,#25D366_45%,var(--rule))] bg-[color-mix(in_srgb,#25D366_9%,transparent)]";
  const badge = tone === "muted" ? "bg-[var(--steel-2,#6b7280)] text-white" : "bg-[#25D366] text-white";
  return (
    <section aria-label={title} className={`mt-6 rounded-[calc(var(--radius-brand)+6px)] border p-4 sm:p-5 md:p-6 ${ring}`}>
      <div className="flex items-center gap-3 sm:items-start sm:gap-3.5">
        <span className={`grid size-10 shrink-0 place-items-center rounded-full sm:size-11 ${badge}`} aria-hidden>
          {icon}
        </span>
        <h2 className="min-w-0 text-lg font-semibold leading-snug sm:pt-2">{title}</h2>
      </div>
      {/* phones: full card width under the icon; from sm: lined up with the title */}
      <div className="mt-3 min-w-0 text-[15px] text-[var(--color-muted-ink)] sm:mt-1 sm:pl-[3.625rem]">{children}</div>
    </section>
  );
}
