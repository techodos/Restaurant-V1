"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Lock, Mail, MailCheck } from "lucide-react";
import { cn } from "@/shared/utils";
import { signInAction } from "@/app/(site)/account/actions";
import { VerifyEmailForm } from "@/components/storefront/verify-email-form";
import { ForgotPasswordForm } from "@/components/storefront/forgot-password-form";
import { AUTH_LINK, AuthDivider, AuthField, AuthStep, AuthSubmit, GoogleButton, PasswordField } from "@/components/storefront/auth-fields";
import { afterAuthPath, signInHref } from "@/shared/return-to";

interface SignInFormProps {
  restaurantSlug: string;
  googleEnabled: boolean;
  /** Provided when embedded in a modal: called instead of navigating away. */
  onAuthenticated?: () => void;
  /** Embedded in a modal next to a "Create account" tab switch instead of a page link. */
  onSwitchToSignUp?: () => void;
  /** already-sanitized path to land on after signing in (e.g. checkout); defaults to the storefront home */
  returnTo?: string | null;
  /** "New to <name>?"; without it "New here?" */
  restaurantName?: string;
}

const EMAIL_SHAPE = /^\S+@\S+\.\S+$/;

export function SignInForm({ restaurantSlug, googleEnabled, onAuthenticated, onSwitchToSignUp, returnTo = null, restaurantName }: SignInFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [remember, setRemember] = useState(true);
  const [working, setWorking] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);

  const destination = afterAuthPath(returnTo);

  // load the landing route's code while the customer types, so the hop after signing in is only data
  useEffect(() => {
    if (!onAuthenticated) router.prefetch(destination);
  }, [router, destination, onAuthenticated]);

  // No router.refresh(): the sign-in / verify actions set the session cookie, and Next answers such an
  // action with a freshly rendered tree (header now signed in) and clears the client router cache, so a
  // refresh here was one more full server render before the customer could see anything.
  function finish() {
    if (onAuthenticated) {
      onAuthenticated();
      return;
    }
    // replace: Back must not return to a sign-in form for someone already signed in
    router.replace(destination);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    // the same checks the server makes, shown under each field before a round trip
    const nextEmailError = !email.trim() ? "Enter your email address." : EMAIL_SHAPE.test(email.trim()) ? null : "That email address looks incomplete.";
    const nextPasswordError = password ? null : "Enter your password.";
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setError(null);
    if (nextEmailError || nextPasswordError) return;
    setWorking(true);
    const result = await signInAction(restaurantSlug, { email, password, remember });
    if (!result.success) {
      setWorking(false);
      setError(result.error.message);
      return;
    }
    if (!result.data.emailVerified) {
      // the action already sent the code (after its response)
      setWorking(false);
      setNeedsVerification(true);
      return;
    }
    finish();
  }

  if (needsVerification) {
    return (
      <div className="flex flex-col gap-6">
        <AuthStep icon={MailCheck} title="Verify your email">
          Your email isn&apos;t verified yet. We sent a 6-digit code to{" "}
          <strong className="break-all font-semibold text-[var(--color-ink)]">{email.trim()}</strong>.
        </AuthStep>
        <VerifyEmailForm restaurantSlug={restaurantSlug} onVerified={finish} />
      </div>
    );
  }

  if (forgotPassword) {
    return (
      <ForgotPasswordForm
        restaurantSlug={restaurantSlug}
        initialEmail={email}
        onDone={finish}
        onBack={() => {
          setForgotPassword(false);
          setError(null);
        }}
      />
    );
  }

  const googleHref = `/account/google?returnTo=${encodeURIComponent(returnTo ?? pathname)}`;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {/* On the desktop split page (AuthShell, data-auth-split) Google comes first, then "or with email". */}
      {googleEnabled ? (
        <div className="hidden flex-col gap-4 lg:in-data-auth-split:flex">
          <GoogleButton href={googleHref} />
          <AuthDivider>Or with email</AuthDivider>
        </div>
      ) : null}

      <AuthField
        id="signin-email"
        label="Email"
        icon={Mail}
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        placeholder="you@example.com"
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
          setEmailError(null);
        }}
        error={emailError}
      />

      <PasswordField
        id="signin-password"
        label="Password"
        icon={Lock}
        name="password"
        autoComplete="current-password"
        placeholder="Your password"
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
          setPasswordError(null);
          setError(null);
        }}
        error={passwordError ?? error}
      />

      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[14px] text-[var(--color-ink)]">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            className="size-[18px] shrink-0 cursor-pointer accent-[var(--color-brand)]"
          />
          Keep me signed in
        </label>
        <button type="button" onClick={() => setForgotPassword(true)} className={cn(AUTH_LINK, "min-h-11 shrink-0 text-[14px]")}>
          Forgot<span className="max-[359px]:hidden"> password</span>?
        </button>
      </div>

      <AuthSubmit working={working} workingLabel="Signing in…">
        Sign in
      </AuthSubmit>

      {googleEnabled ? (
        <div className="flex flex-col gap-4 lg:in-data-auth-split:hidden">
          <AuthDivider />
          <GoogleButton href={googleHref} />
        </div>
      ) : null}

      <p className="text-center text-[14px] text-[var(--color-muted-ink)]">
        {restaurantName ? `New to ${restaurantName}?` : "New here?"}{" "}
        {onSwitchToSignUp ? (
          <button type="button" onClick={onSwitchToSignUp} className={cn(AUTH_LINK, "min-h-11")}>
            Create an account
          </button>
        ) : (
          <Link href={signInHref(returnTo, "sign-up")} className={cn(AUTH_LINK, "inline-flex min-h-11 items-center")}>
            Create an account
          </Link>
        )}
      </p>
    </form>
  );
}
