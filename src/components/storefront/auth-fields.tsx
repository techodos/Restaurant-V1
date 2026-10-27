"use client";

import { forwardRef, useState } from "react";
import { ArrowRight, Check, Eye, EyeOff, Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/shared/utils";

/**
 * The building blocks every sign-in style form shares (customer sign-in / sign-up / verify / reset, Google
 * phone step, staff login): 54px fields with a leading icon, the password show/hide toggle, the 56px primary
 * button, the OR divider, the Google button and the 6-box code field. Theme tokens only.
 */

export const AUTH_FIELD =
  "auth-field h-[54px] w-full rounded-[14px] border border-[var(--color-hairline)] bg-[var(--color-surface)] text-[16px] text-[var(--color-ink)] outline-none transition-[border-color,box-shadow] placeholder:text-[color-mix(in_srgb,var(--color-muted-ink)_55%,transparent)] hover:border-[color-mix(in_srgb,var(--color-ink)_22%,var(--color-hairline))] focus:border-[var(--color-brand)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-brand)_12%,transparent)] aria-[invalid=true]:border-[var(--color-danger)] aria-[invalid=true]:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-danger)_10%,transparent)] disabled:opacity-60";
const ICON = "pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-[var(--color-muted-ink)] transition-colors peer-focus:text-[var(--color-brand)]";
export const AUTH_LINK = "font-medium text-[var(--color-brand)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand)]";

export function AuthLabel({ htmlFor, children, aside }: { htmlFor: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-[var(--color-ink)]">
        {children}
      </label>
      {aside}
    </div>
  );
}

export function AuthMessage({ id, tone = "error", children }: { id?: string; tone?: "error" | "hint"; children?: React.ReactNode }) {
  if (!children) return null;
  return tone === "error" ? (
    <p id={id} role="alert" className="text-[13px] font-medium leading-snug text-[var(--color-danger)]">
      {children}
    </p>
  ) : (
    <p id={id} className="text-[13px] leading-snug text-[var(--color-muted-ink)]">
      {children}
    </p>
  );
}

type FieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "id"> & {
  id: string;
  label: string;
  icon: LucideIcon;
  error?: string | null;
  hint?: React.ReactNode;
  /** right of the label, e.g. "Forgot password?" */
  labelAside?: React.ReactNode;
};

/** Label + icon field + error (or hint) under it, wired with aria-invalid / aria-describedby. */
export const AuthField = forwardRef<HTMLInputElement, FieldProps>(function AuthField(
  { id, label, icon: Icon, error, hint, labelAside, className, ...input },
  ref,
) {
  const messageId = error || hint ? `${id}-message` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <AuthLabel htmlFor={id} aside={labelAside}>
        {label}
      </AuthLabel>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={messageId}
          className={cn(AUTH_FIELD, "peer pl-11 pr-4", className)}
          {...input}
        />
        <Icon className={ICON} aria-hidden />
      </div>
      {error ? <AuthMessage id={messageId}>{error}</AuthMessage> : <AuthMessage id={messageId} tone="hint">{hint}</AuthMessage>}
    </div>
  );
});

/** A password field with a 44px show/hide toggle. */
export function PasswordField(props: Omit<FieldProps, "type">) {
  const [shown, setShown] = useState(false);
  const { id, label, icon: Icon, error, hint, labelAside, className, ...input } = props;
  const messageId = error || hint ? `${id}-message` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <AuthLabel htmlFor={id} aside={labelAside}>
        {label}
      </AuthLabel>
      <div className="relative">
        <input
          id={id}
          type={shown ? "text" : "password"}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={messageId}
          className={cn(AUTH_FIELD, "peer pl-11 pr-12", className)}
          {...input}
        />
        <Icon className={ICON} aria-hidden />
        <button
          type="button"
          onClick={() => setShown((value) => !value)}
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          aria-controls={id}
          className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-[12px] text-[var(--color-muted-ink)] transition-colors hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-[var(--color-brand)]"
        >
          {shown ? <EyeOff className="size-[18px]" aria-hidden /> : <Eye className="size-[18px]" aria-hidden />}
        </button>
      </div>
      {error ? <AuthMessage id={messageId}>{error}</AuthMessage> : <AuthMessage id={messageId} tone="hint">{hint}</AuthMessage>}
    </div>
  );
}

/**
 * The one primary action. `tone="night"` is the staff portal's darker button; both keep the accent arrow.
 * While `working`, it shows a spinner + `workingLabel` and is disabled (no double submit).
 */
export function AuthSubmit({
  working,
  workingLabel,
  disabled,
  tone = "brand",
  arrow = true,
  children,
}: {
  working?: boolean;
  workingLabel?: string;
  disabled?: boolean;
  tone?: "brand" | "night";
  arrow?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={working || disabled}
      aria-busy={working || undefined}
      className={cn(
        "press flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl px-5 text-[16px] font-semibold transition-[filter,opacity] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:brightness-100 aria-busy:cursor-wait aria-busy:opacity-85",
        tone === "brand"
          ? "bg-[var(--color-brand)] text-[var(--color-brand-foreground)] shadow-[0_14px_28px_-14px_color-mix(in_srgb,var(--color-brand)_80%,black)]"
          : "bg-[var(--color-night)] text-[var(--color-on-night)] shadow-[0_14px_28px_-14px_color-mix(in_srgb,var(--color-night)_80%,black)] hover:brightness-125",
      )}
    >
      {working ? (
        <>
          <Loader2 className="size-5 animate-spin" aria-hidden />
          {workingLabel ?? children}
        </>
      ) : (
        <>
          {children}
          {arrow ? <ArrowRight className="size-5 text-[var(--color-brand-accent)]" aria-hidden /> : null}
        </>
      )}
    </button>
  );
}

export function AuthDivider({ children = "OR" }: { children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-[12px] font-medium uppercase tracking-[0.16em] text-[var(--color-muted-ink)]" aria-hidden>
      <span className="h-px flex-1 bg-[var(--color-hairline)]" />
      {children}
      <span className="h-px flex-1 bg-[var(--color-hairline)]" />
    </div>
  );
}

/** The official multicolour "G" (Google's sign-in branding guidelines: unaltered logo on a white button). */
function GoogleLogo() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="size-5 shrink-0">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  );
}

export function GoogleButton({ href, className }: { href: string; className?: string }) {
  return (
    <a
      href={href}
      className={cn(
        "press flex h-[52px] w-full items-center justify-center gap-3 rounded-2xl border border-[#DADCE0] bg-white text-[15px] font-medium text-[#1F1F1F] transition-colors hover:bg-[#F8F9FA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand)]",
        className,
      )}
    >
      <GoogleLogo />
      Continue with Google
    </a>
  );
}

/** Heading of a step shown inside the form panel (verify code, reset password): icon disc, title, line. */
export function AuthStep({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="grid size-12 place-items-center rounded-full bg-[var(--brand-tint)] text-[var(--color-brand)]">
        <Icon className="size-[22px]" aria-hidden />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="display-face text-[24px] leading-[1.1] text-[var(--color-ink)]">{title}</h2>
        {children ? <div className="text-[14px] leading-relaxed text-[var(--color-muted-ink)]">{children}</div> : null}
      </div>
    </div>
  );
}

/** A quiet back / secondary text action, 44px tall. */
export function AuthTextButton({ onClick, disabled, children, className }: { onClick: () => void; disabled?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-1 text-[14px] text-[var(--color-muted-ink)] transition-colors hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-[var(--color-brand)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:text-[var(--color-muted-ink)]",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** "At least N characters" with a tick once it holds (a hint under a new-password field). */
export function PasswordRule({ met, min }: { met: boolean; min: number }) {
  return (
    <span className={met ? "inline-flex items-center gap-1.5 text-[var(--color-success)]" : "inline-flex items-center gap-1.5"}>
      {met ? <Check className="size-3.5" aria-hidden /> : <span aria-hidden className="size-1.5 rounded-full bg-current opacity-60" />}
      At least {min} characters
    </span>
  );
}

const CODE_LENGTH = 6;

/**
 * The 6-digit code as six boxes. It is ONE real input stretched over the boxes (transparent text), so paste,
 * the phone's "From Messages / Mail" one-time-code suggestion, backspace and screen readers all behave as a
 * normal field; the boxes only mirror its value. A paste with spaces or dashes ("123 456") keeps every digit.
 */
export function CodeInput({
  id,
  value,
  onChange,
  label = "6-digit code",
  invalid,
  describedBy,
  autoFocus,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (code: string) => void;
  label?: string;
  invalid?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const active = Math.min(value.length, CODE_LENGTH - 1);
  return (
    <div className="relative">
      <div aria-hidden className="grid grid-cols-6 gap-2 sm:gap-2.5">
        {Array.from({ length: CODE_LENGTH }, (_, index) => {
          const digit = value[index];
          const current = focused && index === active;
          return (
            <span
              key={index}
              className={cn(
                "grid h-14 min-w-0 place-items-center rounded-[14px] border bg-[var(--color-surface)] text-[24px] font-semibold tabular-nums text-[var(--color-ink)] transition-[border-color,box-shadow]",
                invalid
                  ? "border-[var(--color-danger)]"
                  : current
                    ? "border-[var(--color-brand)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-brand)_12%,transparent)]"
                    : digit
                      ? "border-[color-mix(in_srgb,var(--color-ink)_28%,var(--color-hairline))]"
                      : "border-[var(--color-hairline)]",
              )}
            >
              {digit ?? (current ? <span className="h-6 w-px animate-pulse bg-[var(--color-brand)]" /> : null)}
            </span>
          );
        })}
      </div>
      <input
        id={id}
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={CODE_LENGTH}
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
        onPaste={(event) => {
          // native maxLength would cut a raw paste ("123 456") before the digits are picked out
          const digits = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
          if (digits) {
            event.preventDefault();
            onChange(digits);
          }
        }}
        className="absolute inset-0 size-full cursor-text rounded-[14px] bg-transparent text-[16px] text-transparent caret-transparent outline-none selection:bg-transparent disabled:cursor-not-allowed"
      />
    </div>
  );
}
