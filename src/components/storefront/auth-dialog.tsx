"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { User, X } from "lucide-react";
import { SignInForm } from "@/components/storefront/sign-in-form";
import { SignUpForm } from "@/components/storefront/sign-up-form";

/**
 * "Sign In / Sign Up" as a small centered box over the current page, not a
 * navigation away from it. Radix Dialog handles focus trap, Escape-to-close
 * and the backdrop; the sign-in/sign-up forms are the same ones the
 * standalone /account/sign-in and /account/sign-up pages use (those pages
 * stay for deep links — checkout's verify gate, My Orders' guest prompt —
 * this dialog is only a faster path from the header).
 */

interface AuthDialogProps {
  restaurantSlug: string;
  googleEnabled: boolean;
  /** Renders the trigger; the header passes its own styled button/menu item. */
  trigger: React.ReactNode;
}

export function AuthDialog({ restaurantSlug, googleEnabled, trigger }: AuthDialogProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");

  function close() {
    setOpen(false);
    // Next open starts fresh instead of showing whatever tab/state was left behind.
    setTimeout(() => setMode("sign-in"), 200);
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-[var(--color-surface)] p-6 shadow-2xl outline-none sm:p-7"
          aria-describedby={undefined}
        >
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-brand)_12%,transparent)] text-[var(--color-brand)]">
                <User className="size-5" aria-hidden />
              </span>
              <Dialog.Title className="font-[family-name:var(--font-heading)] text-lg font-semibold leading-tight">
                {mode === "sign-in" ? "Welcome back" : "Create your account"}
              </Dialog.Title>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="grid size-9 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-ink)_8%,transparent)] text-[var(--color-ink)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-ink)_14%,transparent)]"
            >
              <X className="size-4" aria-hidden />
            </Dialog.Close>
          </div>

          {mode === "sign-in" ? (
            <SignInForm
              restaurantSlug={restaurantSlug}
              googleEnabled={googleEnabled}
              onAuthenticated={close}
              onSwitchToSignUp={() => setMode("sign-up")}
            />
          ) : (
            <SignUpForm
              restaurantSlug={restaurantSlug}
              googleEnabled={googleEnabled}
              onAuthenticated={close}
              onSwitchToSignIn={() => setMode("sign-in")}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
