"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, KeyRound, Lock, Mail, MailCheck, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AuthField, AuthMessage, AuthStep, AuthSubmit, AuthTextButton, CodeInput, PasswordField, PasswordRule } from "@/components/storefront/auth-fields";
import {
  requestPasswordResetAction,
  resetPasswordAction,
  verifyPasswordResetCodeAction,
} from "@/app/(site)/account/actions";
import type { ApiError } from "@/shared/contract/api";

const RESEND_COOLDOWN_SECONDS = 60;
const MIN_PASSWORD_LENGTH = 8;

/** A field-level message when the server sent one (validation details), else its message. */
function messageOf(error: ApiError): string {
  const detail = error.details ? Object.values(error.details)[0] : undefined;
  return detail ? String(detail) : error.message;
}

/**
 * "Forgot password?" inside the sign-in form: email → 6-digit code (the same emailed-code system as
 * email verification) → new password, then signed in. `onDone` is the sign-in form's own finish
 * (toast + land where the customer came from, or close the dialog).
 */
export function ForgotPasswordForm({
  restaurantSlug,
  initialEmail = "",
  onDone,
  onBack,
}: {
  restaurantSlug: string;
  initialEmail?: string;
  onDone: () => void;
  onBack: () => void;
}) {
  const [step, setStep] = useState<"email" | "code" | "password">("email");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // one interval for the form's lifetime; sending a code just resets the count it decrements
  useEffect(() => {
    const timer = setInterval(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, []);

  async function sendCode(): Promise<boolean> {
    const result = await requestPasswordResetAction(restaurantSlug, { email });
    if (!result.success) {
      setError(messageOf(result.error));
      return false;
    }
    setSecondsLeft(RESEND_COOLDOWN_SECONDS);
    return true;
  }

  async function onSubmitEmail(event: React.FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    const sent = await sendCode();
    setWorking(false);
    if (sent) {
      setCode("");
      setStep("code");
    }
  }

  async function resend() {
    if (secondsLeft > 0 || working) return;
    setWorking(true);
    setError(null);
    const sent = await sendCode();
    setWorking(false);
    if (sent) {
      setCode("");
      toast.success("Code sent", { description: "Check your inbox for a new 6-digit code." });
    }
  }

  async function onSubmitCode(event: React.FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    const result = await verifyPasswordResetCodeAction(restaurantSlug, { email, code });
    setWorking(false);
    if (!result.success) {
      setError(messageOf(result.error));
      return;
    }
    setResetToken(result.data.resetToken);
    setStep("password");
  }

  async function onSubmitPassword(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (password !== confirmPassword) return setError("The passwords do not match.");
    setWorking(true);
    setError(null);
    const result = await resetPasswordAction(restaurantSlug, { resetToken, password, confirmPassword });
    if (!result.success) {
      setWorking(false);
      setError(messageOf(result.error));
      return;
    }
    // stay "working" while the sign-in form navigates / closes the dialog
    setDone(true);
    toast.success("Password updated");
    onDone();
  }

  function startOver() {
    setStep("email");
    setCode("");
    setResetToken("");
    setPassword("");
    setConfirmPassword("");
    setError(null);
  }

  const back = (
    <AuthTextButton onClick={step === "email" ? onBack : startOver} className="self-center">
      <ArrowLeft className="size-4" aria-hidden />
      {step === "email" ? "Back to sign in" : "Use a different email"}
    </AuthTextButton>
  );

  if (step === "email") {
    return (
      <form onSubmit={onSubmitEmail} noValidate className="flex flex-col gap-5">
        <AuthStep icon={KeyRound} title="Reset your password">
          Enter the email you signed up with and we will send you a 6-digit code.
        </AuthStep>
        <AuthField
          id="reset-email"
          label="Email"
          icon={Mail}
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          autoFocus
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setError(null);
          }}
          error={error}
        />
        <AuthSubmit working={working} workingLabel="Sending code…" disabled={!email.trim()}>
          Send code
        </AuthSubmit>
        {back}
      </form>
    );
  }

  if (step === "code") {
    return (
      <form onSubmit={onSubmitCode} noValidate className="flex flex-col gap-5">
        <AuthStep icon={MailCheck} title="Check your email">
          If an account exists for <strong className="break-all font-semibold text-[var(--color-ink)]">{email.trim()}</strong>, we sent it a
          6-digit code.
        </AuthStep>
        <div className="flex flex-col gap-2">
          <CodeInput
            id="reset-code"
            label="6-digit reset code"
            autoFocus
            value={code}
            invalid={Boolean(error)}
            describedBy="reset-code-message"
            onChange={(next) => {
              setCode(next);
              setError(null);
            }}
          />
          {error ? (
            <AuthMessage id="reset-code-message">{error}</AuthMessage>
          ) : (
            <AuthMessage id="reset-code-message" tone="hint">
              Enter the code from the email. It expires in 10 minutes.
            </AuthMessage>
          )}
        </div>
        <AuthSubmit working={working} workingLabel="Checking…" disabled={code.length !== 6}>
          Verify code
        </AuthSubmit>
        <p className="flex flex-wrap items-center justify-center gap-x-1 text-center text-[14px] text-[var(--color-muted-ink)]">
          Didn&apos;t get it?
          <AuthTextButton
            onClick={resend}
            disabled={working || secondsLeft > 0}
            className="font-semibold text-[var(--color-brand)] hover:text-[var(--color-brand)] disabled:text-[var(--color-muted-ink)]"
          >
            {secondsLeft > 0 ? (
              <span>
                Resend in <span className="tabular-nums">0:{String(secondsLeft).padStart(2, "0")}</span>
              </span>
            ) : (
              "Resend code"
            )}
          </AuthTextButton>
        </p>
        {back}
      </form>
    );
  }

  const lengthError = error?.startsWith("Use at least") ? error : null;
  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <form onSubmit={onSubmitPassword} noValidate className="flex flex-col gap-5">
      <AuthStep icon={ShieldCheck} title="Choose a new password">
        You will be signed in straight after.
      </AuthStep>
      <PasswordField
        id="reset-password"
        label="New password"
        icon={Lock}
        autoComplete="new-password"
        autoFocus
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
          setError(null);
        }}
        hint={<PasswordRule met={password.length >= MIN_PASSWORD_LENGTH} min={MIN_PASSWORD_LENGTH} />}
        error={lengthError}
      />
      <PasswordField
        id="reset-password-confirm"
        label="Confirm new password"
        icon={Lock}
        autoComplete="new-password"
        value={confirmPassword}
        onChange={(event) => {
          setConfirmPassword(event.target.value);
          setError(null);
        }}
        error={mismatch ? "The passwords do not match." : lengthError ? null : error}
      />
      <AuthSubmit working={working || done} workingLabel={done ? "Signing you in…" : "Saving…"}>
        Save and sign in
      </AuthSubmit>
      {back}
    </form>
  );
}

