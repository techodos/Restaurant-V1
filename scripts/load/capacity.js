// Open-model capacity probe for ONE server process: a fixed arrival rate of storefront page views (the real mix,
// half signed in), stepped up so the knee (where p95 climbs) is visible per step.
//   k6 run -e URL=http://localhost:3201 -e SLUG=bella-napoli -e RATES=4,8,12,16 -e STEP=60s capacity.js
import http from "k6/http";
import { Trend } from "k6/metrics";
import { SharedArray } from "k6/data";

const URL = __ENV.URL || "http://localhost:3201";
const SLUG = __ENV.SLUG || "bella-napoli";
const RATES = (__ENV.RATES || "4,8,12,16").split(",").map(Number);
const STEP = __ENV.STEP || "60s";
const stepSeconds = Number(String(STEP).replace("s", ""));

const F = new SharedArray("f", () => {
  const f = JSON.parse(open("./.out/fixtures.json"))[SLUG];
  return [{ trayCookie: f.trayCookie, tray: f.trays.pickup[0], items: f.itemSlugs, sessions: f.customers.slice(0, 200).map((c) => c.session) }];
});
const MIX = [["home", 25], ["menu", 30], ["item", 20], ["cart", 15], ["reviews", 5], ["locations", 5]];
const latency = {};
for (const rate of RATES) latency[rate] = new Trend(`latency_at_${rate}rps`, true);

export const options = {
  discardResponseBodies: true,
  scenarios: Object.fromEntries(
    RATES.map((rate, i) => [
      `rate_${rate}`,
      {
        executor: "constant-arrival-rate",
        rate,
        timeUnit: "1s",
        duration: STEP,
        startTime: `${i * (stepSeconds + 10)}s`, // 10 s gap so one step's queue drains before the next
        preAllocatedVUs: rate * 4,
        maxVUs: rate * 40,
        exec: "visit",
        env: { RATE: String(rate) },
        tags: { rate: String(rate) },
      },
    ]),
  ),
  summaryTrendStats: ["med", "p(95)", "p(99)", "max"],
};

function pickPage() {
  let roll = Math.random() * 100;
  for (const [page, weight] of MIX) {
    if ((roll -= weight) < 0) return page;
  }
  return "home";
}

export function visit() {
  const f = F[0];
  const page = pickPage();
  const path = {
    home: `/r/${SLUG}`,
    menu: `/r/${SLUG}/menu`,
    item: `/r/${SLUG}/menu/${f.items[Math.floor(Math.random() * f.items.length)]}`,
    cart: `/r/${SLUG}/cart`,
    reviews: `/r/${SLUG}/reviews`,
    locations: `/r/${SLUG}/locations`,
  }[page];
  const signedIn = Math.random() < 0.5;
  const cookie = `${f.trayCookie}=${f.tray}${signedIn ? `; rp_customer_session=${f.sessions[Math.floor(Math.random() * f.sessions.length)]}` : ""}`;
  const res = http.get(`${URL}${path}`, { headers: { Cookie: cookie, "Accept-Encoding": "gzip" }, timeout: "60s" });
  latency[Number(__ENV.RATE)].add(res.timings.duration);
}
