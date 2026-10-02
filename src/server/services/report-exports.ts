import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { ORDER_STATUS_LABELS, ORDER_TYPE_LABELS, PAYMENT_METHOD_LABELS } from "@/shared/contract/enums";
import { formatMoney } from "@/shared/money";
import type { SalesAnalytics } from "@/shared/contract/models";
import type { ReportRange, SalesCsvRow } from "@/shared/reports";

/**
 * XLSX and PDF renderers for the Sales Reports export. Framework-free (no Next/React), takes already-
 * fetched rows and returns a Buffer — same input shape as `shared/reports.ts#buildSalesCsv`, so all three
 * formats always show the same data for the same range. Kept out of `shared/` because exceljs/pdfkit are
 * Node-only; this is a server-only concern, parallel to `server/integrations/`.
 */

interface ExportRestaurant {
  name: string;
  slug: string;
  currency: string;
  locale: string;
  timezone: string;
}

function formatRowDate(iso: string, restaurant: ExportRestaurant): string {
  try {
    return new Date(iso).toLocaleString(restaurant.locale, {
      timeZone: restaurant.timezone,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export async function buildSalesXlsxBuffer(rows: SalesCsvRow[], restaurant: ExportRestaurant, range: ReportRange): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = restaurant.name;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Sales");
  sheet.columns = [
    { header: "Order ID", key: "orderNumber", width: 14 },
    { header: "Date", key: "date", width: 20 },
    { header: "Status", key: "status", width: 14 },
    { header: "Order type", key: "orderType", width: 12 },
    { header: "Customer", key: "customerName", width: 22 },
    { header: "Phone", key: "customerPhone", width: 16 },
    { header: "Items", key: "itemCount", width: 8 },
    { header: "Subtotal", key: "subtotal", width: 12 },
    { header: "Discount", key: "discountAmount", width: 12 },
    { header: "Tax", key: "taxAmount", width: 12 },
    { header: "Total", key: "total", width: 12 },
    { header: "Payment method", key: "paymentMethod", width: 16 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    sheet.addRow({
      orderNumber: row.orderNumber,
      date: formatRowDate(row.createdAt, restaurant),
      status: ORDER_STATUS_LABELS[row.status],
      orderType: ORDER_TYPE_LABELS[row.orderType],
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      itemCount: row.itemCount,
      subtotal: Number(row.subtotal),
      discountAmount: Number(row.discountAmount),
      taxAmount: Number(row.taxAmount),
      total: Number(row.total),
      paymentMethod: PAYMENT_METHOD_LABELS[row.paymentMethod],
    });
  }
  for (const key of ["subtotal", "discountAmount", "taxAmount", "total"]) {
    sheet.getColumn(key).numFmt = "0.00";
  }

  sheet.getColumn("orderNumber").alignment = { vertical: "middle" };
  sheet.autoFilter = { from: "A1", to: `L${rows.length + 1}` };

  const title = `${restaurant.name} — Sales ${range.fromDateKey === range.toDateKey ? range.fromDateKey : `${range.fromDateKey} to ${range.toDateKey}`}`;
  sheet.headerFooter = { oddHeader: `&C&"-,Bold"${title}` };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function buildSalesPdfBuffer(
  rows: SalesCsvRow[],
  restaurant: ExportRestaurant,
  summary: SalesAnalytics,
  range: ReportRange,
): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 36, size: "A4", layout: "landscape", bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const money = (value: string) => formatMoney(value, { currency: restaurant.currency });
  const periodLabel = range.fromDateKey === range.toDateKey ? range.fromDateKey : `${range.fromDateKey} – ${range.toDateKey}`;

  doc.fontSize(18).font("Helvetica-Bold").text(`${restaurant.name} — Sales Report`);
  doc.fontSize(10).font("Helvetica").fillColor("#555").text(periodLabel);
  doc.moveDown(0.8);

  // summary strip
  const stats: [string, string][] = [
    ["Total sales", money(summary.totalSales)],
    ["Total orders", String(summary.totalOrders)],
    ["Completed", String(summary.completedOrders)],
    ["Cancelled", String(summary.cancelledOrders)],
    ["Avg. order value", money(summary.averageOrderValue)],
    ["Total discounts", money(summary.totalDiscounts)],
  ];
  const statWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / stats.length;
  const statsTop = doc.y;
  stats.forEach(([label, value], index) => {
    const x = doc.page.margins.left + index * statWidth;
    doc.fontSize(8).font("Helvetica").fillColor("#777").text(label.toUpperCase(), x, statsTop, { width: statWidth - 8 });
    doc.fontSize(13).font("Helvetica-Bold").fillColor("#111").text(value, x, statsTop + 12, { width: statWidth - 8 });
  });
  doc.y = statsTop + 38;
  doc.moveDown(0.6);
  doc.strokeColor("#ddd").moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
  doc.moveDown(0.6);

  // orders table
  const columns: { label: string; width: number; align?: "left" | "right" }[] = [
    { label: "Order", width: 60 },
    { label: "Date", width: 100 },
    { label: "Customer", width: 120 },
    { label: "Type", width: 60 },
    { label: "Status", width: 70 },
    { label: "Items", width: 40, align: "right" },
    { label: "Subtotal", width: 70, align: "right" },
    { label: "Discount", width: 70, align: "right" },
    { label: "Tax", width: 60, align: "right" },
    { label: "Total", width: 70, align: "right" },
    { label: "Payment", width: 90 },
  ];
  const tableLeft = doc.page.margins.left;
  const rowHeight = 18;
  const bottomLimit = doc.page.height - doc.page.margins.bottom;

  function drawHeader(): void {
    let x = tableLeft;
    doc.fontSize(8).font("Helvetica-Bold").fillColor("#fff");
    doc.rect(tableLeft, doc.y, columns.reduce((sum, c) => sum + c.width, 0), rowHeight).fill("#1c1c1c");
    const headerY = doc.y + 5;
    for (const column of columns) {
      doc.fillColor("#fff").text(column.label, x + 4, headerY, { width: column.width - 6, align: column.align ?? "left" });
      x += column.width;
    }
    doc.y += rowHeight;
    doc.fillColor("#111").font("Helvetica");
  }

  doc.y = doc.y;
  drawHeader();

  rows.forEach((row, index) => {
    if (doc.y + rowHeight > bottomLimit) {
      doc.addPage();
      doc.y = doc.page.margins.top;
      drawHeader();
    }
    if (index % 2 === 1) {
      doc.rect(tableLeft, doc.y, columns.reduce((sum, c) => sum + c.width, 0), rowHeight).fill("#f7f7f7");
      doc.fillColor("#111");
    }
    const cells = [
      row.orderNumber,
      formatRowDate(row.createdAt, restaurant),
      row.customerName,
      ORDER_TYPE_LABELS[row.orderType],
      ORDER_STATUS_LABELS[row.status],
      String(row.itemCount),
      money(row.subtotal),
      money(row.discountAmount),
      money(row.taxAmount),
      money(row.total),
      PAYMENT_METHOD_LABELS[row.paymentMethod],
    ];
    let x = tableLeft;
    const textY = doc.y + 5;
    doc.fontSize(8);
    cells.forEach((cell, columnIndex) => {
      const column = columns[columnIndex]!;
      doc.fillColor("#111").text(cell, x + 4, textY, { width: column.width - 6, align: column.align ?? "left", ellipsis: true });
      x += column.width;
    });
    doc.y += rowHeight;
  });

  if (rows.length === 0) {
    doc.moveDown(1);
    doc.fontSize(10).fillColor("#777").text("No orders in this period.", { align: "center" });
  }

  doc.end();
  return done;
}
