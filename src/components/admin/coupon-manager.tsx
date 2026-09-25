"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import { deleteCouponAction, saveCouponAction } from "@/app/admin/(dashboard)/coupons/actions";
import { COUPON_DISCOUNT_TYPES, ORDER_TYPE_LABELS, ORDER_TYPES, type OrderType } from "@/shared/contract/enums";
import type { Coupon } from "@/shared/contract/models";

interface CouponEditFormProps {
  coupon?: Coupon;
  onCancel: () => void;
}

function CouponEditForm({ coupon, onCancel }: CouponEditFormProps) {
  const [code, setCode] = useState(coupon?.code ?? "");
  const [description, setDescription] = useState(coupon?.description ?? "");
  const [discountType, setDiscountType] = useState(coupon?.discountType ?? "percentage");
  const [discountValue, setDiscountValue] = useState(coupon?.discountValue ?? "");
  const [minOrderAmount, setMinOrderAmount] = useState(coupon?.minOrderAmount ?? "");
  const [maxDiscountAmount, setMaxDiscountAmount] = useState(coupon?.maxDiscountAmount ?? "");
  const [orderTypes, setOrderTypes] = useState<OrderType[]>(coupon?.orderTypes ?? []);
  const [usageLimit, setUsageLimit] = useState(coupon?.usageLimit ? String(coupon.usageLimit) : "");
  const [usageLimitPerCustomer, setUsageLimitPerCustomer] = useState(
    coupon?.usageLimitPerCustomer ? String(coupon.usageLimitPerCustomer) : "",
  );
  const [isActive, setIsActive] = useState(coupon?.isActive ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggleOrderType(type: OrderType) {
    setOrderTypes((current) => (current.includes(type) ? current.filter((t) => t !== type) : [...current, type]));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    const payload = {
      id: coupon?.id,
      code,
      description,
      discountType,
      discountValue,
      minOrderAmount,
      maxDiscountAmount,
      orderTypes,
      usageLimit: usageLimit || undefined,
      usageLimitPerCustomer: usageLimitPerCustomer || undefined,
      isActive,
    };
    startTransition(() => {
      saveCouponAction(payload).then((result) => {
        if (!result.success) {
          if (result.error.details) {
            setErrors(Object.fromEntries(Object.entries(result.error.details).map(([key, value]) => [key, String(value)])));
          }
          toast.error(result.error.message);
          return;
        }
        toast.success(coupon ? "Coupon updated." : "Coupon created.");
        router.refresh();
        onCancel();
      });
    });
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 surface-flat p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="code">Code</Label>
          <Input id="code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} required />
          <FieldError>{errors.code}</FieldError>
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <Input id="description" value={description} onChange={(event) => setDescription(event.target.value)} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="discountType">Discount type</Label>
          <Select id="discountType" value={discountType} onChange={(event) => setDiscountType(event.target.value as typeof discountType)}>
            {COUPON_DISCOUNT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type === "percentage" ? "Percentage" : "Fixed amount"}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="discountValue">{discountType === "percentage" ? "Percent off" : "Amount off"}</Label>
          <Input id="discountValue" value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} placeholder="15" required />
          <FieldError>{errors.discountValue}</FieldError>
        </div>
        <div>
          <Label htmlFor="minOrderAmount">Minimum order</Label>
          <Input id="minOrderAmount" value={minOrderAmount} onChange={(event) => setMinOrderAmount(event.target.value)} placeholder="0" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="maxDiscountAmount">Max discount (optional)</Label>
          <Input id="maxDiscountAmount" value={maxDiscountAmount} onChange={(event) => setMaxDiscountAmount(event.target.value)} />
        </div>
        <div>
          <Label htmlFor="usageLimit">Total use limit</Label>
          <Input id="usageLimit" type="number" min={1} value={usageLimit} onChange={(event) => setUsageLimit(event.target.value)} />
        </div>
        <div>
          <Label htmlFor="usageLimitPerCustomer">Per-customer limit</Label>
          <Input
            id="usageLimitPerCustomer"
            type="number"
            min={1}
            value={usageLimitPerCustomer}
            onChange={(event) => setUsageLimitPerCustomer(event.target.value)}
          />
        </div>
      </div>

      <div>
        <Label>Order types (leave all unchecked for no restriction)</Label>
        <div className="mt-1.5 flex flex-wrap gap-3">
          {ORDER_TYPES.map((type) => (
            <label key={type} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={orderTypes.includes(type)} onChange={() => toggleOrderType(type)} />
              {ORDER_TYPE_LABELS[type]}
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /> Active
        </label>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            <X className="size-4" aria-hidden />
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {coupon ? "Save" : "Create"}
          </Button>
        </div>
      </div>
    </form>
  );
}

export function CouponManager({
  coupons,
  usage,
}: {
  coupons: Coupon[];
  usage: Record<string, { orders: number; discount: string }>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete(coupon: Coupon) {
    if (!confirm(`Delete coupon "${coupon.code}"?`)) return;
    setDeletingId(coupon.id);
    startTransition(() => {
      deleteCouponAction(coupon.id).then((result) => {
        setDeletingId(null);
        if (!result.success) {
          toast.error(result.error.message);
          return;
        }
        toast.success("Coupon deleted.");
        router.refresh();
      });
    });
  }

  return (
    <div className="space-y-2">
      {coupons.map((coupon) =>
        editingId === coupon.id ? (
          <CouponEditForm key={coupon.id} coupon={coupon} onCancel={() => setEditingId(null)} />
        ) : (
          <div
            key={coupon.id}
            className="flex flex-wrap items-center justify-between gap-3 surface-flat px-3.5 py-2.5"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-medium">{coupon.code}</span>
                <Badge variant="soft">
                  {coupon.discountType === "percentage" ? `${coupon.discountValue}% off` : `${coupon.discountValue} off`}
                </Badge>
                {!coupon.isActive ? <Badge variant="neutral">Inactive</Badge> : null}
              </div>
              {coupon.description ? <p className="mt-1 text-xs text-[var(--color-muted-ink)]">{coupon.description}</p> : null}
              {(() => {
                const stats = usage[coupon.code];
                return (
                  <p className="mt-1 text-xs text-[var(--color-muted-ink)]">
                    Used {stats?.orders ?? coupon.usedCount ?? 0} time(s)
                    {coupon.usageLimit ? ` of ${coupon.usageLimit}` : ""}
                    {stats ? ` · ${stats.discount} discounted` : ""}
                  </p>
                );
              })()}
            </div>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" onClick={() => setEditingId(coupon.id)} aria-label="Edit coupon">
                <Pencil className="size-4" aria-hidden />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => handleDelete(coupon)}
                disabled={deletingId === coupon.id}
                aria-label="Delete coupon"
              >
                {deletingId === coupon.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
              </Button>
            </div>
          </div>
        ),
      )}

      {adding ? (
        <CouponEditForm onCancel={() => setAdding(false)} />
      ) : (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden /> Add coupon
        </Button>
      )}
    </div>
  );
}
