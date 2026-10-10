"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/input";
import {
  requestPasswordResetAction,
  resetPasswordAction,
  verifyPasswordResetCodeAction,
} from "@/app/r/[restaurantSlug]/(site)/account/actions";
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
    <button
      type="button"
      onClick={step === "email" ? onBack : startOver}
      className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted-ink)] transition-colors hover:text-[var(--color-ink)]"
    >
      <ArrowLeft className="size-4" aria-hidden />
      {step === "email" ? "Back to sign in" : "Use a different email"}
    </button>
  );

  if (step === "email") {
    return (
      <form onSubmit={onSubmitEmail} className="space-y-4">
        <div>
          <p className="font-semibold">Reset your password</p>
          <p className="mt-1 text-sm text-[var(--color-muted-ink)]">
            Enter the email you signed up with and we will send you a 6-digit code.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reset-email">Email</Label>
          <Input
            id="reset-email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <FieldError>{error}</FieldError>
        <Button type="submit" className="w-full" disabled={working || !email.trim()}>
          {working ? "Sending code…" : "Send code"}
        </Button>
        {back}
      </form>
    );
  }

  if (step === "code") {
    return (
      <form onSubmit={onSubmitCode} className="space-y-4">
        <p className="text-sm text-[var(--color-muted-ink)]">
          If an account exists for <strong className="text-[var(--color-ink)]">{email}</strong>, we sent it a 6-digit code.
        </p>
        <div className="space-y-1.5">
          <Input
            aria-label="6-digit reset code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            placeholder="123456"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            onPaste={(event) => {
              // Native maxLength truncates a raw paste (e.g. "123 456") before non-digits are
              // stripped, dropping digits. Read the clipboard ourselves and keep only digits.
              const digits = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
              if (digits) {
                event.preventDefault();
                setCode(digits);
              }
            }}
            className="text-center text-lg tracking-[0.5em]"
          />
          <FieldHint>Enter the code from the email. It expires in 10 minutes.</FieldHint>
          <FieldError>{error}</FieldError>
        </div>
        <Button type="submit" className="w-full" disabled={working || code.length !== 6}>
          {working ? "Checking…" : "Verify code"}
        </Button>
        <button
          type="button"
          onClick={resend}
          disabled={working || secondsLeft > 0}
          className="w-full text-center text-sm text-[var(--color-muted-ink)] underline underline-offset-2 disabled:no-underline disabled:opacity-60"
        >
          {secondsLeft > 0 ? `Resend code in ${secondsLeft}s` : "Resend code"}
        </button>
        {back}
      </form>
    );
  }

  return (
    <form onSubmit={onSubmitPassword} className="space-y-4">
      <div>
        <p className="font-semibold">Choose a new password</p>
        <p className="mt-1 text-sm text-[var(--color-muted-ink)]">You will be signed in straight after.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reset-password">New password</Label>
        <Input
          id="reset-password"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <FieldHint>At least {MIN_PASSWORD_LENGTH} characters.</FieldHint>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reset-password-confirm">Confirm new password</Label>
        <Input
          id="reset-password-confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
      </div>
      <FieldError>{error}</FieldError>
      <Button type="submit" className="w-full" disabled={working || done}>
        {done ? "Signed in" : working ? "Saving…" : "Save and sign in"}
      </Button>
      {back}
    </form>
  );
}
