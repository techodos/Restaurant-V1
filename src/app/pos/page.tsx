import type { Metadata } from "next";
import { getPosBootstrap } from "@/server/services/pos";
import { requirePosPage } from "@/web/pos";
import { PosApp } from "@/components/pos/pos-app";

export const metadata: Metadata = { title: "Counter" };
export const dynamic = "force-dynamic";

/**
 * The till (SKILL.md §43). One client app with its own screens (counter, payment, receipt, day close), so it keeps
 * working offline from IndexedDB once loaded; this server render only hands it a fresh bootstrap.
 */
export default async function PosPage() {
  const actor = await requirePosPage();
  const bootstrap = await getPosBootstrap(actor);
  return <PosApp initialBootstrap={bootstrap} />;
}
