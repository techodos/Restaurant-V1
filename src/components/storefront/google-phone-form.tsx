"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthLabel, AuthMessage, AuthSubmit } from "@/components/storefront/auth-fields";
import { PhoneInput } from "@/components/storefront/phone-input";
import { finishGoogleSignupAction } from "@/app/(site)/account/actions";
import { afterAuthPath } from "@/shared/return-to";

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
    if (!result.success) {
      setWorking(false);
      setError(result.error.message);
      return;
    }
    // the action set the session cookie, so Next already refreshed the tree: no router.refresh()
    router.replace(afterAuthPath(returnTo));
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <AuthLabel htmlFor="google-phone">Mobile number</AuthLabel>
        <PhoneInput
          id="google-phone"
          value={phone}
          onChange={(value) => {
            setPhone(value);
            setError(null);
          }}
          fieldClassName="auth-field h-[54px] rounded-[14px] text-[16px] sm:text-[16px]"
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? "google-phone-message" : undefined}
        />
        <AuthMessage id="google-phone-message">{error}</AuthMessage>
      </div>
      <AuthSubmit working={working} workingLabel="Finishing…" disabled={!phone}>
        Continue
      </AuthSubmit>
    </form>
  );
}
