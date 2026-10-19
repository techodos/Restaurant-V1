"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Lock, Mail, MailCheck, User } from "lucide-react";
import { cn } from "@/shared/utils";
import { PhoneInput } from "@/components/storefront/phone-input";
import { VerifyEmailForm } from "@/components/storefront/verify-email-form";
import {
  AUTH_LINK,
  AuthDivider,
  AuthField,
  AuthLabel,
  AuthMessage,
  AuthStep,
  AuthSubmit,
  GoogleButton,
  PasswordField,
  PasswordRule,
} from "@/components/storefront/auth-fields";
import { signUpAction } from "@/app/(site)/account/actions";
import { afterAuthPath, signInHref } from "@/shared/return-to";

interface SignUpFormProps {
  restaurantSlug: string;
  googleEnabled: boolean;
  /** Provided when embedded in a modal: called instead of navigating away. */
  onAuthenticated?: () => void;
  /** Embedded in a modal next to a "Sign in" tab switch instead of a page link. */
  onSwitchToSignIn?: () => void;
  /** already-sanitized path to land on after verifying (e.g. checkout); defaults to the storefront home */
  returnTo?: string | null;
  /** the restaurant's country, for the phone field's default calling code */
  defaultCountry?: React.ComponentProps<typeof PhoneInput>["defaultCountry"];
}

type Field = "fullName" | "email" | "phone" | "password";
const EMAIL_SHAPE = /^\S+@\S+\.\S+$/;
const MIN_PASSWORD = 8;

/** The same rules `signUpSchema` enforces, checked before the round trip so each field says what is wrong. */
function check(values: Record<Field, string>): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  if (values.fullName.trim().length < 2) errors.fullName = "Please enter your name.";
  if (!values.email.trim()) errors.email = "Enter your email address.";
  else if (!EMAIL_SHAPE.test(values.email.trim())) errors.email = "That email address looks incomplete.";
  if (!values.phone) errors.phone = "Enter your mobile number.";
  if (values.password.length < MIN_PASSWORD) errors.password = `Use at least ${MIN_PASSWORD} characters.`;
  return errors;
}

export function SignUpForm({ restaurantSlug, googleEnabled, onAuthenticated, onSwitchToSignIn, returnTo = null, defaultCountry }: SignUpFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [values, setValues] = useState<Record<Field, string>>({ fullName: "", email: "", phone: "", password: "" });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [awaitingCode, setAwaitingCode] = useState(false);

  // load the landing route's code while the customer fills the form and waits for the code
  useEffect(() => {
    if (!onAuthenticated) router.prefetch(afterAuthPath(returnTo));
  }, [router, restaurantSlug, returnTo, onAuthenticated]);

  function set(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setError(null);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const local = check(values);
    setErrors(local);
    setError(null);
    if (Object.keys(local).length) return;
    setWorking(true);
    const result = await signUpAction(restaurantSlug, values);
    setWorking(false);
    if (!result.success) {
      // a field-level reason (validation) goes under its field; anything else (account exists, rate limit) above the button
      const details = result.error.details ?? {};
      const fieldErrors = Object.fromEntries(
        Object.entries(details).filter(([key]) => key in values).map(([key, value]) => [key, String(value)]),
      ) as Partial<Record<Field, string>>;
      setErrors(fieldErrors);
      if (!Object.keys(fieldErrors).length) setError(result.error.message);
      return;
    }
    setAwaitingCode(true);
  }

  if (awaitingCode) {
    return (
      <div className="flex flex-col gap-6">
        <AuthStep icon={MailCheck} title="Check your email">
          We sent a 6-digit code to <strong className="break-all font-semibold text-[var(--color-ink)]">{values.email.trim()}</strong>. Enter it
          to finish creating your account.
        </AuthStep>
        <VerifyEmailForm
          restaurantSlug={restaurantSlug}
          onVerified={() => {
            // no router.refresh(): the verify action re-signed the session cookie, so Next already sent
            // back a fresh tree and cleared the router cache (see sign-in-form.tsx)
            if (onAuthenticated) {
              onAuthenticated();
              return;
            }
            router.replace(afterAuthPath(returnTo));
          }}
        />
      </div>
    );
  }

  const googleHref = `/account/google?returnTo=${encodeURIComponent(returnTo ?? pathname)}`;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {googleEnabled ? (
        <div className="hidden flex-col gap-4 lg:in-data-auth-split:flex">
          <GoogleButton href={googleHref} />
          <AuthDivider>Or with email</AuthDivider>
        </div>
      ) : null}

      <AuthField
        id="signup-name"
        label="Full name"
        icon={User}
        name="name"
        autoComplete="name"
        autoCapitalize="words"
        placeholder="Your name"
        value={values.fullName}
        onChange={(event) => set("fullName", event.target.value)}
        error={errors.fullName}
      />
      <AuthField
        id="signup-email"
        label="Email"
        icon={Mail}
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        placeholder="you@example.com"
        value={values.email}
        onChange={(event) => set("email", event.target.value)}
        error={errors.email}
        hint="Your verification code and order updates go here."
      />
      <div className="flex flex-col gap-1.5">
        <AuthLabel htmlFor="signup-phone">Mobile number</AuthLabel>
        <PhoneInput
          id="signup-phone"
          value={values.phone}
          onChange={(value) => set("phone", value)}
          defaultCountry={defaultCountry}
          fieldClassName="auth-field h-[54px] rounded-[14px] text-[16px] sm:text-[16px]"
          aria-invalid={Boolean(errors.phone) || undefined}
          aria-describedby={errors.phone ? "signup-phone-message" : undefined}
        />
        <AuthMessage id="signup-phone-message">{errors.phone}</AuthMessage>
      </div>
      <PasswordField
        id="signup-password"
        label="Password"
        icon={Lock}
        name="new-password"
        autoComplete="new-password"
        placeholder="Create a password"
        value={values.password}
        onChange={(event) => set("password", event.target.value)}
        error={errors.password}
        hint={<PasswordRule met={values.password.length >= MIN_PASSWORD} min={MIN_PASSWORD} />}
      />

      {error ? (
        <p role="alert" className="rounded-[14px] border border-[color-mix(in_srgb,var(--color-danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_8%,transparent)] px-4 py-3 text-[14px] font-medium leading-snug text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      <div className="pt-1">
        <AuthSubmit working={working} workingLabel="Creating account…">
          Create account
        </AuthSubmit>
      </div>

      {googleEnabled ? (
        <div className="flex flex-col gap-4 lg:in-data-auth-split:hidden">
          <AuthDivider />
          <GoogleButton href={googleHref} />
        </div>
      ) : null}

      <p className="text-center text-[14px] text-[var(--color-muted-ink)]">
        Already have an account?{" "}
        {onSwitchToSignIn ? (
          <button type="button" onClick={onSwitchToSignIn} className={cn(AUTH_LINK, "min-h-11")}>
            Sign in
          </button>
        ) : (
          <Link href={signInHref(returnTo)} className={cn(AUTH_LINK, "inline-flex min-h-11 items-center")}>
            Sign in
          </Link>
        )}
      </p>
    </form>
  );
}
