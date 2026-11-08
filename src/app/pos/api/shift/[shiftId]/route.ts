import { getShiftReport, listTillInvoices } from "@/server/services/pos";
import { posResponse, requirePosStaff } from "@/web/pos";

/** The shift's Z-report so far and its invoices (day close screen, recent sales). */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ shiftId: string }> }): Promise<Response> {
  const { shiftId } = await params;
  return posResponse(async () => {
    const actor = await requirePosStaff();
    const [report, invoices] = await Promise.all([getShiftReport(actor, shiftId), listTillInvoices(actor, shiftId)]);
    return { report, invoices };
  });
}
