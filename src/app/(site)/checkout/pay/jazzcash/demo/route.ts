import { config } from "@/server/config";
import { logger } from "@/server/logger";
import { buildDemoReturn, demoOutcome, validateDemoInput, verifyRequestSignature } from "@/server/integrations/jazzcash";
import { renderInvalidRequest, renderPaymentPage, renderReturnPost } from "./demo-page";

/**
 * JazzCash demo simulator (`JAZZCASH_ENV=demo` only; 404 otherwise): `POST /checkout/pay/jazzcash/demo`.
 * Checkout posts the same signed request it would send JazzCash here instead. First post → the payment page;
 * the page posts back with `demo_action` → a signed result auto-posted to `pp_ReturnURL`, i.e. the real return route
 * (`../route.ts`), which verifies and applies it exactly as it would JazzCash's. `pp_ReturnURL` is covered by our
 * request signature, so it cannot be pointed elsewhere.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });

function demoSettings() {
  const jazzcash = config.payments.jazzcash;
  return jazzcash?.env === "demo" ? jazzcash : null;
}

export async function GET(): Promise<Response> {
  return new Response("Not found", { status: 404 });
}

export async function POST(request: Request): Promise<Response> {
  const jazzcash = demoSettings();
  if (!jazzcash) return new Response("Not found", { status: 404 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return html(renderInvalidRequest(), 400);
  }
  const signed: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (key.startsWith("pp_") || key.startsWith("ppmpf_")) signed[key] = String(value);
  }
  if (!verifyRequestSignature(signed, jazzcash.integritySalt) || !signed.pp_ReturnURL) {
    logger.warn("payments", "JazzCash demo: request signature did not verify", { txnRefNo: signed.pp_TxnRefNo });
    return html(renderInvalidRequest(), 400);
  }

  const action = String(form.get("demo_action") ?? "");
  const mobile = String(form.get("demo_mobile") ?? "").replace(/[\s-]/g, "");
  const cnic = String(form.get("demo_cnic") ?? "").trim();
  if (action !== "pay" && action !== "cancel") return html(renderPaymentPage(signed, null, { mobile: "", cnic: "" }));

  if (action === "pay") {
    const problem = validateDemoInput(mobile, cnic);
    if (problem) return html(renderPaymentPage(signed, problem, { mobile, cnic }));
  }
  const outcome = demoOutcome({ mobile, cnic, cancelled: action === "cancel", expiry: signed.pp_TxnExpiryDateTime, now: new Date() });
  logger.info("payments", "JazzCash demo: simulated payment result", {
    txnRefNo: signed.pp_TxnRefNo,
    orderNumber: signed.pp_BillReference,
    responseCode: outcome.code,
  });
  return html(renderReturnPost(signed.pp_ReturnURL, buildDemoReturn(signed, outcome, jazzcash.integritySalt)));
}
