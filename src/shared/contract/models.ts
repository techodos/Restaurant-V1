import type {
  CartStatus, CouponDiscountType, DeliveryStatus, MediaPurpose, OrderStatus, OrderType,
  PaymentMethod, PaymentStatus, ReservationStatus, RestaurantStatus, ReviewStatus,
  TeamRole, WebsiteStatus,
} from "./enums";
import type { RestaurantFeatures, RestaurantSettings, RestaurantTheme, WebsiteConfig } from "./settings";

/** All monetary values cross the wire as strings (PostgreSQL numeric). */
export type Money = string;

export interface DayHours {
  open: string;
  close: string;
}

export type OpeningHours = Partial<Record<"sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat", DayHours[]>>;

export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  legalName: string | null;
  description: string | null;
  shortDescription: string | null;
  cuisines: string[];
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  primaryColor: string | null;
  currency: string;
  currencySymbol: string;
  locale: string;
  timezone: string;
  country: string;
  status: RestaurantStatus;
  plan: string;
  planStatus: string;
  features: RestaurantFeatures;
  settings: RestaurantSettings;
  social: Record<string, string>;
  seo: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RestaurantLocation {
  id: string;
  restaurantId: string;
  name: string;
  slug: string;
  isPrimary: boolean;
  isActive: boolean;
  addressLine1: string | null;
  addressLine2: string | null;
  area: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  latitude: number | null;
  longitude: number | null;
  hours: OpeningHours;
  settings: Record<string, unknown>;
  sortOrder: number;
}

export interface TeamMember {
  id: string;
  restaurantId: string;
  userId: string | null;
  locationId: string | null;
  email: string;
  fullName: string;
  phone: string | null;
  role: TeamRole;
  permissions: { allow?: string[]; deny?: string[] };
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Website {
  id: string;
  restaurantId: string;
  name: string;
  domain: string | null;
  subdomain: string | null;
  status: WebsiteStatus;
  isPrimary: boolean;
  theme: RestaurantTheme;
  config: WebsiteConfig;
  seo: Record<string, unknown>;
  publishedAt: string | null;
}

export interface WebsitePage {
  id: string;
  websiteId: string;
  restaurantId: string;
  slug: string;
  title: string;
  description: string | null;
  isHome: boolean;
  isPublished: boolean;
  sortOrder: number;
  seo: Record<string, unknown>;
  sections: unknown[];
  config: Record<string, unknown>;
}

export interface MediaAsset {
  id: string;
  restaurantId: string;
  bucket: string;
  path: string;
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  purpose: MediaPurpose;
  altText: string | null;
  tags: string[];
  createdAt: string;
}

export interface MenuCategory {
  id: string;
  restaurantId: string;
  locationId: string | null;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  isFeatured: boolean;
  availability: AvailabilityWindow;
  itemCount?: number;
}

export interface AvailabilityWindow {
  days?: number[];
  from?: string;
  to?: string;
}

export interface MenuItemVariant {
  id: string;
  menuItemId: string;
  name: string;
  price: Money;
  priceMode: "absolute" | "delta";
  isDefault: boolean;
  isAvailable: boolean;
  sortOrder: number;
}

export interface MenuAddon {
  id: string;
  addonGroupId: string;
  name: string;
  description: string | null;
  price: Money;
  isDefault: boolean;
  isAvailable: boolean;
  maxQuantity: number;
  sortOrder: number;
}

export interface MenuAddonGroup {
  id: string;
  menuItemId: string;
  name: string;
  description: string | null;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  sortOrder: number;
  isActive: boolean;
  addons: MenuAddon[];
}

export interface MenuItem {
  id: string;
  restaurantId: string;
  categoryId: string;
  categoryName?: string;
  categorySlug?: string;
  name: string;
  slug: string;
  description: string | null;
  shortDescription: string | null;
  imageUrl: string | null;
  basePrice: Money;
  compareAtPrice: Money | null;
  costPrice?: Money | null;
  sku?: string | null;
  calories: number | null;
  spiceLevel: number;
  prepTimeMinutes: number;
  isActive: boolean;
  isAvailable: boolean;
  isFeatured: boolean;
  dietaryTags: string[];
  allergens: string[];
  sortOrder: number;
  availability: AvailabilityWindow;
  variants: MenuItemVariant[];
  addonGroups: MenuAddonGroup[];
  ratingAverage?: number | null;
  ratingCount?: number;
}

/** Effective price of an item given a chosen variant (server + client agree). */
export interface MenuItemPricing {
  basePrice: Money;
  variants: MenuItemVariant[];
  addonGroups: MenuAddonGroup[];
  hasVariants: boolean;
  hasAddons: boolean;
  requiresSelection: boolean;
  priceFrom: Money;
}

export interface MenuItemSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  basePrice: Money;
  compareAtPrice: Money | null;
  isAvailable: boolean;
  isFeatured: boolean;
  hasVariants: boolean;
  hasAddons: boolean;
  requiresSelection: boolean;
  priceFrom: Money;
  prepTimeMinutes: number;
  dietaryTags: string[];
  spiceLevel: number;
  categoryId: string;
  categorySlug?: string;
  categoryName?: string;
}

export interface RestaurantSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  shortDescription: string | null;
  cuisines: string[];
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  currency: string;
  currencySymbol: string;
  timezone: string;
  locale: string;
  status: RestaurantStatus;
  features: RestaurantFeatures;
  settings: RestaurantSettings;
  social: Record<string, string>;
  addressLine1?: string | null;
  area?: string | null;
  city?: string | null;
}

/** users — the login identity behind a customer or staff account. */
/** A customer's own login row lives on `customers` itself (0021) — one row per restaurant, not shared across them. */
export interface Customer {
  id: string;
  restaurantId: string;
  fullName: string;
  email: string | null;
  phone: string;
  notes: string | null;
  marketingOptIn: boolean;
  isBlocked: boolean;
  isGuest: boolean;
  emailVerified: boolean;
  authProvider: string;
  totalOrders: number;
  totalSpent: Money;
  lastOrderAt: string | null;
  createdAt: string;
}

export interface CustomerAddress {
  id: string;
  customerId: string;
  label: string;
  recipientName: string | null;
  phone: string | null;
  addressLine1: string;
  addressLine2: string | null;
  area: string | null;
  city: string | null;
  postalCode: string | null;
  deliveryNotes: string | null;
  latitude: number | null;
  longitude: number | null;
  isDefault: boolean;
}

export interface CartAddon {
  id: string;
  cartItemId: string;
  menuAddonId: string;
  addonGroupId: string | null;
  groupName: string;
  addonName: string;
  unitPrice: Money;
  quantity: number;
}

export interface CartItem {
  id: string;
  cartId: string;
  menuItemId: string;
  variantId: string | null;
  itemName: string;
  variantName: string | null;
  imageUrl: string | null;
  slug: string | null;
  quantity: number;
  unitPrice: Money;
  addonsTotal: Money;
  lineTotal: Money;
  specialInstructions: string | null;
  isAvailable: boolean;
  addons: CartAddon[];
}

export interface Cart {
  id: string;
  restaurantId: string;
  customerId: string | null;
  locationId: string | null;
  sessionToken: string;
  status: CartStatus;
  orderType: OrderType;
  couponId: string | null;
  couponCode: string | null;
  currency: string;
  notes: string | null;
  items: CartItem[];
  itemCount: number;
}

export interface DeliveryZone {
  id: string;
  restaurantId: string;
  locationId: string;
  name: string;
  description: string | null;
  areas: string[];
  postalCodes: string[];
  deliveryFee: Money;
  minOrderAmount: Money;
  freeDeliveryOver: Money | null;
  etaMinMinutes: number;
  etaMaxMinutes: number;
  isActive: boolean;
  sortOrder: number;
}

export interface Coupon {
  id: string;
  restaurantId: string;
  code: string;
  description: string | null;
  discountType: CouponDiscountType;
  discountValue: Money;
  minOrderAmount: Money;
  maxDiscountAmount: Money | null;
  appliesTo: "order" | "delivery_fee";
  orderTypes: OrderType[];
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  usageLimitPerCustomer: number | null;
  usedCount: number;
  isActive: boolean;
}

export interface OrderItemAddon {
  id: string;
  orderItemId: string;
  menuAddonId: string | null;
  groupName: string;
  addonName: string;
  unitPrice: Money;
  quantity: number;
}

export interface OrderItem {
  id: string;
  orderId: string;
  menuItemId: string | null;
  variantId: string | null;
  itemName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: Money;
  addonsTotal: Money;
  lineTotal: Money;
  specialInstructions: string | null;
  imageUrl?: string | null;
  slug?: string | null;
  addons: OrderItemAddon[];
}

export interface OrderStatusEvent {
  id: string;
  orderId: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  note: string | null;
  changedByName: string | null;
  createdAt: string;
}

export interface OrderAddress {
  line1?: string;
  line2?: string;
  area?: string;
  city?: string;
  postalCode?: string;
  notes?: string;
  latitude?: number;
  longitude?: number;
  label?: string;
}

export interface Delivery {
  id: string;
  orderId: string;
  status: DeliveryStatus;
  driverName: string | null;
  driverPhone: string | null;
  trackingUrl: string | null;
  currentLatitude: number | null;
  currentLongitude: number | null;
  distanceKm: Money | null;
  deliveryFee: Money;
  assignedAt: string | null;
  pickedUpAt: string | null;
  estimatedArrivalAt: string | null;
  deliveredAt: string | null;
  failureReason: string | null;
  notes: string | null;
}

export interface Payment {
  id: string;
  orderId: string;
  provider: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: Money;
  currency: string;
  transactionId: string | null;
  failureReason: string | null;
  paidAt: string | null;
}

export interface Order {
  id: string;
  restaurantId: string;
  locationId: string | null;
  locationName?: string | null;
  customerId: string | null;
  orderNumber: string;
  orderType: OrderType;
  status: OrderStatus;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string;
  deliveryAddress: OrderAddress | null;
  deliveryZoneId: string | null;
  deliveryZoneName?: string | null;
  tableNumber: string | null;
  guests: number | null;
  scheduledFor: string | null;
  couponCode: string | null;
  subtotal: Money;
  discountAmount: Money;
  deliveryFee: Money;
  taxAmount: Money;
  serviceFee: Money;
  tipAmount: Money;
  total: Money;
  currency: string;
  taxRate: string;
  pricingBreakdown: Record<string, unknown>;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  notes: string | null;
  specialInstructions: string | null;
  placedBy: "customer" | "staff";
  cancelReason: string | null;
  estimatedReadyAt: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  items?: OrderItem[];
  statusHistory?: OrderStatusEvent[];
  payment?: Payment | null;
  delivery?: Delivery | null;
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  orderType: OrderType;
  customerName: string;
  customerPhone: string;
  total: Money;
  currency: string;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  createdAt: string;
  itemCount: number;
  itemPreview: string[];
}

export interface Review {
  id: string;
  restaurantId: string;
  customerId: string | null;
  orderId: string | null;
  menuItemId: string | null;
  itemName?: string | null;
  authorName: string;
  rating: number;
  title: string | null;
  comment: string | null;
  status: ReviewStatus;
  isFeatured: boolean;
  response: string | null;
  respondedAt: string | null;
  createdAt: string;
}

export interface Reservation {
  id: string;
  restaurantId: string;
  locationId: string;
  locationName?: string | null;
  customerId: string | null;
  confirmationCode: string;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string;
  reservationDate: string;
  reservationTime: string;
  durationMinutes: number;
  guests: number;
  tableNumber: string | null;
  specialRequests: string | null;
  occasion: string | null;
  status: ReservationStatus;
  notes: string | null;
  createdAt: string;
}

export interface RatingBreakdown {
  average: number;
  count: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

/** Everything the storefront shell needs, resolved in one place. */
export interface StorefrontContext {
  restaurant: Restaurant;
  website: Website;
  theme: RestaurantTheme;
  config: WebsiteConfig;
  locations: RestaurantLocation[];
  primaryLocation: RestaurantLocation | null;
}
