// Server Action ids for the k6 scripts. They differ per build, so read them from each test build's manifest.
//   node scripts/load/actions.mjs bella-napoli=.next-load-bella zaytoun=.next-load-zaytoun   → scripts/load/.out/actions.json
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const wanted = { placeOrder: ["placeOrderAction", "checkout/page"], checkCoupon: ["checkCouponAction", "cart/page"], updateOrderStatus: ["updateOrderStatusAction", "orders/page"] };
const out = {};
for (const arg of process.argv.slice(2)) {
  const [slug, dist] = arg.split("=");
  const manifest = JSON.parse(readFileSync(`${dist}/server/server-reference-manifest.json`, "utf8")).node;
  out[slug] = Object.fromEntries(
    Object.entries(wanted).map(([key, [name, worker]]) => {
      const entry = Object.entries(manifest).find(([, v]) => v.exportedName === name && Object.keys(v.workers).some((w) => w.includes(worker)));
      if (!entry) throw new Error(`${name} not found in ${dist}`);
      return [key, entry[0]];
    }),
  );
}
mkdirSync("scripts/load/.out", { recursive: true });
writeFileSync("scripts/load/.out/actions.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));
