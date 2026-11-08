import type { Money } from "@/shared/contract/models";
import { receiptAmount } from "@/shared/pos-receipt";

/** "Rs 2,366" / "Rs 2,366.40" — the till shows paisa only when there are any. */
export function rs(value: Money | null | undefined, symbol = "Rs"): string {
  return `${symbol} ${receiptAmount(value ?? "0")}`;
}
