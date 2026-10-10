"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSettledToast } from "@/components/admin/use-settled-toast";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { updateReservationStatusAction } from "@/app/r/[restaurantSlug]/admin/(dashboard)/reservations/actions";
import { RESERVATION_STATUSES, RESERVATION_STATUS_LABELS, type ReservationStatus } from "@/shared/contract/enums";

export function ReservationStatusControl({
  reservationId,
  currentStatus,
}: {
  reservationId: string;
  currentStatus: ReservationStatus;
}) {
  const [status, setStatus] = useState<ReservationStatus>(currentStatus);
  const [pending, startTransition] = useTransition();
  const later = useSettledToast(pending);

  function submit() {
    if (status === currentStatus) return;
    startTransition(async () => {
      const result = await updateReservationStatusAction({ reservationId, status });
      if (!result.success) {
        toast.error(result.error.message);
        setStatus(currentStatus);
        return;
      }
      // shown once the list shows the new status (useSettledToast); no client refresh: the action revalidates
      later(`Marked ${RESERVATION_STATUS_LABELS[status].toLowerCase()}.`);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={status}
        onChange={(event) => setStatus(event.target.value as ReservationStatus)}
        className="h-9 w-36 text-sm"
        aria-label="Reservation status"
        disabled={pending}
      >
        {RESERVATION_STATUSES.map((option) => (
          <option key={option} value={option}>
            {RESERVATION_STATUS_LABELS[option]}
          </option>
        ))}
      </Select>
      <Button size="sm" variant="outline" onClick={submit} disabled={pending || status === currentStatus}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Update"}
      </Button>
    </div>
  );
}
