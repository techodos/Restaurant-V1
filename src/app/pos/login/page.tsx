import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminRestaurantContext } from "@/server/services/restaurants";
import { getPosStaff } from "@/web/pos";
import { instanceRestaurantSlug } from "@/web/instance";
import { PosLoginForm } from "@/components/pos/pos-login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function PosLoginPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const [{ denied }, actor, { restaurant }] = await Promise.all([
    searchParams,
    getPosStaff(),
    getAdminRestaurantContext(instanceRestaurantSlug()),
  ]);
  if (actor?.permissions.includes("pos.use") && !denied) redirect("/pos");

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm rounded-[14px] border border-[var(--pos-line)] bg-[var(--pos-surface)] p-6 shadow-[var(--pos-shadow)] sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-[10px] bg-[var(--pos-green)] text-[17px] font-bold text-white" aria-hidden>
            {restaurant.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <h1 className="text-[18px] font-semibold leading-tight">{restaurant.name} POS</h1>
            <p className="text-[13px] text-[var(--pos-muted)]">Sign in to take orders</p>
          </div>
        </div>
        <PosLoginForm denied={denied === "1"} />
      </div>
    </main>
  );
}
