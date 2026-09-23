"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/app/r/[restaurantSlug]/account/actions";

export function SignOutButton({ restaurantSlug }: { restaurantSlug: string }) {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      className="flex-1"
      onClick={async () => {
        await signOutAction();
        router.push(`/r/${restaurantSlug}`);
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
