import type {
  Cart, CartItem, Coupon, Customer, CustomerAddress, Delivery, DeliveryZone, MediaAsset, MenuAddon,
  MenuAddonGroup, MenuCategory, MenuItem, MenuItemVariant, Order, OrderItem, OrderItemAddon,
  OrderStatusEvent, Payment, Reservation, Restaurant, RestaurantLocation, Review, TeamMember,
  Website, WebsitePage,
} from "@/shared/contract/models";
import { restaurantFeaturesSchema, restaurantSettingsSchema, websiteConfigSchema } from "@/shared/contract/settings";
import type { MediaPurpose, OrderStatus, OrderType, PaymentMethod, PaymentStatus, ReservationStatus, RestaurantStatus, ReviewStatus, TeamRole, WebsiteStatus, CartStatus, DeliveryStatus, CouponDiscountType } from "@/shared/contract/enums";
import { parseOpeningHours, parseAvailabilityWindow } from "@/shared/hours";

/**
 * Row mappers: snake_case columns → typed contract models.
 * JSONB columns are parsed defensively so bad configuration degrades to
 * defaults instead of breaking a page.
 */
export type Row = Record<string, unknown>;

export const str = (value: unknown): string => (value === null || value === undefined ? "" : String(value));
export const strOrNull = (value: unknown): string | null =>
  value === null || value === undefined || value === "" ? null : String(value);
export const numOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};
export const num = (value: unknown, fallback = 0): number => numOrNull(value) ?? fallback;
export const bool = (value: unknown, fallback = false): boolean =>
  typeof value === "boolean" ? value : value === null || value === undefined ? fallback : value === "t" || value === "true";
export const iso = (value: unknown): string | null => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
export const isoRequired = (value: unknown): string => iso(value) ?? new Date().toISOString();
export const jsonObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
export const jsonArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
export const textArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
export const money = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "0.00";
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
};

export function mapRestaurant(row: Row): Restaurant {
  return {
    id: str(row.id),
    name: str(row.name),
    slug: str(row.slug),
    legalName: strOrNull(row.legal_name),
    description: strOrNull(row.description),
    shortDescription: strOrNull(row.short_description),
    cuisines: textArray(row.cuisines),
    phone: strOrNull(row.phone),
    whatsapp: strOrNull(row.whatsapp),
    email: strOrNull(row.email),
    websiteUrl: strOrNull(row.website_url),
    logoUrl: strOrNull(row.logo_url),
    coverUrl: strOrNull(row.cover_url),
    primaryColor: strOrNull(row.primary_color),
    currency: str(row.currency) || "PKR",
    currencySymbol: str(row.currency_symbol) || "Rs",
    locale: str(row.locale) || "en",
    timezone: str(row.timezone) || "Asia/Karachi",
    country: str(row.country) || "PK",
    status: str(row.status) as RestaurantStatus,
    plan: str(row.plan) || "standard",
    planStatus: str(row.plan_status) || "active",
    features: restaurantFeaturesSchema.parse(jsonObject(row.features)),
    settings: restaurantSettingsSchema.parse(jsonObject(row.settings)),
    social: Object.fromEntries(
      Object.entries(jsonObject(row.social)).filter(([, value]) => typeof value === "string"),
    ) as Record<string, string>,
    seo: jsonObject(row.seo),
    createdAt: isoRequired(row.created_at),
    updatedAt: isoRequired(row.updated_at),
  };
}

export function mapLocation(row: Row): RestaurantLocation {
  return {
    id: str(row.id),
    restaurantId: str(row.restaurant_id),
    name: str(row.name),
    slug: str(row.slug),
    isPrimary: bool(row.is_primary),
    isActive: bool(row.is_active, true),
    addressLine1: strOrNull(row.address_line1),
    addressLine2: strOrNull(row.address_line2),
    area: strOrNull(row.area),
    city: strOrNull(row.city),
    state: strOrNull(row.state),
    postalCode: strOrNull(row.postal_code),
    country: str(row.country) || "PK",
    phone: strOrNull(row.phone),
    email: strOrNull(row.email),
    latitude: numOrNull(row.latitude),
    longitude: numOrNull(row.longitude),
    hours: parseOpeningHours(row.hours),
    settings: jsonObject(row.settings),
    sortOrder: num(row.sort_order),
  };
}

export function mapTeamMember(row: Row): TeamMember {
  const permissions = jsonObject(row.permissions);
  return {
    id: str(row.id),
    restaurantId: str(row.restaurant_id),
    userId: strOrNull(row.user_id),
    locationId: strOrNull(row.location_id),
    email: str(row.email),
    fullName: str(row.full_name),
    phone: strOrNull(row.phone),
    role: str(row.role) as TeamRole,
    permissions: {
      allow: textArray(permissions.allow),
      deny: textArray(permissions.deny),
    },
    isActive: bool(row.is_active, true),
    lastLoginAt: iso(row.last_login_at),
    createdAt: isoRequired(row.created_at),
  };
}

export function mapWebsite(row: Row): Website {
  return {
    id: str(row.id),
    restaurantId: str(row.restaurant_id),
    name: str(row.name),
    domain: strOrNull(row.domain),
    subdomain: strOrNull(row.subdomain),
    status: str(row.status) as WebsiteStatus,
    isPrimary: bool(row.is_primary, true),
    theme: jsonObject(row.theme) as Website["theme"],
    config: websiteConfigSchema.parse(jsonObject(row.config)),
    seo: jsonObject(row.seo),
    publishedAt: iso(row.published_at),
  };
}

export function mapWebsitePage(row: Row): WebsitePage {
  return {
    id: str(row.id),
    websiteId: str(row.website_id),
    restaurantId: str(row.restaurant_id),
    slug: str(row.slug),
    title: str(row.title),
    description: strOrNull(row.description),
    isHome: bool(row.is_home),
    isPublished: bool(row.is_published, true),
    sortOrder: num(row.sort_order),
    seo: jsonObject(row.seo),
    sections: jsonArray(row.sections),
    config: jsonObject(row.config),
  };
}

export function mapMedia(row: Row): MediaAsset {
  return {
    id: str(row.id),
    restaurantId: str(row.restaurant_id),
    bucket: str(row.bucket),
    path: str(row.path),
    url: str(row.url),
    fileName: str(row.file_name),
    mimeType: str(row.mime_type),
    sizeBytes: num(row.size_bytes),
    width: numOrNull(row.width),
    height: numOrNull(row.height),
    purpose: str(row.purpose) as MediaPurpose,
    altText: strOrNull(row.alt_text),
    tags: textArray(row.tags),
    createdAt: isoRequired(row.created_at),
  };
}

export function mapMenuCategory(row: Row): MenuCategory {
  return {
    id: str(row.id),
    restaurantId: str(row.restaurant_id),
    locationId: strOrNull(row.location_id),
    name: str(row.name),
    slug: str(row.slug),
    description: strOrNull(row.description),
    imageUrl: strOrNull(row.image_url),
    icon: strOrNull(row.icon),
    sortOrder: num(row.sort_order),
    isActive: bool(row.is_active, true),
    isFeatured: bool(row.is_featured),
    availability: parseAvailabilityWindow(row.availability),
    itemCount: numOrNull(row.item_count) ?? undefined,
  };
}

export function mapVariant(row: Row): MenuItemVariant {
  return {
    id: str(row.id),
    menuItemId: str(row.menu_item_id),
    name: str(row.name),
    price: money(row.price),
    priceMode: (str(row.price_mode) === "delta" ? "delta" : "absolute") as "absolute" | "delta",
    isDefault: bool(row.is_default),
    isAvailable: bool(row.is_available, true),
    sortOrder: num(row.sort_order),
  };
}

export function mapAddon(row: Row): MenuAddon {
  return {
    id: str(row.id),
    addonGroupId: str(row.addon_group_id),
    name: str(row.name),
    description: strOrNull(row.description),
    price: money(row.price),
    isDefault: bool(row.is_default),
    isAvailable: bool(row.is_available, true),
    maxQuantity: Math.max(1, num(row.max_quantity, 1)),
    sortOrder: num(row.sort_order),
  };
}

export function mapAddonGroup(row: Row, addons: MenuAddon[] = []): MenuAddonGroup {
  return {
    id: str(row.id),
    menuItemId: str(row.menu_item_id),
    name: str(row.name),
    description: strOrNull(row.description),
    isRequired: bool(row.is_required),
    minSelect: num(row.min_select),
    maxSelect: Math.max(1, num(row.max_select, 1)),
    sortOrder: num(row.sort_order),
    isActive: bool(row.is_active, true),
    addons,
  };
}

export function mapMenuItem(row: Row): MenuItem {
  return {
    id: str(row.id),
    restaurantId: str(row.restaurant_id),
    categoryId: str(row.category_id),
    categoryName: strOrNull(row.category_name) ?? undefined,
    categorySlug: strOrNull(row.category_slug) ?? undefined,
    name: str(row.name),
    slug: str(row.slug),
    description: strOrNull(row.description),
    shortDescription: strOrNull(row.short_description),
    imageUrl: strOrNull(row.image_url),
    basePrice: money(row.base_price),
    compareAtPrice: row.compare_at_price === null || row.compare_at_price === undefined ? null : money(row.compare_at_price),
    costPrice: row.cost_price === null || row.cost_price === undefined ? null : money(row.cost_price),
    sku: strOrNull(row.sku),
    calories: numOrNull(row.calories),
    spiceLevel: num(row.spice_level),
    prepTimeMinutes: num(row.prep_time_minutes, 15),
    isActive: bool(row.is_active, true),
    isAvailable: bool(row.is_available, true),
    isFeatured: bool(row.is_featured),
    dietaryTags: textArray(row.dietary_tags),
    allergens: textArray(row.allergens),
    sortOrder: num(row.sort_order),
    availability: parseAvailabilityWindow(row.availability),
    variants: [],
    addonGroups: [],
    ratingAverage: numOrNull(row.rating_average) ?? undefined,
    ratingCount: numOrNull(row.rating_count) ?? undefined,
  };
}

export function mapCoupon(row: Row): Coupon {
  return {
    id: str(row.id),
    restaurantId: str(row.restaurant_id),
    code: str(row.code),
    description: strOrNull(row.description),
    discountType: str(row.discount_type) as CouponDiscountType,
    discountValue: money(row.discount_value),
    minOrderAmount: money(row.min_order_amount),
    maxDiscountAmount: row.max_discount_amount === null || row.max_discount_amount === undefined ? null : money(row.max_discount_amount),
    appliesTo: str(row.applies_to) === "delivery_fee" ? "delivery_fee" : "order",
    orderTypes: (Array.isArray(row.order_types) ? row.order_types : []).map((entry) => str(entry) as OrderType),
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    usageLimit: numOrNull(row.usage_limit),
    usageLimitPerCustomer: numOrNull(row.usage_limit_per_customer),
    usedCount: num(row.used_count),
    isActive: bool(row.is_active, true),
  };
}

export function mapDeliveryZone(row: Row): DeliveryZone {
  return {
    id: str(row.id),
    restaurantId: str(row.restaurant_id),
    locationId: str(row.location_id),
    name: str(row.name),
    description: strOrNull(row.description),
    areas: textArray(row.areas),
    postalCodes: textArray(row.postal_codes),
    deliveryFee: money(row.delivery_fee),
    minOrderAmount: money(row.min_order_amount),
    freeDeliveryOver: row.free_delivery_over === null || row.free_delivery_over === undefined ? null : money(row.free_delivery_over),
    etaMinMinutes: num(row.eta_min_minutes, 30),
    etaMaxMinutes: num(row.eta_max_minutes, 45),
    isActive: bool(row.is_active, true),
    sortOrder: num(row.sort_order),
  };
}

export function mapCustomer(row: Row): Customer {
  return {
    id: str(row.id),
    restaurantId: str(row.restaurant_id),
    userId: strOrNull(row.user_id),
    fullName: str(row.full_name),
    email: strOrNull(row.email),
    phone: str(row.phone),
    notes: strOrNull(row.notes),
    marketingOptIn: bool(row.marketing_opt_in),
    isBlocked: bool(row.is_blocked),
    isGuest: bool(row.is_guest, true),
    totalOrders: num(row.total_orders),
    totalSpent: money(row.total_spent),
    lastOrderAt: iso(row.last_order_at),
    createdAt: isoRequired(row.created_at),
  };
}

export function mapAddress(row: Row): CustomerAddress {
  return {
    id: str(row.id),
    customerId: str(row.customer_id),
    label: str(row.label) || "Home",
    recipientName: strOrNull(row.recipient_name),
    phone: strOrNull(row.phone),
    addressLine1: str(row.address_line1),
    addressLine2: strOrNull(row.address_line2),
    area: strOrNull(row.area),
    city: strOrNull(row.city),
    postalCode: strOrNull(row.postal_code),
    deliveryNotes: strOrNull(row.delivery_notes),
    latitude: numOrNull(row.latitude),
    longitude: numOrNull(row.longitude),
    isDefault: bool(row.is_default),
  };
}

export function mapCart(row: Row, items: CartItem[] = []): Cart {
  return {
    id: str(row.id),
    restaurantId: str(row.restaurant_id),
    customerId: strOrNull(row.customer_id),
    locationId: strOrNull(row.location_id),
    sessionToken: str(row.session_token),
    status: str(row.status) as CartStatus,
    orderType: str(row.order_type) as OrderType,
    couponId: strOrNull(row.coupon_id),
    couponCode: strOrNull(row.coupon_code),
    currency: str(row.currency) || "PKR",
    notes: strOrNull(row.notes),
    items,
    itemCount: items.reduce((total, item) => total + item.quantity, 0),
  };
}

export function mapCartItem(row: Row, addons: CartItem["addons"] = []): CartItem {
  return {
    id: str(row.id),
    cartId: str(row.cart_id),
    menuItemId: str(row.menu_item_id),
    variantId: strOrNull(row.variant_id),
    itemName: str(row.item_name),
    variantName: strOrNull(row.variant_name),
    imageUrl: strOrNull(row.image_url),
    slug: strOrNull(row.slug),
    quantity: num(row.quantity, 1),
    unitPrice: money(row.unit_price),
    addonsTotal: money(row.addons_total),
    lineTotal: money(row.line_total),
    specialInstructions: strOrNull(row.special_instructions),
    isAvailable: bool(row.is_available, true),
    addons,
  };
}

export function mapCartAddon(row: Row): CartItem["addons"][number] {
  return {
    id: str(row.id),
    cartItemId: str(row.cart_item_id),
    menuAddonId: str(row.menu_addon_id),
    addonGroupId: strOrNull(row.addon_group_id),
    groupName: str(row.group_name),
    addonName: str(row.addon_name),
    unitPrice: money(row.unit_price),
    quantity: num(row.quantity, 1),
  };
}

export function mapOrderItem(row: Row, addons: OrderItemAddon[] = []): OrderItem {
  return {
    id: str(row.id),
    orderId: str(row.order_id),
    menuItemId: strOrNull(row.menu_item_id),
    variantId: strOrNull(row.variant_id),
    itemName: str(row.item_name),
    variantName: strOrNull(row.variant_name),
    quantity: num(row.quantity, 1),
    unitPrice: money(row.unit_price),
    addonsTotal: money(row.addons_total),
    lineTotal: money(row.line_total),
    specialInstructions: strOrNull(row.special_instructions),
    imageUrl: strOrNull(row.image_url),
    slug: strOrNull(row.slug),
    addons,
  };
}

export function mapOrderItemAddon(row: Row): OrderItemAddon {
  return {
    id: str(row.id),
    orderItemId: str(row.order_item_id),
    menuAddonId: strOrNull(row.menu_addon_id),
    groupName: str(row.group_name),
    addonName: str(row.addon_name),
    unitPrice: money(row.unit_price),
    quantity: num(row.quantity, 1),
  };
}

export function mapOrderStatusEvent(row: Row): OrderStatusEvent {
  return {
    id: str(row.id),
    orderId: str(row.order_id),
    fromStatus: (strOrNull(row.from_status) as OrderStatus | null) ?? null,
    toStatus: str(row.to_status) as OrderStatus,
    note: strOrNull(row.note),
    changedByName: strOrNull(row.changed_by_name),
    createdAt: isoRequired(row.created_at),
  };
}

export function mapPayment(row: Row): Payment {
  return {
    id: str(row.id),
    orderId: str(row.order_id),
    provider: str(row.provider) || "cash",
    method: str(row.method) as PaymentMethod,
    status: str(row.status) as PaymentStatus,
    amount: money(row.amount),
    currency: str(row.currency) || "PKR",
    transactionId: strOrNull(row.transaction_id),
    failureReason: strOrNull(row.failure_reason),
    paidAt: iso(row.paid_at),
  };
}

export function mapDelivery(row: Row): Delivery {
  return {
    id: str(row.id),
    orderId: str(row.order_id),
    status: str(row.status) as DeliveryStatus,
    driverName: strOrNull(row.driver_name),
    driverPhone: strOrNull(row.driver_phone),
    trackingUrl: strOrNull(row.tracking_url),
    currentLatitude: numOrNull(row.current_latitude),
    currentLongitude: numOrNull(row.current_longitude),
    distanceKm: row.distance_km === null || row.distance_km === undefined ? null : money(row.distance_km),
    deliveryFee: money(row.delivery_fee),
    assignedAt: iso(row.assigned_at),
    pickedUpAt: iso(row.picked_up_at),
    estimatedArrivalAt: iso(row.estimated_arrival_at),
    deliveredAt: iso(row.delivered_at),
    failureReason: strOrNull(row.failure_reason),
    notes: strOrNull(row.notes),
  };
}

export function mapOrder(row: Row): Order {
  return {
    id: str(row.id),
    restaurantId: str(row.restaurant_id),
    locationId: strOrNull(row.location_id),
    locationName: strOrNull(row.location_name),
    customerId: strOrNull(row.customer_id),
    orderNumber: str(row.order_number),
    orderType: str(row.order_type) as OrderType,
    status: str(row.status) as OrderStatus,
    customerName: str(row.customer_name),
    customerEmail: strOrNull(row.customer_email),
    customerPhone: str(row.customer_phone),
    deliveryAddress: (jsonObject(row.delivery_address) as Order["deliveryAddress"]) ?? null,
    deliveryZoneId: strOrNull(row.delivery_zone_id),
    deliveryZoneName: strOrNull(row.delivery_zone_name),
    tableNumber: strOrNull(row.table_number),
    guests: numOrNull(row.guests),
    scheduledFor: iso(row.scheduled_for),
    couponCode: strOrNull(row.coupon_code),
    subtotal: money(row.subtotal),
    discountAmount: money(row.discount_amount),
    deliveryFee: money(row.delivery_fee),
    taxAmount: money(row.tax_amount),
    serviceFee: money(row.service_fee),
    tipAmount: money(row.tip_amount),
    total: money(row.total),
    currency: str(row.currency) || "PKR",
    taxRate: row.tax_rate === null || row.tax_rate === undefined ? "0" : String(row.tax_rate),
    pricingBreakdown: jsonObject(row.pricing_breakdown),
    paymentMethod: str(row.payment_method) as PaymentMethod,
    paymentStatus: str(row.payment_status) as PaymentStatus,
    notes: strOrNull(row.notes),
    specialInstructions: strOrNull(row.special_instructions),
    placedBy: str(row.placed_by) === "staff" ? "staff" : "customer",
    cancelReason: strOrNull(row.cancel_reason),
    estimatedReadyAt: iso(row.estimated_ready_at),
    createdAt: isoRequired(row.created_at),
    updatedAt: isoRequired(row.updated_at),
    completedAt: iso(row.completed_at),
  };
}

export function mapReview(row: Row): Review {
  return {
    id: str(row.id),
    restaurantId: str(row.restaurant_id),
    customerId: strOrNull(row.customer_id),
    orderId: strOrNull(row.order_id),
    menuItemId: strOrNull(row.menu_item_id),
    itemName: strOrNull(row.item_name),
    authorName: str(row.author_name),
    rating: num(row.rating, 5),
    title: strOrNull(row.title),
    comment: strOrNull(row.comment),
    status: str(row.status) as ReviewStatus,
    isFeatured: bool(row.is_featured),
    response: strOrNull(row.response),
    respondedAt: iso(row.responded_at),
    createdAt: isoRequired(row.created_at),
  };
}

export function mapReservation(row: Row): Reservation {
  return {
    id: str(row.id),
    restaurantId: str(row.restaurant_id),
    locationId: str(row.location_id),
    locationName: strOrNull(row.location_name),
    customerId: strOrNull(row.customer_id),
    confirmationCode: str(row.confirmation_code),
    guestName: str(row.guest_name),
    guestEmail: strOrNull(row.guest_email),
    guestPhone: str(row.guest_phone),
    reservationDate: str(row.reservation_date).slice(0, 10),
    reservationTime: str(row.reservation_time).slice(0, 5),
    durationMinutes: num(row.duration_minutes, 90),
    guests: num(row.guests, 2),
    tableNumber: strOrNull(row.table_number),
    specialRequests: strOrNull(row.special_requests),
    occasion: strOrNull(row.occasion),
    status: str(row.status) as ReservationStatus,
    notes: strOrNull(row.notes),
    createdAt: isoRequired(row.created_at),
  };
}
