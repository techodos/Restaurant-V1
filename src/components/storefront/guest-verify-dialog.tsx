"use client";

import { useEffect, useId, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, Check, Eye, EyeOff, KeyRound, Loader2, Mail, ShieldCheck, X, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { VerifyEmailForm } from "@/components/storefront/verify-email-form";
import { cn } from "@/shared/utils";
import {
  registerAsAccountAction,
  resendGuestVerificationCodeAction,
  verifyGuestCodeAction,
} from "@/app/r/[restaurantSlug]/(site)/checkout/actions";

const MIN_PASSWORD_LENGTH = 8;
/** --ease-out from the motion tokens (globals.css) */
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

type Step = "otp" | "save" | "password";

const STEP_COPY: Record<Step, { icon: LucideIcon; title: string }> = {
  otp: { icon: Mail, title: "Verify your email" },
  save: { icon: ShieldCheck, title: "Save your details?" },
  password: { icon: KeyRound, title: "Create a password" },
};

/**
 * Checkout's "Place order" gate for a guest: OTP → "save your details?" → optional password, then
 * `onDone` once so the caller finishes the kept checkout submission.
 *
 * Positioning: the overlay is the fixed, full-viewport scroll container and centres the panel with
 * flex (`min-h-full` + `items-center`), so a panel taller than the viewport (phone + keyboard) scrolls
 * instead of being clipped. No translate-based centring — `animate-dialog`'s keyframes also translate,
 * and the two stacked, which is what pushed the old version above and left of centre. Radix's scroll
 * lock (react-remove-scroll) sits on the Overlay, so the overlay itself may scroll while the page can't.
 *
 * Theme: portalled into `.theme-root` (like `Sheet` / `useConfirm`), so every colour, font and radius
 * is the restaurant's own (web/theme.ts → CSS variables) — nothing here names a colour.
 */
export function GuestVerifyDialog({
  restaurantSlug,
  open,
  onOpenChange,
  fullName,
  phone,
  email,
  onDone,
}: {
  restaurantSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fullName: string;
  phone: string;
  email: string;
  /** Fires once verification (and, optionally, account creation) is complete. */
  onDone: (registered: boolean) => void;
}) {
  const reduce = useReducedMotion();
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => setContainer(document.querySelector<HTMLElement>(".theme-root") ?? document.body), []);

  const [step, setStep] = useState<Step>("otp");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  // A fresh start on every open — the parent also closes it (after onDone), which never calls onOpenChange.
  // Focus goes back to whatever opened it (Place order) the moment it closes: Radix only restores focus
  // when Content unmounts, which the exit animation delays until focus has already fallen to <body>.
  useEffect(() => {
    if (!open) {
      const target = returnFocus.current;
      returnFocus.current = null;
      if (target?.isConnected) target.focus();
      return;
    }
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setStep("otp");
    setPassword("");
    setConfirmPassword("");
    setConfirmTouched(false);
    setError(null);
    setWorking(false);
  }, [open]);

  // Each step lands focus on its first control, so keyboard and screen-reader users follow the flow.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      panel.current?.querySelector<HTMLElement>("[data-autofocus], input")?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, step]);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirmTouched && confirmPassword.length > 0 && password !== confirmPassword;
  // typed a password or a request is in flight: an Escape press must not throw that away
  const dirty = working || password.length > 0 || confirmPassword.length > 0;

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault();
    if (working) return;
    setConfirmTouched(true);
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (password !== confirmPassword) return setError("The passwords do not match.");
    setWorking(true);
    setError(null);
    const result = await registerAsAccountAction(restaurantSlug, { fullName, phone, email, password });
    if (!result.success) {
      setWorking(false);
      setError(result.error.message);
      return;
    }
    // stays "working" while the caller closes this and places the order
    toast.success("Account created", { description: "You're signed in — placing your order now." });
    onDone(true);
  }

  const { icon: StepIcon, title } = STEP_COPY[step];
  const panelMotion = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, scale: 0.96, y: 8 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.98, y: 4 },
      };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && container ? (
          <Dialog.Portal forceMount container={container}>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-[color-mix(in_srgb,var(--color-ink)_45%,transparent)] backdrop-blur-[3px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduce ? 0.12 : 0.2, ease: "easeOut" }}
              >
                <div className="flex min-h-full items-center justify-center px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:p-8">
                  <Dialog.Content
                    asChild
                    forceMount
                    aria-describedby={`${restaurantSlug}-guest-verify-desc`}
                    // tapping the dim backdrop must never discard an OTP or password in progress
                    onPointerDownOutside={(event) => event.preventDefault()}
                    onEscapeKeyDown={(event) => {
                      if (dirty) event.preventDefault();
                    }}
                    // focus is placed by the step effect above (the first field, not the close button)
                    onOpenAutoFocus={(event) => event.preventDefault()}
                    // returned by the open/close effect above instead (earlier, and not to <body>)
                    onCloseAutoFocus={(event) => event.preventDefault()}
                  >
                    <motion.div
                      ref={panel}
                      {...panelMotion}
                      transition={{ duration: reduce ? 0.12 : 0.22, ease: EASE_OUT }}
                      className="relative w-full max-w-[26rem] rounded-[var(--radius-panel)] border border-[var(--color-hairline)] bg-[var(--color-surface)] text-[var(--color-ink)] shadow-[var(--shadow-raised)] outline-none"
                    >
                      <Dialog.Close
                        aria-label="Close"
                        className="absolute right-3 top-3 grid size-9 place-items-center rounded-full text-[var(--color-muted-ink)] transition-colors duration-200 hover:bg-[var(--tint-strong)] hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand)] sm:right-4 sm:top-4"
                      >
                        <X className="size-[18px]" aria-hidden />
                      </Dialog.Close>

                      <div className="px-6 pb-6 pt-7 sm:px-8 sm:pb-8 sm:pt-8">
                        <header className="pr-8">
                          <span
                            aria-hidden
                            className="grid size-11 place-items-center rounded-full bg-[var(--brand-tint)] text-[var(--color-brand)]"
                          >
                            <StepIcon className="size-5" />
                          </span>
                          <Dialog.Title className="mt-4 font-[family-name:var(--font-display)] text-[1.4rem] font-normal leading-tight">
                            {title}
                          </Dialog.Title>
                          <Dialog.Description
                            id={`${restaurantSlug}-guest-verify-desc`}
                            className="mt-1.5 text-sm leading-relaxed text-[var(--color-muted-ink)]"
                          >
                            {step === "otp" ? (
                              <>
                                Enter the 6-digit code we sent to
                                <span className="mt-0.5 block font-medium text-[var(--color-ink)] [overflow-wrap:anywhere]">{email}</span>
                              </>
                            ) : step === "save" ? (
                              "Your email is verified. Save your details and your next order takes seconds."
                            ) : (
                              <>
                                For your account
                                <span className="mt-0.5 block font-medium text-[var(--color-ink)] [overflow-wrap:anywhere]">{email}</span>
                              </>
                            )}
                          </Dialog.Description>
                        </header>

                        <div className="mt-6">
                          {step === "otp" ? (
                            <VerifyEmailForm
                              restaurantSlug={restaurantSlug}
                              sendAction={(slug) => resendGuestVerificationCodeAction(slug, { fullName, phone, email })}
                              verifyAction={(slug, { code }) => verifyGuestCodeAction(slug, { fullName, phone, email, code })}
                              onVerified={() => setStep("save")}
                            />
                          ) : step === "save" ? (
                            <div className="space-y-5">
                              <ul className="space-y-2.5 rounded-[var(--radius-card)] bg-[var(--tint)] p-4 text-sm">
                                {["Your phone, email and address filled in next time", "Saved delivery addresses", "Your order history in one place"].map(
                                  (benefit) => (
                                    <li key={benefit} className="flex items-start gap-2.5">
                                      <Check className="mt-0.5 size-4 shrink-0 text-[var(--color-brand)]" strokeWidth={2.5} aria-hidden />
                                      <span>{benefit}</span>
                                    </li>
                                  ),
                                )}
                              </ul>
                              <div className="space-y-2">
                                <Button data-autofocus size="lg" className="w-full" onClick={() => setStep("password")}>
                                  Yes, save my details
                                </Button>
                                <Button variant="ghost" className="w-full text-[var(--color-muted-ink)]" onClick={() => onDone(false)}>
                                  No thanks, continue as guest
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <form onSubmit={submitPassword} noValidate className="space-y-4">
                              <PasswordField
                                label="Password"
                                value={password}
                                onChange={(value) => {
                                  setPassword(value);
                                  setError(null);
                                }}
                                disabled={working}
                                invalid={tooShort && confirmTouched}
                                hint={
                                  <span
                                    className={cn(
                                      "inline-flex items-center gap-1.5 transition-colors duration-200",
                                      password.length >= MIN_PASSWORD_LENGTH ? "text-[var(--color-success)]" : "text-[var(--color-muted-ink)]",
                                    )}
                                  >
                                    <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
                                    At least {MIN_PASSWORD_LENGTH} characters
                                  </span>
                                }
                              />
                              <PasswordField
                                label="Confirm password"
                                value={confirmPassword}
                                onChange={(value) => {
                                  setConfirmPassword(value);
                                  setError(null);
                                }}
                                onBlur={() => setConfirmTouched(true)}
                                disabled={working}
                                invalid={mismatch}
                                hint={mismatch ? <FieldErrorInline>The passwords do not match.</FieldErrorInline> : null}
                              />
                              {/* fixed slot: a server error appears without shoving the buttons around */}
                              <div className="min-h-5" aria-live="polite">
                                <FieldError>{error}</FieldError>
                              </div>
                              <div className="space-y-2">
                                <Button type="submit" size="lg" className="w-full" disabled={working}>
                                  {working ? <Loader2 className="animate-spin" aria-hidden /> : null}
                                  {working ? "Creating your account…" : "Create account & place order"}
                                </Button>
                                <Button
                                  variant="ghost"
                                  className="w-full text-[var(--color-muted-ink)]"
                                  disabled={working}
                                  onClick={() => {
                                    setStep("save");
                                    setError(null);
                                  }}
                                >
                                  <ArrowLeft aria-hidden />
                                  Back
                                </Button>
                              </div>
                            </form>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  </Dialog.Content>
                </div>
              </motion.div>
            </Dialog.Overlay>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}

/** A themed password input with a persistent label, an accessible show/hide toggle and a reserved hint line. */
function PasswordField({
  label,
  value,
  onChange,
  onBlur,
  disabled,
  invalid,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  invalid?: boolean;
  hint?: React.ReactNode;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="h-12 pr-12"
        />
        <button
          type="button"
          onClick={() => setVisible((shown) => !shown)}
          disabled={disabled}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-[var(--radius-brand)] text-[var(--color-muted-ink)] transition-colors duration-200 hover:bg-[var(--tint-strong)] hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand)] disabled:opacity-50"
        >
          {visible ? <EyeOff className="size-[18px]" aria-hidden /> : <Eye className="size-[18px]" aria-hidden />}
        </button>
      </div>
      {/* reserved line so a message appearing never shifts the fields below */}
      <p id={`${id}-hint`} className="min-h-5 text-xs">
        {hint}
      </p>
    </div>
  );
}

function FieldErrorInline({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-[var(--color-danger)]">{children}</span>;
}
