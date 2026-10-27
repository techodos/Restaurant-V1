"use client";

import { cn } from "@/shared/utils";

import { AdminFormPanel, AdminFormSection, FormToggle } from "@/components/admin/admin-form-panel";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, Plus, TicketPercent, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/input";
import { deleteCouponAction, saveCouponAction } from "@/app/admin/(dashboard)/coupons/actions";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { COUPON_DISCOUNT_TYPES, ORDER_TYPE_LABELS, ORDER_TYPES, type OrderType } from "@/shared/contract/enums";
import type { Coupon } from "@/shared/contract/models";
import { StatusPill, addTileClass } from "@/components/admin/admin-ui";

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
  const [eligibleCustomers, setEligibleCustomers] = useState(
    [...(coupon?.eligibleEmails ?? []), ...(coupon?.eligiblePhones ?? [])].join("\n"),
  );
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
      eligibleCustomers,
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
    <AdminFormPanel
      title={coupon ? `Edit ${coupon.code}` : "New coupon"}
      description="A code customers type at checkout."
      icon={TicketPercent}
      onSubmit={submit}
      onCancel={onCancel}
      pending={pending}
      submitLabel={coupon ? "Save coupon" : "Create coupon"}
      toggles={<FormToggle id="couponActive" label="Active" checked={isActive} onChange={setIsActive} />}
    >
      <AdminFormSection title="Code" description="Shown to customers exactly as typed, in capitals.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="code">Code</Label>
            <Input id="code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} className="font-mono tracking-[0.08em]" placeholder="WELCOME15" required />
            <FieldError>{errors.code}</FieldError>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Input id="description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="15% off your first order" />
          </div>
        </div>
      </AdminFormSection>

      <AdminFormSection title="Discount" description="How much it takes off, and on which orders.">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="discountType">Type</Label>
            <Select id="discountType" value={discountType} onChange={(event) => setDiscountType(event.target.value as typeof discountType)}>
              {COUPON_DISCOUNT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type === "percentage" ? "Percentage" : "Fixed amount"}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="discountValue">{discountType === "percentage" ? "Percent off" : "Amount off"}</Label>
            <div className="relative">
              <Input id="discountValue" inputMode="decimal" value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} placeholder="15" required className={discountType === "percentage" ? "pr-9" : undefined} />
              {discountType === "percentage" ? <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] text-[var(--color-muted-ink)]">%</span> : null}
            </div>
            <FieldError>{errors.discountValue}</FieldError>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="maxDiscountAmount">
              Max discount <span className="font-normal text-[var(--color-muted-ink)]">(optional)</span>
            </Label>
            <Input id="maxDiscountAmount" inputMode="decimal" value={maxDiscountAmount} onChange={(event) => setMaxDiscountAmount(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="minOrderAmount">Minimum order</Label>
            <Input id="minOrderAmount" inputMode="decimal" value={minOrderAmount} onChange={(event) => setMinOrderAmount(event.target.value)} placeholder="0" />
          </div>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Order types</legend>
          <div className="flex flex-wrap gap-2">
            {ORDER_TYPES.map((type) => {
              const on = orderTypes.includes(type);
              return (
                <label
                  key={type}
                  className={cn(
                    "flex min-h-10 cursor-pointer items-center gap-2 rounded-full px-3.5 text-[13.5px] font-medium ring-1 ring-inset transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--color-brand)]",
                    on
                      ? "bg-[color-mix(in_srgb,var(--color-brand)_10%,var(--color-surface))] text-[var(--color-brand)] ring-[var(--color-brand)]"
                      : "bg-[var(--color-surface)] text-[var(--color-muted-ink)] ring-[var(--admin-line,var(--color-hairline))] hover:text-[var(--color-ink)]",
                  )}
                >
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => toggleOrderType(type)} />
                  {on ? <Check className="size-3.5" aria-hidden /> : null}
                  {ORDER_TYPE_LABELS[type]}
                </label>
              );
            })}
          </div>
          <p className="text-xs text-[var(--color-muted-ink)]">None selected = every order type.</p>
        </fieldset>
      </AdminFormSection>

      <AdminFormSection title="Limits" description="Leave empty for no limit.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="usageLimit">Total uses</Label>
            <Input id="usageLimit" type="number" min={1} value={usageLimit} onChange={(event) => setUsageLimit(event.target.value)} placeholder="Unlimited" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="usageLimitPerCustomer">Uses per customer</Label>
            <Input id="usageLimitPerCustomer" type="number" min={1} value={usageLimitPerCustomer} onChange={(event) => setUsageLimitPerCustomer(event.target.value)} placeholder="Unlimited" />
          </div>
        </div>
      </AdminFormSection>

      <AdminFormSection
        title="Who can use it"
        description="Optional. One email or phone (with country code, e.g. +923001234567) per line. When set, everyone else is refused."
      >
        <div className="space-y-1.5">
          <Label htmlFor="eligibleCustomers">Specific customers</Label>
          <Textarea
            id="eligibleCustomers"
            rows={3}
            value={eligibleCustomers}
            onChange={(event) => setEligibleCustomers(event.target.value)}
            placeholder={"amina@example.com\n+923001234567"}
          />
        </div>
      </AdminFormSection>
    </AdminFormPanel>
  );
}

export function CouponManager({
  coupons,
  usage,
  canManage = true,
}: {
  coupons: Coupon[];
  usage: Record<string, { orders: number; discount: string }>;
  /** false = read-only list (coupons apply to every branch: owner/admin edit them) */
  canManage?: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  async function handleDelete(coupon: Coupon) {
    if (!(await confirm({ title: `Delete coupon "${coupon.code}"?`, variant: "danger", confirmLabel: "Delete" }))) return;
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
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {dialog}
      {coupons.map((coupon) => {
        if (editingId === coupon.id) {
          return (
            <div key={coupon.id} className="col-span-full">
              <CouponEditForm coupon={coupon} onCancel={() => setEditingId(null)} />
            </div>
          );
        }
        const stats = usage[coupon.code];
        const used = stats?.orders ?? coupon.usedCount ?? 0;
        const value = Number(coupon.discountValue);
        const figure = coupon.discountType === "percentage" ? `${value}%` : value.toLocaleString();
        const restricted = coupon.eligibleEmails.length + coupon.eligiblePhones.length;
        const share = coupon.usageLimit ? Math.min(1, used / coupon.usageLimit) : null;
        return (
          <article
            key={coupon.id}
            className={cn("surface-card flex min-w-0 overflow-hidden", !coupon.isActive && "opacity-75")}
            aria-label={`Coupon ${coupon.code}`}
          >
            {/* the stub: what the code is worth */}
            <div
              className={cn(
                "relative flex w-[5.75rem] shrink-0 flex-col items-center justify-center gap-0.5 border-r border-dashed px-2 py-4 text-center",
                coupon.isActive
                  ? "border-[color-mix(in_srgb,var(--color-brand)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-brand)_9%,var(--color-surface))] text-[var(--color-brand)]"
                  : "border-[var(--rule-strong)] bg-[var(--tint)] text-[var(--color-muted-ink)]",
              )}
            >
              <span className="tabular text-[1.35rem] font-semibold leading-none tracking-[-0.02em]">{figure}</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">off</span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-mono text-[15px] font-semibold tracking-[0.08em]">{coupon.code}</p>
                  {coupon.description ? <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-[var(--color-muted-ink)]">{coupon.description}</p> : null}
                </div>
                {canManage ? (
                  <div className="-mr-2 -mt-1.5 flex shrink-0 items-center">
                    <Button size="icon" variant="ghost" onClick={() => setEditingId(coupon.id)} aria-label={`Edit coupon ${coupon.code}`}>
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDelete(coupon)}
                      disabled={deletingId === coupon.id}
                      aria-label={`Delete coupon ${coupon.code}`}
                    >
                      {deletingId === coupon.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
                    </Button>
                  </div>
                ) : null}
              </div>
              {!coupon.isActive || restricted > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {!coupon.isActive ? <StatusPill tone="neutral">Inactive</StatusPill> : null}
                  {restricted > 0 ? (
                    <StatusPill tone="info" dot={false}>
                      {restricted} {restricted === 1 ? "customer" : "customers"} only
                    </StatusPill>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-auto pt-1">
                {share !== null ? (
                  <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--tint-strong)]" role="presentation">
                    <div className="h-full rounded-full bg-[var(--color-brand)]" style={{ width: `${Math.max(share * 100, used > 0 ? 4 : 0)}%` }} />
                  </div>
                ) : null}
                <p className="tabular text-[12.5px] text-[var(--color-muted-ink)]">
                  <span className="font-semibold text-[var(--color-ink)]">
                    Used {used} {used === 1 ? "time" : "times"}
                  </span>
                  {coupon.usageLimit ? ` of ${coupon.usageLimit}` : " · no limit"}
                  {stats ? ` · ${stats.discount} discounted` : ""}
                </p>
              </div>
            </div>
          </article>
        );
      })}

      {!canManage ? null : adding ? (
        <div className="col-span-full">
          <CouponEditForm onCancel={() => setAdding(false)} />
        </div>
      ) : editingId ? null : (
        <button type="button" onClick={() => setAdding(true)} className={cn(addTileClass, coupons.length === 0 ? "col-span-full" : "min-h-[7.5rem]")}>
          <Plus className="size-4" aria-hidden /> Add coupon
        </button>
      )}
    </div>
  );
}
