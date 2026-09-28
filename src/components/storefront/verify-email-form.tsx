'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, FieldError, FieldHint } from '@/components/ui/input';
import {
  sendVerificationCodeAction,
  verifyEmailCodeAction,
} from '@/app/r/[restaurantSlug]/(site)/account/actions';

const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Reused on the account/sign-up screen and inline at checkout — the same 6-digit code gate either
 * way. No router.refresh() on success: `verifyEmailCodeAction` re-signs the session cookie, and Next
 * answers a cookie-setting action with the current route freshly rendered (and clears the router
 * cache), so server components already see the verified state. A refresh on top was a second full
 * server render, and the sign-in / sign-up callers then navigated and refreshed again (three renders
 * before the next screen). `onVerified` is for a caller that changes what is on screen or navigates.
 */
export function VerifyEmailForm({
  restaurantSlug,
  onVerified,
}: {
  restaurantSlug: string;
  onVerified?: () => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [verified, setVerified] = useState(false);
  const [resending, setResending] = useState(false);
  // A code was just sent by the caller before this form ever renders, so the cooldown starts immediately.
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);

  // One interval for the form's lifetime; `resend()` just resets the count it decrements.
  useEffect(() => {
    const timer = setInterval(
      () => setSecondsLeft((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => clearInterval(timer);
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    const result = await verifyEmailCodeAction(restaurantSlug, { code });
    if (!result.success) {
      setWorking(false);
      setError(result.error.message);
      return;
    }
    // stay "working" while the caller moves on, so the button cannot be pressed again mid-navigation
    setVerified(true);
    toast.success('Email verified');
    onVerified?.();
  }

  async function resend() {
    if (secondsLeft > 0 || resending) return;
    setResending(true);
    const result = await sendVerificationCodeAction(restaurantSlug);
    setResending(false);
    if (result.success) {
      setSecondsLeft(RESEND_COOLDOWN_SECONDS);
      toast.success('Code sent', {
        description: 'Check your inbox for a new 6-digit code.',
      });
    } else {
      toast.error(result.error.message);
    }
  }

  return (
    <form onSubmit={onSubmit} className='space-y-3'>
      <div className='space-y-1.5'>
        <Input
          aria-label='6-digit verification code'
          inputMode='numeric'
          autoComplete='one-time-code'
          maxLength={6}
          placeholder='123456'
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
          className='text-center text-lg tracking-[0.5em]'
        />
        <FieldHint>
          Enter the 6-digit code we emailed you. It expires in 10 minutes.
        </FieldHint>
        <FieldError>{error}</FieldError>
      </div>
      <Button
        type='submit'
        className='w-full'
        disabled={working || verified || code.length !== 6}
      >
        {verified ? 'Verified' : working ? 'Verifying…' : 'Verify email'}
      </Button>
      <button
        type='button'
        onClick={resend}
        disabled={resending || secondsLeft > 0}
        className='w-full text-center text-sm text-[var(--color-muted-ink)] underline underline-offset-2 disabled:no-underline disabled:opacity-60'
      >
        {resending
          ? 'Sending…'
          : secondsLeft > 0
            ? `Resend code in ${secondsLeft}s`
            : 'Resend code'}
      </button>
    </form>
  );
}
