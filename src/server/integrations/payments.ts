import type { PaymentMethod } from "@/shared/contract/enums";
import { config } from "@/server/config";
import { errors } from "@/server/errors";
import { buildWalletCheckout } from "@/server/integrations/jazzcash";
import { createCheckoutSession } from "@/server/integrations/stripe";

export type OnlineProvider = "none" | "stripe" | "jazzcash";

/**
 * Payment provider abstraction.
 *
 * Cash flows are recorded by staff. Online payments are only offered when the
 * restaurant enables them AND a provider is configured with server-side keys —
 * the platform never fakes a successful online payment.
 */
export interface PaymentIntentInput {
  restaurantId: string;
  orderId: string;
  orderNumber: string;
  amount: string;
  currency: string;
  method: PaymentMethod;
  customer: { name: string; phone: string; email?: string | null };
  /** Where the gateway sends the browser back on success (JazzCash's `pp_ReturnURL`, Stripe's `success_url`). */
  returnUrl: string;
  /** Stripe Checkout only: where a customer who backs out lands (defaults to `returnUrl` if omitted). */
  cancelUrl?: string;
}

export interface PaymentIntentResult {
  provider: string;
  status: "pending" | "authorized" | "requires_action";
  clientSecret?: string;
  redirectUrl?: string;
  /** POST-redirect gateways (JazzCash's HCP): the browser builds a hidden form with these and submits it. */
  formAction?: string;
  formFields?: Record<string, string>;
  reference?: string;
  message?: string;
}

export interface PaymentProvider {
  readonly id: string;
  readonly label: string;
  /** true when the provider is fully configured server-side */
  isConfigured(): boolean;
  supports(method: PaymentMethod): boolean;
  createIntent(input: PaymentIntentInput): Promise<PaymentIntentResult>;
  confirm?(reference: string): Promise<{ status: "paid" | "failed"; transactionId?: string; failureReason?: string }>;
}

class CashPaymentProvider implements PaymentProvider {
  readonly id = "cash";
  readonly label = "Cash";
  isConfigured(): boolean {
    return true;
  }
  supports(method: PaymentMethod): boolean {
    return method === "cash_on_delivery" || method === "cash" || method === "card_terminal";
  }
  async createIntent(input: PaymentIntentInput): Promise<PaymentIntentResult> {
    return {
      provider: this.id,
      status: "pending",
      reference: input.orderNumber,
      message: "Pay when you receive your order.",
    };
  }
}

/** Stripe Checkout (hosted page) for card payments — see `integrations/stripe.ts`. No SDK: plain REST + fetch. */
class StripePaymentProvider implements PaymentProvider {
  readonly id = "stripe";
  readonly label = "Card (online)";
  isConfigured(): boolean {
    return config.payments.stripe !== null;
  }
  supports(method: PaymentMethod): boolean {
    return method === "card_online";
  }
  async createIntent(input: PaymentIntentInput): Promise<PaymentIntentResult> {
    const stripe = config.payments.stripe;
    if (!stripe) {
      throw errors.custom("PAYMENT_UNAVAILABLE", "Online card payments are not configured for this restaurant yet.");
    }
    const session = await createCheckoutSession(stripe, {
      amount: input.amount,
      currency: input.currency,
      restaurantId: input.restaurantId,
      orderId: input.orderId,
      orderNumber: input.orderNumber,
      description: `Order ${input.orderNumber}`,
      customerEmail: input.customer.email,
      successUrl: input.returnUrl,
      cancelUrl: input.cancelUrl ?? input.returnUrl,
    });
    return {
      provider: this.id,
      status: "requires_action",
      redirectUrl: session.url,
      reference: session.id,
    };
  }
}

/** JazzCash Mobile Wallet (`pp_TxnType = MWALLET`) via their Hosted Checkout Page — see `integrations/jazzcash.ts`. */
class JazzCashPaymentProvider implements PaymentProvider {
  readonly id = "jazzcash";
  readonly label = "JazzCash Wallet";
  isConfigured(): boolean {
    return config.payments.jazzcash !== null;
  }
  supports(method: PaymentMethod): boolean {
    return method === "wallet";
  }
  async createIntent(input: PaymentIntentInput): Promise<PaymentIntentResult> {
    const jazzcash = config.payments.jazzcash;
    if (!jazzcash) {
      throw errors.custom("PAYMENT_UNAVAILABLE", "JazzCash is not configured for this restaurant yet.");
    }
    const { actionUrl, fields } = buildWalletCheckout(jazzcash, {
      amount: input.amount,
      orderId: input.orderId,
      orderNumber: input.orderNumber,
      description: `Order ${input.orderNumber}`,
      returnUrl: input.returnUrl,
    });
    return {
      provider: this.id,
      status: "requires_action",
      formAction: actionUrl,
      formFields: fields,
      reference: fields.pp_TxnRefNo,
    };
  }
}

const providers: PaymentProvider[] = [new CashPaymentProvider(), new StripePaymentProvider(), new JazzCashPaymentProvider()];

/**
 * `onlineProvider` picks which gateway actually handles `card_online`/`wallet` — without it, the
 * first provider in the list whose `supports()` matched the method would win regardless of what
 * the restaurant configured (harmless while only Stripe supported "wallet" too, but wrong the
 * moment a second online provider exists, which JazzCash now is).
 */
export function getPaymentProvider(method: PaymentMethod, onlineProvider: OnlineProvider = "none"): PaymentProvider {
  if (method !== "card_online" && method !== "wallet") {
    const provider = providers.find((candidate) => candidate.supports(method));
    if (!provider) throw errors.custom("PAYMENT_UNAVAILABLE", "That payment method is not available.");
    return provider;
  }
  const provider = providers.find((candidate) => candidate.id === onlineProvider && candidate.supports(method));
  if (!provider) throw errors.custom("PAYMENT_UNAVAILABLE", "That payment method is not available.");
  return provider;
}

export function availablePaymentMethods(
  enabledMethods: PaymentMethod[],
  onlineProvider: OnlineProvider,
): { method: PaymentMethod; available: boolean }[] {
  return enabledMethods.map((method) => {
    if (method === "card_online" || method === "wallet") {
      if (onlineProvider === "none") return { method, available: false };
      try {
        return { method, available: getPaymentProvider(method, onlineProvider).isConfigured() };
      } catch {
        return { method, available: false };
      }
    }
    return { method, available: true };
  });
}
