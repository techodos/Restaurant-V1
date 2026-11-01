"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { sendContactMessageAction } from "@/app/(site)/[pageSlug]/actions";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Textarea } from "@/components/ui/input";

interface ContactFormProps {
  restaurantSlug: string;
}

/** Emails the message to the restaurant's inbox (server action); replies go to the sender's email. */
export function ContactForm({ restaurantSlug }: ContactFormProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") ?? "").trim(),
      phone: String(form.get("phone") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
      message: String(form.get("message") ?? "").trim(),
    };

    const nextErrors: Record<string, string> = {};
    if (payload.name.length < 2) nextErrors.name = "Please tell us your name.";
    if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) nextErrors.email = "That email address looks incomplete.";
    if (!payload.phone && !payload.email) nextErrors.phone = "Add a phone number or an email so we can reply.";
    if (payload.message.length < 10) nextErrors.message = "Please add a little more detail (10 characters minimum).";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    startTransition(async () => {
      const result = await sendContactMessageAction(restaurantSlug, payload);
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <div role="status" className="flex items-start gap-3 rounded-[var(--radius-panel)] bg-[var(--steel-1)] p-6 md:p-7">
        <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--color-success)]" />
        <div>
          <p className="font-semibold">Message sent</p>
          <p className="mt-1 text-sm text-[var(--color-muted-ink)]">Thank you. We will get back to you soon.</p>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="space-y-4 rounded-[var(--radius-panel)] bg-[var(--steel-1)] p-6 md:p-7"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`contact-name-${restaurantSlug}`}>Name</Label>
          <Input id={`contact-name-${restaurantSlug}`} name="name" autoComplete="name" aria-invalid={Boolean(errors.name)} required />
          <FieldError>{errors.name}</FieldError>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`contact-phone-${restaurantSlug}`}>Phone</Label>
          <Input id={`contact-phone-${restaurantSlug}`} name="phone" type="tel" autoComplete="tel" aria-invalid={Boolean(errors.phone)} />
          <FieldError>{errors.phone}</FieldError>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`contact-email-${restaurantSlug}`}>Email</Label>
        <Input id={`contact-email-${restaurantSlug}`} name="email" type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} />
        <FieldError>{errors.email}</FieldError>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`contact-message-${restaurantSlug}`}>Message</Label>
        <Textarea id={`contact-message-${restaurantSlug}`} name="message" rows={4} aria-invalid={Boolean(errors.message)} />
        <FieldError>{errors.message}</FieldError>
      </div>
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
        Send message
      </Button>
    </form>
  );
}
