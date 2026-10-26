'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, RotateCw } from 'lucide-react';
import { AuthMessage, AuthSubmit, AuthTextButton, CodeInput } from '@/components/storefront/auth-fields';
import {
  sendVerificationCodeAction,
  verifyEmailCodeAction,
} from '@/app/(site)/account/actions';
import type { ApiResult } from '@/shared/contract/api';

const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Reused on the account/sign-up screen, inline at checkout for a signed-in-but-unverified customer,
 * and inside the guest checkout OTP modal — the same 6-digit code UI either way. `sendAction`/
 * `verifyAction` default to the session-based actions (every pre-existing caller is unchanged); the
 * guest modal passes the guest-scoped actions bound to the typed fullName/phone/email instead, since
 * a guest has no session for those to read.
 *
 * No router.refresh() on success: the default `verifyEmailCodeAction` re-signs the session cookie, and
 * Next answers a cookie-setting action with the current route freshly rendered (and clears the router
 * cache), so server components already see the verified state. A refresh on top was a second full
 * server render, and the sign-in / sign-up callers then navigated and refreshed again (three renders
 * before the next screen). `onVerified` is for a caller that changes what is on screen or navigates.
 *
 * A complete code (typed, pasted or filled from the phone's one-time-code suggestion) submits itself.
 */
export function VerifyEmailForm({
  restaurantSlug,
  onVerified,
  sendAction = sendVerificationCodeAction,
  verifyAction = verifyEmailCodeAction,
}: {
  restaurantSlug: string;
  onVerified?: () => void;
  sendAction?: (slug: string) => Promise<ApiResult<null>>;
  verifyAction?: (slug: string, payload: { code: string }) => Promise<ApiResult<null>>;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [verified, setVerified] = useState(false);
  const [resending, setResending] = useState(false);
  // A code was just sent by the caller before this form ever renders, so the cooldown starts immediately.
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);
  const busy = useRef(false);

  // One interval for the form's lifetime; `resend()` just resets the count it decrements.
  useEffect(() => {
    const timer = setInterval(
      () => setSecondsLeft((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => clearInterval(timer);
  }, []);

  async function verify(value: string) {
    if (busy.current || verified || value.length !== 6) return;
    busy.current = true;
    setWorking(true);
    setError(null);
    const result = await verifyAction(restaurantSlug, { code: value });
    busy.current = false;
    if (!result.success) {
      setWorking(false);
      setError(result.error.message);
      return;
    }
    // stay "working" while the caller moves on, so the button cannot be pressed again mid-navigation
    setVerified(true);
    onVerified?.();
  }

  async function resend() {
    if (secondsLeft > 0 || resending) return;
    setResending(true);
    const result = await sendAction(restaurantSlug);
    setResending(false);
    if (result.success) {
      setSecondsLeft(RESEND_COOLDOWN_SECONDS);
      setCode('');
      setError(null);
    } else {
      toast.error(result.error.message);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void verify(code);
      }}
      noValidate
      className='flex flex-col gap-4'
    >
      <div className='flex flex-col gap-2'>
        <CodeInput
          id='verify-code'
          label='6-digit verification code'
          value={code}
          autoFocus
          disabled={verified}
          invalid={Boolean(error)}
          describedBy='verify-code-message'
          onChange={(next) => {
            setCode(next);
            setError(null);
            if (next.length === 6) void verify(next);
          }}
        />
        {error ? (
          <AuthMessage id='verify-code-message'>{error}</AuthMessage>
        ) : (
          <AuthMessage id='verify-code-message' tone='hint'>
            Check your inbox (and spam folder). The code expires in 10 minutes.
          </AuthMessage>
        )}
      </div>
      {verified ? (
        <p role='status' className='flex h-14 items-center justify-center gap-2 rounded-2xl bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)] text-[15px] font-semibold text-[var(--color-success)]'>
          <CheckCircle2 className='size-5' aria-hidden />
          Verified
        </p>
      ) : (
        <AuthSubmit working={working} workingLabel='Verifying…' disabled={code.length !== 6}>
          Verify email
        </AuthSubmit>
      )}
      <p className='flex flex-wrap items-center justify-center gap-x-1 text-center text-[14px] text-[var(--color-muted-ink)]'>
        Didn&apos;t get it?
        <AuthTextButton onClick={resend} disabled={resending || secondsLeft > 0 || verified} className='font-semibold text-[var(--color-brand)] hover:text-[var(--color-brand)] disabled:text-[var(--color-muted-ink)]'>
          <RotateCw className={resending ? 'size-3.5 animate-spin' : 'size-3.5'} aria-hidden />
          {resending ? 'Sending…' : secondsLeft > 0 ? (
            <span>
              Resend in <span className='tabular-nums'>0:{String(secondsLeft).padStart(2, '0')}</span>
            </span>
          ) : 'Resend code'}
        </AuthTextButton>
      </p>
    </form>
  );
}
