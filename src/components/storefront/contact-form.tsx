"use client";

import { useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label, Textarea } from "@/components/ui/input";

interface ContactFormProps {
  restaurantSlug: string;
  restaurantName: string;
}

/**
 * The contact section has no inbox of its own: rather than pretend to deliver an
 * email that never leaves the browser, the form hands the message to the
 * customer's own mail client and tells them so.
 */
export function ContactForm({ restaurantSlug, restaurantName }: ContactFormProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    const message = String(form.get("message") ?? "").trim();

    const nextErrors: Record<string, string> = {};
    if (name.length < 2) nextErrors.name = "Please tell us your name.";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nextErrors.email = "That email address looks incomplete.";
    if (!phone && !email) nextErrors.phone = "Add a phone number or an email so we can reply.";
    if (message.length < 10) nextErrors.message = "Please add a little more detail (10 characters minimum).";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    startTransition(() => {
      const body = [`Name: ${name}`, phone ? `Phone: ${phone}` : null, email ? `Email: ${email}` : null, "", message]
        .filter(Boolean)
        .join("\n");
      window.location.href = `mailto:?subject=${encodeURIComponent(`Message for ${restaurantName}`)}&body=${encodeURIComponent(body)}`;
      toast.success("Opening your email app", { description: "Attach anything you like before sending." });
    });
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
        <FieldHint>This opens your own email app — we do not store messages sent here.</FieldHint>
      </div>
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
        Send message
      </Button>
    </form>
  );
}
