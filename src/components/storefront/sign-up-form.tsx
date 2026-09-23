"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { PhoneInput } from "@/components/storefront/phone-input";
import { VerifyEmailForm } from "@/components/storefront/verify-email-form";
import { signUpAction } from "@/app/r/[restaurantSlug]/account/actions";

interface SignUpFormProps {
  restaurantSlug: string;
  googleEnabled: boolean;
  /** Provided when embedded in a modal: called instead of navigating to /account. */
  onAuthenticated?: () => void;
  /** Embedded in a modal next to a "Sign in" tab switch instead of a page link. */
  onSwitchToSignIn?: () => void;
}

export function SignUpForm({ restaurantSlug, googleEnabled, onAuthenticated, onSwitchToSignIn }: SignUpFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [awaitingCode, setAwaitingCode] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    const result = await signUpAction(restaurantSlug, { fullName, email, phone, password });
    setWorking(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setAwaitingCode(true);
  }

  if (awaitingCode) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[var(--color-muted-ink)]">
          We sent a 6-digit code to <strong>{email}</strong>.
        </p>
        <VerifyEmailForm
          restaurantSlug={restaurantSlug}
          onVerified={() => {
            if (onAuthenticated) {
              onAuthenticated();
              router.refresh();
              return;
            }
            router.push(`/r/${restaurantSlug}/account`);
            router.refresh();
          }}
        />
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="signup-name">Full name</Label>
        <Input id="signup-name" required value={fullName} onChange={(event) => setFullName(event.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="signup-email">Email</Label>
        <Input id="signup-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="signup-phone">Phone number</Label>
        <PhoneInput id="signup-phone" value={phone} onChange={setPhone} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="signup-password">Password</Label>
        <Input
          id="signup-password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <FieldError>{error}</FieldError>
      <Button type="submit" className="w-full" disabled={working}>
        {working ? "Creating account…" : "Create account"}
      </Button>
      {googleEnabled ? (
        <a
          href={`/r/${restaurantSlug}/account/google?returnTo=${encodeURIComponent(pathname)}`}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-brand)] border border-[var(--color-hairline)] text-sm font-medium hover:bg-[color-mix(in_srgb,var(--color-ink)_6%,transparent)]"
        >
          Continue with Google
        </a>
      ) : null}
      <p className="text-center text-sm text-[var(--color-muted-ink)]">
        Already have an account?{" "}
        {onSwitchToSignIn ? (
          <button type="button" onClick={onSwitchToSignIn} className="font-medium underline">
            Sign in
          </button>
        ) : (
          <Link href={`/r/${restaurantSlug}/account/sign-in`} className="font-medium underline">Sign in</Link>
        )}
      </p>
    </form>
  );
}
