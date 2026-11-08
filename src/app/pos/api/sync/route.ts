import { syncTillOps } from "@/server/services/pos";
import { posSyncSchema } from "@/server/validation/pos";
import { posResponse, requirePosStaff } from "@/web/pos";

/**
 * The till's queue (IndexedDB) is flushed here, in order. Each op carries its own id and is applied at most once,
 * so a retry after a lost response never duplicates an order, a payment or an invoice.
 */
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  return posResponse(async () => {
    const actor = await requirePosStaff("pos.use", { fresh: true });
    const { ops } = posSyncSchema.parse(await request.json());
    return syncTillOps(actor, ops);
  });
}
