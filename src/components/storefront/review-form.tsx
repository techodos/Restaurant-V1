"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label, Textarea } from "@/components/ui/input";
import { submitReviewAction } from "@/app/r/[restaurantSlug]/reviews/actions";
import { cn } from "@/shared/utils";

interface ReviewFormProps {
  restaurantSlug: string;
  orderNumber: string;
  /** signed order-access token from the email link, when present */
  accessToken?: string;
  defaultName: string;
}

/** Reviews always enter the moderation queue before they appear publicly. */
export function ReviewForm({ restaurantSlug, orderNumber, accessToken, defaultName }: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (done) {
    return (
      <div className="rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-6">
        <h2 className="text-lg font-semibold">Thank you</h2>
        <p className="mt-2 text-sm text-[var(--color-muted-ink)]">
          Your review is with the restaurant for moderation. It will appear on this page once approved.
        </p>
      </div>
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "").trim();

    const payload = {
      orderNumber,
      accessToken,
      authorName: value("authorName"),
      rating,
      title: value("title"),
      comment: value("comment"),
    };

    const nextErrors: Record<string, string> = {};
    if (!rating) nextErrors.rating = "Please pick a rating from 1 to 5.";
    if (payload.authorName.length < 2) nextErrors.authorName = "Please enter your name.";
    if (payload.comment.length < 10) nextErrors.comment = "Please add a few words (10 characters minimum).";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    startTransition(async () => {
      const result = await submitReviewAction(restaurantSlug, payload);
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      setDone(true);
      toast.success("Review submitted", { description: "It will appear once the restaurant approves it." });
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4 rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-6">
      <div>
        <h2 className="text-lg font-semibold">Review order {orderNumber}</h2>
        <p className="mt-1 text-sm text-[var(--color-muted-ink)]">
          Reviews are published after a quick moderation check.
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Your rating</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              aria-label={`${value} star${value === 1 ? "" : "s"}`}
              aria-pressed={rating >= value}
              onClick={() => setRating(value)}
              className="grid size-10 place-items-center"
            >
              <Star
                className={cn(
                  "size-6 transition-colors",
                  rating >= value ? "fill-[var(--color-brand-accent)] text-[var(--color-brand-accent)]" : "text-[var(--color-hairline)]",
                )}
                aria-hidden
              />
            </button>
          ))}
        </div>
        <FieldError>{errors.rating}</FieldError>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="authorName">Name shown publicly</Label>
        <Input id="authorName" name="authorName" defaultValue={defaultName} required />
        <FieldError>{errors.authorName}</FieldError>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="title">Headline (optional)</Label>
        <Input id="title" name="title" maxLength={120} placeholder="Great pizza, quick delivery" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="comment">Your review</Label>
        <Textarea id="comment" name="comment" rows={4} maxLength={1200} required />
        <FieldError>{errors.comment}</FieldError>
        <FieldHint>Please keep it about the food and the service.</FieldHint>
      </div>

      <Button type="submit" disabled={pending}>
        <Send aria-hidden />
        Submit review
      </Button>
    </form>
  );
}
