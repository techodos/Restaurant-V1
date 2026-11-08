import { getTillState } from "@/server/services/pos";
import { posResponse, requirePosStaff } from "@/web/pos";

/** The till and its open shift (null = the cashier must open one). */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ deviceId: string }> }): Promise<Response> {
  const { deviceId } = await params;
  return posResponse(async () => getTillState(await requirePosStaff(), deviceId));
}
