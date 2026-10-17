"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/app/(site)/account/actions";

export function SignOutButton({ restaurantSlug }: { restaurantSlug: string }) {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      className="flex-1"
      onClick={async () => {
        await signOutAction();
        router.push("/");
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
