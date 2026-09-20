import { describe, expect, it } from "vitest";
import { cartSubtotal, calculatePricing, computeCouponDiscount, effectiveMinimumOrder, lineTotal, PricingError, tryCalculatePricing, validateCouponOrThrow, type CouponPricing } from "@/server/domain/pricing";
import { restaurantSettingsSchema } from "@/shared/contract/settings";
import { formatMoney, toMoney } from "@/shared/money";

const settings = restaurantSettingsSchema.parse({
  tax: { enabled: true, rate: 5, included: false, applyOnDeliveryFee: false, label: "GST" },
  ordering: { minimumOrderAmount: 500, preparationTimeMinutes: 20 },
  delivery: { enabled: true, defaultEtaMinutes: 40 },
  serviceFee: { enabled: false, rate: 0, orderTypes: ["dine_in"] },
});

const zone = {
  id: "zone-1",
  name: "Gulberg & Garden Town",
  deliveryFee: "100.00",
  minOrderAmount: "800.00",
  freeDeliveryOver: "3000.00",
};

const welcomeCoupon: CouponPricing = {
  id: "coupon-1",
  code: "WELCOME10",
  discountType: "percentage",
  discountValue: "10.00",
  minOrderAmount: "1000.00",
  maxDiscountAmount: "400.00",
  appliesTo: "order",
  orderTypes: ["delivery", "pickup", "dine_in"],
  startsAt: null,
  endsAt: null,
  usageLimit: 100,
  usageLimitPerCustomer: 1,
  usedCount: 0,
  isActive: true,
};

describe("pricing engine", () => {
  it("computes line totals from unit price, add-ons and quantity", () => {
    expect(lineTotal({ unitPrice: "1250.00", addonsTotal: "200.00", quantity: 2 }).toFixed(2)).toBe("2900.00");
    expect(cartSubtotal([
      { unitPrice: "950.00", addonsTotal: "0", quantity: 1 },
      { unitPrice: "350.00", addonsTotal: "40.00", quantity: 3 },
    ]).toFixed(2)).toBe("2120.00");
  });

  it("is exact for values that break binary floating point", () => {
    const subtotal = cartSubtotal([
      { unitPrice: "0.10", addonsTotal: "0.20", quantity: 1 },
      { unitPrice: "0.30", addonsTotal: "0", quantity: 1 },
    ]);
    expect(subtotal.toFixed(2)).toBe("0.60"); // 0.1 + 0.2 + 0.3 in floats is 0.6000000000000001
  });

  it("adds delivery fee, tax and produces the grand total", () => {
    const pricing = calculatePricing({
      lines: [{ unitPrice: "1250.00", addonsTotal: "200.00", quantity: 1 }],
      orderType: "delivery",
      settings,
      zone,
    });
    expect(pricing.subtotal).toBe("1450.00");
    expect(pricing.deliveryFee).toBe("100.00");
    expect(pricing.tax).toBe("72.50"); // 5% of 1450 (delivery fee not taxed)
    expect(pricing.total).toBe("1622.50");
  });

  it("applies a percentage coupon capped at max_discount_amount", () => {
    const pricing = calculatePricing({
      lines: [{ unitPrice: "5000.00", addonsTotal: "0", quantity: 1 }],
      orderType: "pickup",
      settings,
      coupon: welcomeCoupon,
    });
    expect(pricing.discount).toBe("400.00"); // 10% would be 500, capped at 400
    expect(pricing.orderDiscount).toBe("400.00");
    expect(pricing.tax).toBe("230.00"); // 5% of the discounted 4,600
    expect(pricing.total).toBe("4830.00");
  });

  it("waives the delivery fee above the free-delivery threshold", () => {
    const pricing = calculatePricing({
      lines: [{ unitPrice: "3200.00", addonsTotal: "0", quantity: 1 }],
      orderType: "delivery",
      settings,
      zone,
    });
    expect(pricing.deliveryFee).toBe("0.00");
    expect(pricing.freeDeliveryApplied).toBe(true);
  });

  it("applies a delivery-fee coupon only to the fee", () => {
    const freeDelivery: CouponPricing = {
      ...welcomeCoupon,
      code: "FREEDEL",
      discountType: "fixed",
      discountValue: "150.00",
      minOrderAmount: "1000.00",
      maxDiscountAmount: null,
      appliesTo: "delivery_fee",
    };
    const pricing = calculatePricing({
      lines: [{ unitPrice: "1500.00", addonsTotal: "0", quantity: 1 }],
      orderType: "delivery",
      settings,
      zone,
      coupon: freeDelivery,
    });
    // the promo covers the fee only: food stays taxable, delivery drops to zero
    expect(pricing.discount).toBe("100.00");
    expect(pricing.deliveryDiscount).toBe("100.00");
    expect(pricing.orderDiscount).toBe("0.00");
    expect(pricing.deliveryFee).toBe("0.00");
    expect(pricing.tax).toBe("75.00");
    expect(pricing.total).toBe("1575.00");
  });

  it("never charges a delivery fee for pickup", () => {
    const pricing = calculatePricing({
      lines: [{ unitPrice: "900.00", addonsTotal: "0", quantity: 1 }],
      orderType: "pickup",
      settings,
    });
    expect(pricing.deliveryFee).toBe("0.00");
    expect(pricing.total).toBe("945.00");
  });

  it("extracts tax when prices are tax inclusive", () => {
    const inclusive = restaurantSettingsSchema.parse({
      ...settings,
      tax: { enabled: true, rate: 5, included: true, applyOnDeliveryFee: false, label: "GST" },
    });
    const pricing = calculatePricing({
      lines: [{ unitPrice: "1050.00", addonsTotal: "0", quantity: 1 }],
      orderType: "pickup",
      settings: inclusive,
    });
    expect(pricing.taxIncluded).toBe(true);
    expect(pricing.tax).toBe("50.00");
    expect(pricing.total).toBe("1050.00");
  });

  it("rejects orders below the effective minimum", () => {
    const result = tryCalculatePricing({
      lines: [{ unitPrice: "300.00", addonsTotal: "0", quantity: 1 }],
      orderType: "delivery",
      settings,
      zone,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MIN_ORDER_NOT_MET");
      expect(result.error.details?.minimumOrderAmount).toBe("800.00");
    }
  });

  it("requires a delivery zone for delivery orders", () => {
    expect(() =>
      calculatePricing({ lines: [{ unitPrice: "900.00", addonsTotal: "0", quantity: 1 }], orderType: "delivery", settings }),
    ).toThrowError(PricingError);
  });

  it("charges a service fee only for the configured order types", () => {
    const withService = restaurantSettingsSchema.parse({
      ...settings,
      serviceFee: { enabled: true, rate: 10, orderTypes: ["dine_in"] },
    });
    const dineIn = calculatePricing({
      lines: [{ unitPrice: "1000.00", addonsTotal: "0", quantity: 1 }],
      orderType: "dine_in",
      settings: withService,
    });
    expect(dineIn.serviceFee).toBe("100.00");
    expect(dineIn.total).toBe("1155.00"); // 1000 + 100 service + 5% tax on 1100

    const pickup = calculatePricing({
      lines: [{ unitPrice: "1000.00", addonsTotal: "0", quantity: 1 }],
      orderType: "pickup",
      settings: withService,
    });
    expect(pickup.serviceFee).toBe("0.00");
  });
});

describe("coupon validation", () => {
  const subtotal = "1500.00";
  const now = new Date("2026-03-10T12:00:00Z");

  it("rejects expired coupons", () => {
    const expired = { ...welcomeCoupon, endsAt: "2026-03-01T00:00:00Z" };
    expect(() => validateCouponOrThrow(expired, { subtotal, orderType: "delivery", now })).toThrowError(/expired/i);
  });

  it("rejects coupons that have not started", () => {
    const future = { ...welcomeCoupon, startsAt: "2026-04-01T00:00:00Z" };
    expect(() => validateCouponOrThrow(future, { subtotal, orderType: "delivery", now })).toThrowError(/not active yet/i);
  });

  it("enforces the global usage limit", () => {
    const exhausted = { ...welcomeCoupon, usageLimit: 10, usedCount: 10 };
    expect(() => validateCouponOrThrow(exhausted, { subtotal, orderType: "delivery", now })).toThrowError(/usage limit/i);
  });

  it("enforces the per-customer usage limit", () => {
    expect(() =>
      validateCouponOrThrow(welcomeCoupon, { subtotal, orderType: "delivery", now, couponUsageByCustomer: 1 }),
    ).toThrowError(/already used/i);
  });

  it("enforces minimum order and allowed order types", () => {
    expect(() => validateCouponOrThrow(welcomeCoupon, { subtotal: "500.00", orderType: "delivery", now })).toThrowError(/minimum/i);
    const deliveryOnly = { ...welcomeCoupon, orderTypes: ["delivery" as const] };
    expect(() => validateCouponOrThrow(deliveryOnly, { subtotal, orderType: "pickup", now })).toThrowError(/order type/i);
  });

  it("caps fixed discounts at the eligible amount", () => {
    const fixed = { ...welcomeCoupon, discountType: "fixed" as const, discountValue: "5000.00", maxDiscountAmount: null };
    expect(computeCouponDiscount(fixed, new (require("decimal.js"))(subtotal), new (require("decimal.js"))(0)).toFixed(2)).toBe("1500.00");
  });
});

describe("money helpers", () => {
  it("formats currency from the database settings", () => {
    expect(formatMoney("1622.50", { currency: "PKR", symbol: "Rs" })).toBe("Rs 1,622.50");
    expect(formatMoney("1500.00", { currency: "PKR", symbol: "Rs", compact: true })).toBe("Rs 1,500");
  });

  it("rounds half up to two decimals", () => {
    expect(toMoney("10.005")).toBe("10.01");
    expect(toMoney(0.1 + 0.2)).toBe("0.30");
  });
});
