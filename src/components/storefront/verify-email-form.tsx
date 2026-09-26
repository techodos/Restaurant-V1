'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, FieldError, FieldHint } from '@/components/ui/input';
import {
  sendVerificationCodeAction,
  verifyEmailCodeAction,
} from '@/app/r/[restaurantSlug]/account/actions';

const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Reused on the account/sign-up screen and inline at checkout — the same 6-digit code gate either
 * way. Always refreshes the current route on success (so a server component re-reads the verified
 * state); `onVerified` is for a caller that also needs to change what is on screen.
 */
export function VerifyEmailForm({
  restaurantSlug,
  onVerified,
}: {
  restaurantSlug: string;
  onVerified?: () => void;
}) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
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
    setWorking(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    toast.success('Email verified');
    router.refresh();
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
          Enter the 6-digit code we emailed you. It expires in 60 seconds.
        </FieldHint>
        <FieldError>{error}</FieldError>
      </div>
      <Button
        type='submit'
        className='w-full'
        disabled={working || code.length !== 6}
      >
        {working ? 'Verifying…' : 'Verify email'}
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
