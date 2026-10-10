"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSettledToast } from "@/components/admin/use-settled-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { moderateReviewAction } from "@/app/r/[restaurantSlug]/admin/(dashboard)/reviews/actions";
import type { ReviewStatus } from "@/shared/contract/enums";

export function ReviewModerationControl({
  reviewId,
  status,
  isFeatured,
  response,
}: {
  reviewId: string;
  status: ReviewStatus;
  isFeatured: boolean;
  response: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [showReply, setShowReply] = useState(false);
  const [reply, setReply] = useState(response ?? "");
  const [featured, setFeatured] = useState(isFeatured);
  const later = useSettledToast(pending);

  function setStatus(next: ReviewStatus) {
    // no router.refresh(): the action revalidates /reviews, so its response already carries the updated list
    startTransition(async () => {
      const result = await moderateReviewAction({ reviewId, status: next });
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      later(next === "approved" ? "Review approved." : "Review rejected.");
    });
  }

  function saveReply(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await moderateReviewAction({ reviewId, response: reply, isFeatured: featured });
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      later("Saved.");
      setShowReply(false);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status !== "approved" ? (
          <Button size="sm" onClick={() => setStatus("approved")} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Approve
          </Button>
        ) : null}
        {status !== "rejected" ? (
          <Button size="sm" variant="outline" onClick={() => setStatus("rejected")} disabled={pending}>
            Reject
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => setShowReply((value) => !value)} disabled={pending}>
          {response ? "Edit reply" : "Reply"}
        </Button>
      </div>

      {showReply ? (
        <form onSubmit={saveReply} className="max-w-lg space-y-2">
          <Textarea
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            placeholder="Write a reply to this review..."
            rows={3}
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={featured} onChange={(event) => setFeatured(event.target.checked)} /> Featured
            </label>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Save"}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
