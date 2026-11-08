import type { StaffActor } from "@/server/auth/auth-service";
import { assertPermission } from "@/server/auth/auth-service";
import type { RequestContext } from "@/server/context";
import { AppError, errors, toApiError } from "@/server/errors";
import { logger } from "@/server/logger";
import {
  applyPosOp,
  closeShift as closeShiftRow,
  findDevice,
  getFiscalStatus,
  getOpenShift,
  getShift,
  getZReport as readZReport,
  issueCreditNote,
  listDevices,
  listShiftInvoices,
  openShift as openShiftRow,
  registerDevice as registerDeviceRow,
  type PosActor,
} from "@/server/repositories/pos";
import { getAdminRestaurantContext, getLocations } from "./restaurants";
import { getBranchUnavailableItems, getPosMenu } from "./catalog";
import { retryRestaurantFiscal, submitFiscalNow } from "./fiscal";
import { config } from "@/server/config";
import { zonedNow } from "@/shared/hours";
import type { FiscalInvoiceView, PosBootstrap, PosDevice, PosOp, PosOpResult, PosShift, ZReport } from "@/shared/pos";

/**
 * In-store POS use cases (SKILL.md §43). Every entry point takes the signed-in staff actor (web/pos.ts), checks
 * pos.use / pos.manage, and reaches a till or shift only through a read that runs under the actor's RLS — so a
 * branch-scoped cashier can never act on another branch's till, even with a hand-made request.
 */

function posActor(actor: StaffActor): PosActor {
  return { restaurantId: actor.restaurantId, memberId: actor.member.id, userId: actor.userId, name: actor.name };
}

function staffContext(actor: StaffActor): RequestContext {
  return { userId: actor.userId, restaurantId: actor.restaurantId, actor: actor.name };
}

async function requireDevice(actor: StaffActor, deviceId: string): Promise<PosDevice> {
  const device = await findDevice(actor.restaurantId, deviceId, staffContext(actor));
  if (!device || !device.isActive) throw errors.notFound("Till");
  return device;
}

async function requireShift(actor: StaffActor, shiftId: string): Promise<PosShift> {
  const shift = await getShift(actor.restaurantId, shiftId, staffContext(actor));
  if (!shift) throw errors.notFound("Shift");
  return shift;
}

function addressOf(location: { addressLine1: string | null; addressLine2: string | null; area: string | null; city: string | null }): string {
  return [location.addressLine1, location.addressLine2, location.area, location.city].filter(Boolean).join(", ");
}

/** Everything the till caches for offline work: menu, pricing settings, receipt header, the caller's tills. */
export async function getPosBootstrap(actor: StaffActor): Promise<PosBootstrap> {
  assertPermission(actor, "pos.use");
  const [{ restaurant }, menu, locations, devices, branchUnavailable] = await Promise.all([
    getAdminRestaurantContext(actor.restaurantSlug, { fresh: true }),
    getPosMenu(actor.restaurantId),
    getLocations(actor.restaurantId, { activeOnly: true }),
    listDevices(actor.restaurantId, staffContext(actor)),
    getBranchUnavailableItems(actor.restaurantId),
  ]);
  const ownBranch = actor.member.locationId;
  const branches = locations
    .filter((location) => !ownBranch || location.id === ownBranch)
    .map((location) => ({ id: location.id, name: location.name, address: addressOf(location), phone: location.phone }));
  const receipt = restaurant.settings.receipt;
  return {
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      currency: restaurant.currency,
      currencySymbol: restaurant.currencySymbol,
      locale: restaurant.locale,
      timezone: restaurant.timezone,
    },
    settings: restaurant.settings,
    receipt: {
      businessName: receipt.businessName || restaurant.name,
      ntn: receipt.ntn || restaurant.settings.tax.registrationNumber || null,
      pntn: receipt.pntn || null,
      footerNote: receipt.footerNote || null,
      taxLabel: restaurant.settings.tax.label,
    },
    cashier: { memberId: actor.member.id, name: actor.name, canManage: actor.permissions.includes("pos.manage"), locationId: ownBranch },
    branches,
    categories: menu.categories.map((category) => ({ id: category.id, name: category.name })),
    menu: menu.items,
    branchUnavailable: { ...branchUnavailable },
    devices,
    fiscalProvider: config.fiscal.provider,
    generatedAt: new Date().toISOString(),
  };
}

/** Registers this browser as a till at a branch (manager/owner). */
export async function registerTill(actor: StaffActor, input: { locationId: string; name: string; code: string }): Promise<PosDevice> {
  assertPermission(actor, "pos.manage");
  if (actor.member.locationId && actor.member.locationId !== input.locationId) {
    throw errors.forbidden("You can only register tills at your own branch.");
  }
  try {
    return await registerDeviceRow(input, posActor(actor), staffContext(actor));
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw errors.conflict(`Till code ${input.code} is already used. Pick another.`);
    throw error;
  }
}

export async function getTillState(actor: StaffActor, deviceId: string): Promise<{ device: PosDevice; shift: PosShift | null }> {
  assertPermission(actor, "pos.use");
  const device = await requireDevice(actor, deviceId);
  return { device, shift: await getOpenShift(actor.restaurantId, device.id, staffContext(actor)) };
}

export async function openTillShift(actor: StaffActor, input: { deviceId: string; openingFloat: string }): Promise<PosShift> {
  assertPermission(actor, "pos.use");
  const device = await requireDevice(actor, input.deviceId);
  const { restaurant } = await getAdminRestaurantContext(actor.restaurantSlug);
  return openShiftRow(
    { deviceId: device.id, openingFloat: input.openingFloat, businessDate: zonedNow(new Date(), restaurant.timezone).dateKey },
    posActor(actor),
    staffContext(actor),
  );
}

/**
 * Applies the till's queued ops IN ORDER. A permanent refusal (closed shift, unknown item, bad payload) answers that
 * op with `ok: false` and the next op still runs — the till drops it and shows why. A transient failure (database
 * unreachable) stops the batch: the op and everything after it stay queued and are re-sent later, so order holds.
 * Sales are then sent to the authority at once (short timeout) so the receipt can carry the PRA number.
 */
export async function syncTillOps(actor: StaffActor, ops: PosOp[]): Promise<{ results: PosOpResult[]; stoppedAt: string | null }> {
  assertPermission(actor, "pos.use");
  const shifts = new Map<string, PosShift>();
  const results: PosOpResult[] = [];
  let stoppedAt: string | null = null;
  for (const op of ops) {
    try {
      if (!shifts.has(op.shiftId)) shifts.set(op.shiftId, await requireShift(actor, op.shiftId));
      results.push(await applyPosOp(op, posActor(actor), staffContext(actor)));
    } catch (error) {
      const apiError = toApiError(error);
      if (error instanceof AppError || apiError.code !== "INTERNAL_ERROR") {
        results.push({ id: op.id, ok: false, error: { code: apiError.code, message: apiError.message } });
        continue;
      }
      logger.error("db", `pos: op ${op.kind} ${op.id} failed, kept queued`, error);
      stoppedAt = op.id;
      break;
    }
  }

  const soldOrderIds = results.filter((result) => result.ok && result.invoiceNumber && result.orderId).map((result) => result.orderId!);
  if (soldOrderIds.length > 0) {
    await submitFiscalNow(actor.restaurantId, soldOrderIds);
    const invoices = await getFiscalStatus(actor.restaurantId, soldOrderIds, staffContext(actor));
    for (const result of results) {
      const invoice = invoices.find((candidate) => candidate.orderId === result.orderId && candidate.kind === "sale");
      if (invoice) result.fiscal = { status: invoice.status, authorityInvoiceNumber: invoice.authorityInvoiceNumber, qrPayload: invoice.qrPayload };
    }
  }
  return { results, stoppedAt };
}

export async function getShiftReport(actor: StaffActor, shiftId: string): Promise<ZReport> {
  assertPermission(actor, "pos.use");
  await requireShift(actor, shiftId);
  const report = await readZReport(actor.restaurantId, shiftId, staffContext(actor));
  if (!report) throw errors.notFound("Shift");
  return report;
}

/** Day close. Retries the restaurant's due fiscal backlog once first, then closes only if every invoice is reported. */
export async function closeTillShift(
  actor: StaffActor,
  input: { shiftId: string; countedCash: string; notes?: string | null },
): Promise<{ shift: PosShift; report: ZReport }> {
  assertPermission(actor, "pos.use");
  await requireShift(actor, input.shiftId);
  await retryRestaurantFiscal(actor.restaurantId);
  return closeShiftRow(input, posActor(actor), staffContext(actor));
}

export async function listTillInvoices(actor: StaffActor, shiftId: string) {
  assertPermission(actor, "pos.use");
  await requireShift(actor, shiftId);
  return listShiftInvoices(actor.restaurantId, shiftId, staffContext(actor));
}

/** Full refund of a sale as a credit note (manager/owner). The original invoice is never changed. */
export async function refundSale(
  actor: StaffActor,
  input: { invoiceId: string; shiftId: string; invoiceSeq: number; issuedAt: string; reason: string },
): Promise<FiscalInvoiceView> {
  assertPermission(actor, "pos.manage");
  await requireShift(actor, input.shiftId);
  const note = await issueCreditNote(
    { originalInvoiceId: input.invoiceId, shiftId: input.shiftId, invoiceSeq: input.invoiceSeq, issuedAt: input.issuedAt, reason: input.reason },
    posActor(actor),
    staffContext(actor),
  );
  await submitFiscalNow(actor.restaurantId, [note.orderId]);
  const invoices = await getFiscalStatus(actor.restaurantId, [note.orderId], staffContext(actor));
  return invoices.find((invoice) => invoice.id === note.id) ?? note;
}
