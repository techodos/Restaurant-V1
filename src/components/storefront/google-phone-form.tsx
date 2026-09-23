"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label, FieldError } from "@/components/ui/input";
import { PhoneInput } from "@/components/storefront/phone-input";
import { finishGoogleSignupAction } from "@/app/r/[restaurantSlug]/account/actions";

/** Last step of a first-time Google sign-in: `customers` requires a phone number Google never gives us. */
export function GooglePhoneForm({
  restaurantSlug,
  pendingToken,
  returnTo,
}: {
  restaurantSlug: string;
  pendingToken: string;
  returnTo: string | null;
}) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    const result = await finishGoogleSignupAction({ pendingToken, phone });
    setWorking(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    router.push(returnTo ?? `/r/${restaurantSlug}/account`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="google-phone">Phone number</Label>
        <PhoneInput id="google-phone" value={phone} onChange={setPhone} />
      </div>
      <FieldError>{error}</FieldError>
      <Button type="submit" className="w-full" disabled={working || !phone}>
        {working ? "Finishing…" : "Continue"}
      </Button>
    </form>
  );
}
