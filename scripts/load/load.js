// k6 load test for the restaurant platform — run ONLY against the isolated local servers (ports 3201/3202,
// local Postgres on 54329). No payment, email, SMS or push provider is configured there.
//
//   k6 run -e PROFILE=smoke load.js        (a few VUs, sanity)
//   k6 run -e PROFILE=ramp  load.js        (ramp to PEAK concurrent users, hold, ramp down)
//   k6 run -e PROFILE=spike load.js        (sudden jump to PEAK, hold, drop, recovery window)
//   k6 run -e PROFILE=soak  load.js        (SOAK_MIN minutes at PEAK)
// Tunables: -e PEAK=1000 -e ORDER_SHARE=0.3 -e ZAYTOUN_SHARE=0.25 -e DUP_SHARE=0.1 -e THINK=1 (think-time multiplier)
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import { SharedArray } from "k6/data";
import exec from "k6/execution";

const PROFILE = __ENV.PROFILE || "smoke";
const PEAK = Number(__ENV.PEAK || 1000);
const ORDER_SHARE = Number(__ENV.ORDER_SHARE || 0.3); // fraction of users who go on to check out
const ZAYTOUN_SHARE = Number(__ENV.ZAYTOUN_SHARE || 0.25); // fraction of users on the second restaurant
const DUP_SHARE = Number(__ENV.DUP_SHARE || 0.1); // fraction of checkouts that also fire a duplicate submit
const THINK = Number(__ENV.THINK || 1);
const SOAK_MIN = Number(__ENV.SOAK_MIN || 10);

// several Node processes per restaurant = what a load balancer spreads traffic over (comma-separated)
const BASES = {
  "bella-napoli": (__ENV.BELLA_URLS || "http://localhost:3201").split(","),
  zaytoun: (__ENV.ZAYTOUN_URLS || "http://localhost:3202").split(","),
};
const SITES = new Proxy({}, { get: (_t, slug) => ({ base: BASES[slug][exec.vu.idInTest % BASES[slug].length] }) });
const ACTIONS = JSON.parse(open("./.out/actions.json"));
const META = new SharedArray("meta", () => {
  const all = JSON.parse(open("./.out/fixtures.json"));
  return Object.entries(all).map(([slug, f]) => ({
    slug, restaurantId: f.restaurantId, branchId: f.branchId, trayCookie: f.trayCookie, trays: f.trays,
    itemSlugs: f.itemSlugs, address: f.address, staffSession: f.staffSession, customerCount: f.customers.length,
  }));
});
const CUSTOMERS = {
  "bella-napoli": new SharedArray("c-bella", () => JSON.parse(open("./.out/fixtures.json"))["bella-napoli"].customers),
  zaytoun: new SharedArray("c-zaytoun", () => JSON.parse(open("./.out/fixtures.json")).zaytoun.customers),
};

// ── metrics ──────────────────────────────────────────────────────────────────
const pageLatency = new Trend("page_latency", true);
const orderLatency = new Trend("order_latency", true);
const ordersPlaced = new Counter("orders_placed");
const ordersFailed = new Counter("orders_failed");
const ordersReplayed = new Counter("orders_dup_same_number"); // duplicate submit answered with the SAME order
const ordersDuplicated = new Counter("orders_dup_new_number"); // duplicate submit that produced a DIFFERENT order (must be 0)
const pageErrors = new Rate("page_errors");
const adminLatency = new Trend("admin_latency", true);
const statusChanges = new Counter("admin_status_changes");

// ── load shapes ─────────────────────────────────────────────────────────────
function stagesFor(total) {
  const n = (share) => Math.max(1, Math.round(total * share));
  if (PROFILE === "smoke") return [{ duration: "20s", target: n(1) }, { duration: "40s", target: n(1) }];
  if (PROFILE === "baseline") return [{ duration: "1m", target: n(1) }, { duration: "2m", target: n(1) }, { duration: "20s", target: 0 }];
  if (PROFILE === "ramp")
    return [
      { duration: "2m", target: n(0.25) },
      { duration: "2m", target: n(0.5) },
      { duration: "2m", target: n(1) },
      { duration: "4m", target: n(1) },
      { duration: "1m", target: 0 },
    ];
  if (PROFILE === "spike")
    return [
      { duration: "30s", target: n(0.05) },
      { duration: "10s", target: n(1) }, // sudden spike
      { duration: "3m", target: n(1) },
      { duration: "10s", target: n(0.05) }, // drop
      { duration: "2m", target: n(0.05) }, // recovery window
    ];
  if (PROFILE === "soak") return [{ duration: "2m", target: n(1) }, { duration: `${SOAK_MIN}m`, target: n(1) }, { duration: "1m", target: 0 }];
  throw new Error(`unknown PROFILE ${PROFILE}`);
}

const peak = PROFILE === "smoke" ? Number(__ENV.PEAK || 6) : PEAK;
const browsers = Math.round(peak * (1 - ORDER_SHARE));
const buyers = peak - browsers;
export const options = {
  discardResponseBodies: false,
  scenarios: {
    browse: { executor: "ramping-vus", exec: "browse", startVUs: 0, stages: stagesFor(browsers), gracefulRampDown: "30s" },
    order: { executor: "ramping-vus", exec: "order", startVUs: 0, stages: stagesFor(buyers), gracefulRampDown: "60s" },
    admin: {
      executor: "constant-vus",
      exec: "admin",
      vus: PROFILE === "smoke" ? 2 : 6,
      duration: PROFILE === "soak" ? `${SOAK_MIN + 3}m` : PROFILE === "ramp" ? "11m" : PROFILE === "spike" ? "6m" : PROFILE === "baseline" ? "3m" : "60s",
    },
  },
  thresholds: {
    "page_latency{kind:storefront}": ["p(95)<1500", "p(99)<3000"],
    order_latency: ["p(95)<3000", "p(99)<6000"],
    page_errors: ["rate<0.01"],
    orders_dup_new_number: ["count==0"],
  },
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
};

// ── helpers ──────────────────────────────────────────────────────────────────
const think = (min, max) => sleep((min + Math.random() * (max - min)) * THINK);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function siteForVu() {
  const slug = (exec.vu.idInTest % 100) / 100 < ZAYTOUN_SHARE ? "zaytoun" : "bella-napoli";
  return META.find((m) => m.slug === slug);
}
function customerFor(meta) {
  const list = CUSTOMERS[meta.slug];
  return list[exec.vu.idInTest % list.length];
}

function get(meta, path, cookies, tag) {
  const res = http.get(`${SITES[meta.slug].base}${path}`, {
    headers: { Cookie: cookies, "Accept-Encoding": "gzip" },
    tags: { kind: "storefront", page: tag },
    redirects: 0,
    timeout: "60s",
  });
  pageLatency.add(res.timings.duration, { kind: "storefront", page: tag });
  const ok = res.status === 200;
  pageErrors.add(!ok, { page: tag });
  if (!ok && __ENV.DEBUG) console.warn(`${tag} ${path} -> ${res.status}`);
  return res;
}

/** Invokes a Next.js Server Action the way the browser does. Returns the action's ApiResult (or null). */
function serverAction(meta, path, actionId, args, cookies, tags) {
  const res = http.post(`${SITES[meta.slug].base}${path}`, JSON.stringify(args), {
    headers: {
      "Next-Action": actionId,
      "Content-Type": "text/plain;charset=UTF-8",
      Accept: "text/x-component",
      Cookie: cookies,
    },
    tags,
    redirects: 0,
    timeout: "60s",
  });
  let result = null;
  if (res.status === 200 && res.body) {
    // RSC payload: one line per chunk, "<id>:<json>"; the action's return value is the chunk holding "success"
    for (const line of String(res.body).split("\n")) {
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      const chunk = line.slice(idx + 1);
      if (chunk.startsWith("{") && chunk.includes('"success"')) {
        try {
          result = JSON.parse(chunk);
          break;
        } catch (_) {
          /* not this chunk */
        }
      }
    }
  }
  return { res, result };
}

function uuid() {
  const h = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 32; i++) s += h[Math.floor(Math.random() * 16)];
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20, 32)}`;
}

// ── scenarios ────────────────────────────────────────────────────────────────
export function browse() {
  const meta = siteForVu();
  const signedIn = exec.vu.idInTest % 2 === 0; // half the browsers are signed in (one extra count query per page)
  const customer = customerFor(meta);
  const tray = `${meta.trayCookie}=${pick(meta.trays.pickup)}`;
  const cookies = signedIn ? `rp_customer_session=${customer.session}; ${tray}` : tray;
  const base = `/r/${meta.slug}`;

  get(meta, base, cookies, "home");
  think(2, 5);
  get(meta, `${base}/menu`, cookies, "menu");
  think(2, 5);
  get(meta, `${base}/menu/${pick(meta.itemSlugs)}`, cookies, "item");
  think(2, 4);
  // "add to cart" writes a browser cookie only (no request); viewing the cart renders it server-side
  get(meta, `${base}/cart`, cookies, "cart");
  think(3, 6);
  if (Math.random() < 0.3) {
    get(meta, `${base}/reviews`, cookies, "reviews");
    think(2, 4);
  }
  if (Math.random() < 0.2) {
    get(meta, `${base}/locations`, cookies, "locations");
    think(2, 4);
  }
}

export function order() {
  const meta = siteForVu();
  const customer = customerFor(meta);
  const actions = ACTIONS[meta.slug];
  const delivery = Math.random() < 0.5;
  const tray = `${meta.trayCookie}=${pick(delivery ? meta.trays.delivery : meta.trays.pickup)}`;
  const cookies = `rp_customer_session=${customer.session}; ${tray}`;
  const base = `/r/${meta.slug}`;

  get(meta, `${base}/menu`, cookies, "menu");
  think(2, 5);
  // adding/changing quantities = cookie writes in the browser; a promo check is the one cart request
  if (Math.random() < 0.3) {
    serverAction(meta, `${base}/cart`, actions.checkCoupon, [meta.slug, { code: "NOPE", orderType: delivery ? "delivery" : "pickup", subtotal: "2000.00" }], cookies, {
      kind: "action",
      name: "checkCoupon",
    });
  }
  get(meta, `${base}/cart`, cookies, "cart");
  think(2, 5);
  get(meta, `${base}/checkout`, cookies, "checkout");
  think(5, 12); // filling the checkout form

  const payload = {
    orderType: delivery ? "delivery" : "pickup",
    fullName: customer.name,
    phone: customer.phone,
    email: customer.email,
    paymentMethod: delivery ? "cash_on_delivery" : "cash",
    ...(delivery ? meta.address : {}),
    notes: "",
    idempotencyKey: uuid(),
  };
  const args = [meta.slug, payload];
  const tags = { kind: "action", name: "placeOrder" };
  const started = Date.now();
  let first;
  let second = null;
  if (Math.random() < DUP_SHARE) {
    // a double submit / network retry: the same checkout sent twice at once
    const reqs = [0, 1].map(() => ({
      method: "POST",
      url: `${SITES[meta.slug].base}${base}/checkout`,
      body: JSON.stringify(args),
      params: { headers: { "Next-Action": actions.placeOrder, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component", Cookie: cookies }, tags, timeout: "60s" },
    }));
    const [a, b] = http.batch(reqs);
    const parse = (res) => {
      for (const line of String(res.body || "").split("\n")) {
        const chunk = line.slice(line.indexOf(":") + 1);
        if (chunk.startsWith("{") && chunk.includes('"success"')) {
          try { return JSON.parse(chunk); } catch (_) { /* next */ }
        }
      }
      return null;
    };
    first = { res: a, result: parse(a) };
    second = { res: b, result: parse(b) };
  } else {
    first = serverAction(meta, `${base}/checkout`, actions.placeOrder, args, cookies, tags);
  }
  orderLatency.add(Date.now() - started);

  const ok = first.result && first.result.success === true;
  check(first.res, { "order placed": () => ok });
  if (!ok) {
    ordersFailed.add(1);
    if (__ENV.DEBUG) console.warn(`order failed ${first.res.status} ${JSON.stringify(first.result) || String(first.res.body).slice(0, 300)}`);
    return;
  }
  ordersPlaced.add(1);
  const orderNumber = first.result.data.orderNumber;
  if (second) {
    if (second.result && second.result.success) {
      if (second.result.data.orderNumber === orderNumber) ordersReplayed.add(1);
      else ordersDuplicated.add(1);
    }
  }

  think(1, 2);
  // the order tracking page (a fresh read from the database)
  get(meta, `${base}/order/${orderNumber}`, cookies, "order");
  think(5, 10);
  get(meta, `${base}/current-orders`, cookies, "current-orders");
}

export function admin() {
  const meta = META[exec.vu.idInTest % 2]; // admins at both restaurants
  const actions = ACTIONS[meta.slug];
  const cookies = `rp_admin_session=${meta.staffSession}`;
  const base = `/r/${meta.slug}/admin`;
  const t = (name) => ({ tags: { kind: "admin", page: name }, headers: { Cookie: cookies }, redirects: 0, timeout: "60s" });

  let since = new Date(Date.now() - 60_000).toISOString();
  for (let i = 0; i < 6; i++) {
    const poll = http.get(`${SITES[meta.slug].base}${base}/orders/activity?since=${encodeURIComponent(since)}`, t("activity"));
    adminLatency.add(poll.timings.duration, { page: "activity" });
    pageErrors.add(poll.status !== 200, { page: "admin-activity" });
    if (poll.status === 200) {
      const body = poll.json();
      since = body.data.now;
      // the kitchen confirms new orders as they arrive (each status change fires triggers + the outbox)
      for (const event of body.data.events.filter((e) => e.status === "pending").slice(0, 5)) {
        const { res, result } = serverAction(meta, `${base}/orders`, actions.updateOrderStatus, [{ orderId: event.id, status: "confirmed" }], cookies, {
          kind: "admin",
          page: "status",
        });
        adminLatency.add(res.timings.duration, { page: "status" });
        if (result && result.success) statusChanges.add(1);
      }
    }
    sleep(7); // OrderActivityWatcher polls every 7 s
  }
  for (const page of ["/orders", "/kitchen", ""]) {
    const res = http.get(`${SITES[meta.slug].base}${base}${page}`, t(page || "dashboard"));
    adminLatency.add(res.timings.duration, { page: page || "dashboard" });
    pageErrors.add(res.status !== 200, { page: `admin${page}` });
  }
}
