"use client";

import { useCallback, useRef, useState } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/shared/utils";
import { Button } from "@/components/ui/button";

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" for a delete; "primary" for anything else that just needs a pause. */
  variant?: "danger" | "primary";
}

/**
 * Promise-based replacement for `window.confirm(...)`, themed like the rest of the product instead of
 * the browser's own dialog. Usage:
 *
 *   const { confirm, dialog } = useConfirm();
 *   async function handleDelete(x) {
 *     if (!(await confirm({ title: `Delete "${x.name}"?`, variant: "danger", confirmLabel: "Delete" }))) return;
 *     ...
 *   }
 *   return <>{dialog}...</>
 *
 * One instance per component; `confirm()` can be called again once the previous promise has settled.
 */
export function useConfirm() {
  const [state, setState] = useState<(ConfirmOptions & { open: boolean }) | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setState({ ...options, open: true });
    });
  }, []);

  function settle(value: boolean) {
    setState((current) => (current ? { ...current, open: false } : current));
    resolveRef.current?.(value);
    resolveRef.current = null;
  }

  const dialog = state ? (
    <AlertDialog.Root
      open={state.open}
      onOpenChange={(open) => {
        if (!open) settle(false);
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="animate-overlay fixed inset-0 z-50 bg-[color-mix(in_srgb,var(--color-ink)_45%,transparent)] backdrop-blur-sm" />
        <AlertDialog.Content className="animate-dialog fixed left-1/2 top-1/2 z-50 w-[min(23rem,calc(100vw-2rem))] rounded-[var(--radius-panel)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-raised)] focus:outline-none sm:p-6">
          <div className="flex items-start gap-3.5">
            <span
              aria-hidden
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-full",
                state.variant === "danger"
                  ? "bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] text-[var(--color-danger)]"
                  : "bg-[var(--tint-strong)] text-[var(--color-brand)]",
              )}
            >
              <TriangleAlert className="size-[18px]" />
            </span>
            <div className="min-w-0 pt-0.5">
              <AlertDialog.Title className="text-[15px] font-semibold leading-snug">{state.title}</AlertDialog.Title>
              {state.description ? (
                <AlertDialog.Description className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--color-muted-ink)]">
                  {state.description}
                </AlertDialog.Description>
              ) : (
                // Radix requires a Description for a11y; an empty one is silent and invisible.
                <AlertDialog.Description className="sr-only" />
              )}
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2.5">
            <AlertDialog.Cancel asChild>
              <Button variant="outline" size="sm">
                {state.cancelLabel ?? "Cancel"}
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant={state.variant === "danger" ? "danger" : "primary"} size="sm" onClick={() => settle(true)}>
                {state.confirmLabel ?? "Confirm"}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  ) : null;

  return { confirm, dialog };
}
