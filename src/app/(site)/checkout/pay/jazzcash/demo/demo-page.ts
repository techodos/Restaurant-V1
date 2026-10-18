import { DEMO_TEST_ACCOUNTS } from "@/server/integrations/jazzcash";

/**
 * HTML for the JazzCash demo simulator (see route.ts). Plain server-rendered pages, not React: the simulator stands
 * in for an external site the browser is POSTed to, so it answers form posts with whole documents, like JazzCash.
 */

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function hiddenInputs(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([name, value]) => `<input type="hidden" name="${esc(name)}" value="${esc(value)}">`)
    .join("");
}

/** `pp_Amount` is in paisas: "701800" → "Rs. 7,018.00". */
function formatAmount(paisas: string | undefined): string {
  const value = Number(paisas ?? "0") / 100;
  return `Rs. ${value.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function documentShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>
  :root { --red: #c4151c; --ink: #1f2328; --muted: #646b73; --line: #e3e5e8; --bg: #f4f5f7; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  .demo-bar { background: #fff4ce; color: #5c4400; text-align: center; font-size: 13px; font-weight: 600; padding: 8px 16px; border-bottom: 1px solid #f0d97a; }
  header { background: var(--red); color: #fff; padding: 14px 16px; }
  header .wrap { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .brand { font-weight: 800; font-size: 20px; letter-spacing: .2px; }
  .brand small { font-weight: 600; font-size: 12px; opacity: .85; margin-left: 6px; }
  .wrap { max-width: 460px; margin: 0 auto; }
  main { padding: 20px 16px 40px; }
  .card { background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,.04); }
  .summary { display: grid; gap: 6px; margin-bottom: 18px; padding-bottom: 16px; border-bottom: 1px dashed var(--line); }
  .row { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; }
  .row span:first-child { color: var(--muted); }
  .amount { font-size: 26px; font-weight: 800; text-align: center; margin: 4px 0 2px; }
  h1 { font-size: 17px; margin: 0 0 14px; }
  label { display: block; font-size: 13px; font-weight: 600; margin: 12px 0 6px; }
  input[type=text] { width: 100%; padding: 11px 12px; border: 1px solid #c9cdd2; border-radius: 8px; font-size: 16px; }
  input[type=text]:focus { outline: 2px solid var(--red); outline-offset: 1px; border-color: transparent; }
  .error { background: #fdecec; color: #8a1116; border-radius: 8px; padding: 10px 12px; font-size: 14px; margin-bottom: 4px; }
  .actions { display: flex; gap: 10px; margin-top: 20px; }
  button { flex: 1; padding: 12px; border-radius: 8px; font-size: 15px; font-weight: 700; cursor: pointer; border: 1px solid transparent; }
  .pay { background: var(--red); color: #fff; }
  .pay:hover { background: #a51117; }
  .cancel { background: #fff; color: var(--ink); border-color: #c9cdd2; }
  .hint { margin-top: 18px; font-size: 13px; color: var(--muted); }
  .hint table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  .hint td { padding: 5px 0; border-top: 1px solid var(--line); }
  .hint td:last-child { text-align: right; }
  .center { text-align: center; }
  .spinner { width: 38px; height: 38px; margin: 8px auto 14px; border: 4px solid #f1c9cb; border-top-color: var(--red); border-radius: 50%; animation: spin .9s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
</style>
</head>
<body>
<div class="demo-bar">DEMO MODE: simulated JazzCash payment. No real money moves.</div>
<header><div class="wrap"><span class="brand">JazzCash<small>Demo</small></span><span>Mobile Account</span></div></header>
<main><div class="wrap">${body}</div></main>
</body>
</html>`;
}

/** The "JazzCash" checkout: order summary, mobile account + CNIC, Pay / Cancel. Carries the signed request along. */
export function renderPaymentPage(request: Record<string, string>, error: string | null, entered: { mobile: string; cnic: string }): string {
  const rows = DEMO_TEST_ACCOUNTS.map((account) => `<tr><td>${esc(account.mobile)}</td><td>${esc(account.result)}</td></tr>`).join("");
  return documentShell(
    "JazzCash (demo): pay with Mobile Account",
    `<div class="card">
  <div class="summary">
    <div class="amount">${esc(formatAmount(request.pp_Amount))}</div>
    <div class="row"><span>Merchant</span><span>${esc(request.pp_MerchantID ?? "")}</span></div>
    <div class="row"><span>Description</span><span>${esc(request.pp_Description ?? "")}</span></div>
    <div class="row"><span>Transaction ref.</span><span>${esc(request.pp_TxnRefNo ?? "")}</span></div>
  </div>
  <h1>Pay with JazzCash Mobile Account</h1>
  <form method="post" autocomplete="off">
    ${hiddenInputs(request)}
    ${error ? `<div class="error" role="alert">${esc(error)}</div>` : ""}
    <label for="demo_mobile">Mobile account number</label>
    <input type="text" id="demo_mobile" name="demo_mobile" inputmode="numeric" maxlength="11" placeholder="03XXXXXXXXX" value="${esc(entered.mobile)}">
    <label for="demo_cnic">Last 6 digits of CNIC</label>
    <input type="text" id="demo_cnic" name="demo_cnic" inputmode="numeric" maxlength="6" placeholder="345678" value="${esc(entered.cnic)}">
    <div class="actions">
      <button type="submit" name="demo_action" value="cancel" class="cancel" formnovalidate>Cancel</button>
      <button type="submit" name="demo_action" value="pay" class="pay">Pay now</button>
    </div>
  </form>
  <div class="hint">Demo test accounts (CNIC <strong>345678</strong>):<table>${rows}</table></div>
</div>`,
  );
}

/** "Processing…" then an automatic POST of the signed result to the merchant's return URL, as JazzCash does. */
export function renderReturnPost(returnUrl: string, fields: Record<string, string>): string {
  return documentShell(
    "JazzCash (demo): processing",
    `<div class="card center">
  <div class="spinner" aria-hidden="true"></div>
  <h1>Processing your payment…</h1>
  <p class="hint">You will be returned to the merchant automatically.</p>
  <form id="jc-return" method="post" action="${esc(returnUrl)}">${hiddenInputs(fields)}<noscript><button type="submit" class="pay">Continue</button></noscript></form>
</div>
<script>setTimeout(function () { document.getElementById("jc-return").submit(); }, 1200);</script>`,
  );
}

export function renderInvalidRequest(): string {
  return documentShell(
    "JazzCash (demo): invalid request",
    `<div class="card center"><h1>Invalid payment request</h1><p class="hint">The request signature did not match, so this payment cannot continue. Go back to the store and place the order again.</p></div>`,
  );
}
