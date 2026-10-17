"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Storefront error boundary: keeps the restaurant's theme and offers a way out. */
export default function StorefrontError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error.message);
  }, [error]);

  return (
    <div className="container-page py-16">
      <div className="mx-auto max-w-lg surface-flat p-8 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-warning)_15%,transparent)] text-[color-mix(in_srgb,var(--color-warning)_80%,var(--color-ink))]">
          <AlertTriangle className="size-6" aria-hidden />
        </span>
        <h1 className="mt-5 text-2xl font-semibold">That did not load</h1>
        <p className="mt-3 text-[var(--color-muted-ink)]">
          Something went wrong on our side. Your cart is safe, so please try again.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <Button asChild variant="outline">
            <Link href="/">Back to the restaurant</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
