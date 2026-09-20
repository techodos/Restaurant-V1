import type { PaymentMethod } from "@/shared/contract/enums";
import { config } from "@/server/config";
import { errors } from "@/server/errors";

/**
 * Payment provider abstraction.
 *
 * Cash flows are recorded by staff. Online payments are only offered when the
 * restaurant enables them AND a provider is configured with server-side keys —
 * the platform never fakes a successful online payment.
 */
export interface PaymentIntentInput {
  orderId: string;
  orderNumber: string;
  amount: string;
  currency: string;
  method: PaymentMethod;
  customer: { name: string; phone: string; email?: string | null };
  returnUrl: string;
}

export interface PaymentIntentResult {
  provider: string;
  status: "pending" | "authorized" | "requires_action";
  clientSecret?: string;
  redirectUrl?: string;
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

class StripePaymentProvider implements PaymentProvider {
  readonly id = "stripe";
  readonly label = "Card (online)";
  isConfigured(): boolean {
    return config.payments.stripe !== null;
  }
  supports(method: PaymentMethod): boolean {
    return method === "card_online" || method === "wallet";
  }
  async createIntent(input: PaymentIntentInput): Promise<PaymentIntentResult> {
    if (!this.isConfigured()) {
      throw errors.custom(
        "PAYMENT_UNAVAILABLE",
        "Online card payments are not configured for this restaurant yet.",
      );
    }
    // The Stripe SDK is intentionally not bundled until keys exist. When they
    // do, this is where the PaymentIntent is created with the server-side key —
    // secret keys never reach the browser.
    throw errors.custom("PAYMENT_UNAVAILABLE", "Online payments are being activated. Please choose cash for now.");
  }
}

const providers: PaymentProvider[] = [new CashPaymentProvider(), new StripePaymentProvider()];

export function getPaymentProvider(method: PaymentMethod): PaymentProvider {
  const provider = providers.find((candidate) => candidate.supports(method));
  if (!provider) throw errors.custom("PAYMENT_UNAVAILABLE", "That payment method is not available.");
  return provider;
}

export function availablePaymentMethods(
  enabledMethods: PaymentMethod[],
  onlineProvider: "none" | "stripe",
): { method: PaymentMethod; available: boolean }[] {
  return enabledMethods.map((method) => {
    if (method === "card_online" || method === "wallet") {
      return { method, available: onlineProvider !== "none" && getPaymentProvider(method).isConfigured() };
    }
    return { method, available: true };
  });
}
