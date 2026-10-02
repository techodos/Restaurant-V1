import { jsonError } from "@/server/errors";
import { getOrdersForExport, getSalesReport } from "@/server/services/orders";
import { buildSalesXlsxBuffer, buildSalesPdfBuffer } from "@/server/services/report-exports";
import { buildSalesCsv, resolveReportRange, type SalesCsvRow } from "@/shared/reports";
import { getAdminRestaurant } from "@/web/admin";
import { requirePermission } from "@/web/session";

/**
 * Sales Reports export: `GET .../admin/<slug>/reports/export?preset=&from=&to=&format=csv|xlsx|pdf`.
 * Same permission as the report page and the same range-resolution logic (shared/reports.ts), so every
 * format's download always matches what the page is currently showing. `format` defaults to csv.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ExportFormat = "csv" | "xlsx" | "pdf";

function parseFormat(value: string | null): ExportFormat {
  return value === "xlsx" || value === "pdf" ? value : "csv";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ restaurantSlug: string }> },
): Promise<Response> {
  try {
    const { restaurantSlug } = await params;
    const actor = await requirePermission("analytics.view", restaurantSlug);
    const restaurant = await getAdminRestaurant(restaurantSlug);
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

    const url = new URL(request.url);
    const range = resolveReportRange(url.searchParams.get("preset"), url.searchParams.get("from"), url.searchParams.get("to"), restaurant.timezone);
    const format = parseFormat(url.searchParams.get("format"));

    const { rows: orderRows } = await getOrdersForExport(restaurant.id, range, ctx);
    const rows: SalesCsvRow[] = orderRows.map((row) => ({
      orderNumber: row.orderNumber,
      createdAt: row.createdAt,
      status: row.status,
      orderType: row.orderType,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      itemCount: row.itemCount,
      subtotal: row.subtotal ?? "0.00",
      discountAmount: row.discountAmount ?? "0.00",
      taxAmount: row.taxAmount ?? "0.00",
      total: row.total,
      paymentMethod: row.paymentMethod,
    }));

    const basename = `sales-${restaurant.slug}-${range.fromDateKey}_to_${range.toDateKey}`;

    if (format === "xlsx") {
      const buffer = await buildSalesXlsxBuffer(rows, restaurant, range);
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${basename}.xlsx"`,
        },
      });
    }

    if (format === "pdf") {
      const summary = await getSalesReport(restaurant.id, range, restaurant.timezone, ctx);
      const buffer = await buildSalesPdfBuffer(rows, restaurant, summary, range);
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${basename}.pdf"`,
        },
      });
    }

    const csv = buildSalesCsv(rows, restaurant);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${basename}.csv"`,
      },
    });
  } catch (error) {
    const { body, status } = jsonError(error);
    return Response.json(body, { status });
  }
}
