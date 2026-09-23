"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { signInAction, ensureVerificationCodeAction } from "@/app/r/[restaurantSlug]/account/actions";
import { VerifyEmailForm } from "@/components/storefront/verify-email-form";

interface SignInFormProps {
  restaurantSlug: string;
  googleEnabled: boolean;
  /** Provided when embedded in a modal: called instead of navigating to /account. */
  onAuthenticated?: () => void;
  /** Embedded in a modal next to a "Create account" tab switch instead of a page link. */
  onSwitchToSignUp?: () => void;
}

export function SignInForm({ restaurantSlug, googleEnabled, onAuthenticated, onSwitchToSignUp }: SignInFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);

  function finish() {
    toast.success("Signed in");
    if (onAuthenticated) {
      onAuthenticated();
      router.refresh();
      return;
    }
    router.push(`/r/${restaurantSlug}/account`);
    router.refresh();
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    const result = await signInAction(restaurantSlug, { email, password });
    setWorking(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    if (!result.data.emailVerified) {
      setNeedsVerification(true);
      void ensureVerificationCodeAction(restaurantSlug);
      return;
    }
    finish();
  }

  if (needsVerification) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[var(--color-muted-ink)]">
          Your email isn't verified yet. We sent a 6-digit code to <strong>{email}</strong>.
        </p>
        <VerifyEmailForm restaurantSlug={restaurantSlug} onVerified={finish} />
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="signin-email">Email</Label>
        <Input id="signin-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="signin-password">Password</Label>
        <Input
          id="signin-password"
          type="password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <FieldError>{error}</FieldError>
      <Button type="submit" className="w-full" disabled={working}>
        {working ? "Signing in…" : "Sign in"}
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
        New here?{" "}
        {onSwitchToSignUp ? (
          <button type="button" onClick={onSwitchToSignUp} className="font-medium underline">
            Create an account
          </button>
        ) : (
          <Link href={`/r/${restaurantSlug}/account/sign-up`} className="font-medium underline">Create an account</Link>
        )}
      </p>
    </form>
  );
}
