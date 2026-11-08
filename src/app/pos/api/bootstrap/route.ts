import { getPosBootstrap } from "@/server/services/pos";
import { posResponse, requirePosStaff } from "@/web/pos";

/** Menu, pricing settings, receipt header and tills: the till caches this for offline work (SKILL.md §43). */
export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return posResponse(async () => getPosBootstrap(await requirePosStaff()));
}
