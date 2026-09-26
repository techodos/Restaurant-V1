"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { isValidPhoneNumber, type CountryCode } from "libphonenumber-js";
import { CheckCircle2, ClipboardList, Loader2, Lock, LogOut, MapPin, Pencil, Plus, Trash2, UserRoundX } from "lucide-react";
import { Sheet } from "@/components/motion/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FieldError, FieldHint, Input, Label, Select } from "@/components/ui/input";
import { PhoneInput } from "@/components/storefront/phone-input";
import { cn } from "@/shared/utils";
import { CUSTOMER_GENDERS, type CustomerAddress, type CustomerGender } from "@/shared/contract/models";
import {
  deleteAddressAction,
  getProfileAction,
  requestAccountDeletionAction,
  saveAddressAction,
  signOutAction,
  updateProfileAction,
  type ProfilePayload,
} from "@/app/r/[restaurantSlug]/account/actions";

const GENDER_LABELS: Record<CustomerGender, string> = {
  female: "Female",
  male: "Male",
  other: "Other",
  prefer_not_to_say: "Prefer not to say",
};

type AddressDraft = {
  id?: string;
  label: string;
  addressLine1: string;
  addressLine2: string;
  area: string;
  city: string;
  postalCode: string;
  isDefault: boolean;
};

const emptyDraft = (first: boolean): AddressDraft => ({
  label: first ? "Home" : "",
  addressLine1: "",
  addressLine2: "",
  area: "",
  city: "",
  postalCode: "",
  isDefault: first,
});

const today = () => new Date().toISOString().slice(0, 10);

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="text-[13px] text-[var(--color-muted-ink)]">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm font-medium">{value}</dd>
    </div>
  );
}

function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="font-[family-name:var(--font-sans)] text-[11.5px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-ink)]">{children}</h3>
      {aside}
    </div>
  );
}

/**
 * The signed-in customer's profile, opened from the header account pill: read-only identity (name, email),
 * editable mobile / gender / date of birth, saved delivery addresses (add, edit inline, delete), and the
 * account action that fits how they signed in (Google: request account deletion; password: sign out).
 * Everything is loaded from and saved to the server (account/actions -> services/customer-profile); the
 * checkout reads the same data.
 */
export function ProfileDrawer({
  restaurantSlug,
  open,
  onOpenChange,
  phoneCountry = "PK",
}: {
  restaurantSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phoneCountry?: CountryCode;
}) {
  const router = useRouter();
  const [data, setData] = useState<ProfilePayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const result = await getProfileAction(restaurantSlug);
    if (result.success) setData(result.data);
    else setLoadError(result.error.message);
  }, [restaurantSlug]);

  // fresh on every open: the checkout may have saved a mobile since last time
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const profile = data?.profile ?? null;
  const google = profile?.authProvider === "google";

  const footer = profile ? (
    <div className="px-5 py-4 md:px-7">
    {google ? (
      <DeletionRequest restaurantSlug={restaurantSlug} email={profile.email} />
    ) : (
      <Button
        variant="outline"
        className="w-full"
        onClick={async () => {
          await signOutAction();
          onOpenChange(false);
          toast.success("Signed out");
          router.push(`/r/${restaurantSlug}`);
          router.refresh();
        }}
      >
        <LogOut aria-hidden />
        Sign out
      </Button>
    )}
    </div>
  ) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Your profile" description="Your account details and saved addresses" footer={footer}>
      <div className="space-y-7 px-5 pb-6 md:px-7">
        {loadError ? (
          <div className="rounded-[var(--radius-card)] bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)] p-4 text-sm">
            <p>{loadError}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : !profile ? (
          <div className="space-y-4" aria-busy="true" aria-label="Loading your profile">
            <div className="flex items-center gap-4">
              <Skeleton className="size-14 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-56" />
              </div>
            </div>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            {/* identity */}
            <div className="flex items-center gap-4">
              <span
                aria-hidden
                className="grid size-14 shrink-0 place-items-center rounded-full bg-[var(--color-brand)] font-[family-name:var(--font-display)] text-[1.5rem] text-[var(--color-brand-foreground)]"
              >
                {profile.fullName.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="display-3 truncate">{profile.fullName}</p>
                <Link
                  href={`/r/${restaurantSlug}/orders`}
                  onClick={() => onOpenChange(false)}
                  className="mt-1 inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-muted-ink)] underline-offset-4 hover:text-[var(--color-ink)] hover:underline"
                >
                  <ClipboardList className="size-3.5" aria-hidden />
                  My orders
                </Link>
              </div>
            </div>

            <section>
              <SectionTitle aside={<span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-muted-ink)]"><Lock className="size-3" aria-hidden />Account info</span>}>
                Account
              </SectionTitle>
              <dl className="mt-2 divide-y divide-[var(--rule)] border-y border-[var(--rule)]">
                <ReadOnlyRow label="Full name" value={profile.fullName} />
                <ReadOnlyRow label="Email" value={profile.email ?? "Not set"} />
              </dl>
            </section>

            <ProfileDetailsForm
              restaurantSlug={restaurantSlug}
              phoneCountry={phoneCountry}
              initial={{ phone: profile.phone ?? "", gender: profile.gender ?? "", dateOfBirth: profile.dateOfBirth ?? "" }}
              onSaved={(next) => {
                setData((current) => (current ? { ...current, profile: next } : current));
                router.refresh();
              }}
            />

            <AddressBook
              restaurantSlug={restaurantSlug}
              addresses={profile.addresses}
              onChange={(addresses) => {
                setData((current) => (current ? { ...current, profile: { ...current.profile, addresses } } : current));
                router.refresh();
              }}
            />
          </>
        )}
      </div>
    </Sheet>
  );
}

function ProfileDetailsForm({
  restaurantSlug,
  phoneCountry,
  initial,
  onSaved,
}: {
  restaurantSlug: string;
  phoneCountry: CountryCode;
  initial: { phone: string; gender: string; dateOfBirth: string };
  onSaved: (profile: ProfilePayload["profile"]) => void;
}) {
  const [phone, setPhone] = useState(initial.phone);
  const [gender, setGender] = useState(initial.gender);
  const [dateOfBirth, setDateOfBirth] = useState(initial.dateOfBirth);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const dirty = phone !== initial.phone || gender !== initial.gender || dateOfBirth !== initial.dateOfBirth;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (phone && !isValidPhoneNumber(phone)) next.phone = "That mobile number does not look right for the selected country.";
    if (!phone && initial.phone) next.phone = "Please keep a mobile number on your account.";
    if (dateOfBirth && (dateOfBirth > today() || dateOfBirth < "1900-01-01")) next.dateOfBirth = "Please enter a valid date of birth.";
    setErrors(next);
    if (Object.keys(next).length) return;

    startTransition(async () => {
      const result = await updateProfileAction(restaurantSlug, {
        ...(phone && phone !== initial.phone ? { phone } : {}),
        gender,
        dateOfBirth,
      });
      if (!result.success) {
        const field = (result.error.details as { field?: string } | undefined)?.field;
        setErrors(field ? { [field]: result.error.message } : { form: result.error.message });
        toast.error(result.error.message);
        return;
      }
      toast.success("Profile updated");
      onSaved(result.data);
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <SectionTitle>Your details</SectionTitle>
      <div className="space-y-1.5">
        <Label htmlFor="profile-phone">Mobile number</Label>
        <PhoneInput
          id="profile-phone"
          value={phone}
          onChange={setPhone}
          defaultCountry={phoneCountry}
          aria-invalid={Boolean(errors.phone) || undefined}
        />
        {!initial.phone ? <FieldHint>Add it once and checkout fills it in for you.</FieldHint> : null}
        <FieldError>{errors.phone}</FieldError>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="profile-gender">Gender (optional)</Label>
          <Select id="profile-gender" value={gender} onChange={(event) => setGender(event.target.value)}>
            <option value="">Not set</option>
            {CUSTOMER_GENDERS.map((value) => (
              <option key={value} value={value}>
                {GENDER_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-dob">Date of birth (optional)</Label>
          <Input
            id="profile-dob"
            type="date"
            min="1900-01-01"
            max={today()}
            value={dateOfBirth}
            onChange={(event) => setDateOfBirth(event.target.value)}
            aria-invalid={Boolean(errors.dateOfBirth) || undefined}
          />
          <FieldError>{errors.dateOfBirth}</FieldError>
        </div>
      </div>
      <FieldError>{errors.form}</FieldError>
      <Button type="submit" className="w-full" disabled={pending || !dirty}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {pending ? "Saving…" : "Update profile"}
      </Button>
    </form>
  );
}

function AddressBook({
  restaurantSlug,
  addresses,
  onChange,
}: {
  restaurantSlug: string;
  addresses: CustomerAddress[];
  onChange: (addresses: CustomerAddress[]) => void;
}) {
  const [draft, setDraft] = useState<AddressDraft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function remove(id: string) {
    setBusy(id);
    const result = await deleteAddressAction(restaurantSlug, id);
    setBusy(null);
    setConfirmDelete(null);
    if (!result.success) {
      toast.error(result.error.message);
      return;
    }
    toast.success("Address removed");
    onChange(result.data);
  }

  return (
    <section className="space-y-3">
      <SectionTitle>Addresses</SectionTitle>
      {addresses.length === 0 && !draft ? (
        <p className="text-sm text-[var(--color-muted-ink)]">No saved addresses yet. Add one to pick it at checkout in a tap.</p>
      ) : null}
      <ul className="space-y-2">
        {addresses.map((address) =>
          draft?.id === address.id ? (
            <li key={address.id}>
              <AddressForm restaurantSlug={restaurantSlug} draft={draft} onCancel={() => setDraft(null)} onSaved={(next) => { setDraft(null); onChange(next); }} />
            </li>
          ) : (
            <li key={address.id} className="rounded-[var(--radius-card)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-4">
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 size-4 shrink-0 text-[var(--color-brand-accent)]" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    {address.label}
                    {address.isDefault ? (
                      <span className="rounded-full bg-[var(--tint-strong)] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--color-muted-ink)]">
                        Default
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-[13px] leading-snug text-[var(--color-muted-ink)]">
                    {[address.addressLine1, address.addressLine2, address.area, address.city, address.postalCode].filter(Boolean).join(", ")}
                  </p>
                  {confirmDelete === address.id ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
                      <span>Delete this address?</span>
                      <Button size="sm" variant="danger" disabled={busy === address.id} onClick={() => void remove(address.id)}>
                        {busy === address.id ? <Loader2 className="animate-spin" aria-hidden /> : null}
                        Delete
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                        Keep
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-2 flex gap-4 text-[13px] font-medium">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-[var(--color-ink)] underline-offset-4 hover:underline"
                        onClick={() =>
                          setDraft({
                            id: address.id,
                            label: address.label,
                            addressLine1: address.addressLine1,
                            addressLine2: address.addressLine2 ?? "",
                            area: address.area ?? "",
                            city: address.city ?? "",
                            postalCode: address.postalCode ?? "",
                            isDefault: address.isDefault,
                          })
                        }
                      >
                        <Pencil className="size-3.5" aria-hidden />
                        Edit
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-[var(--color-danger)] underline-offset-4 hover:underline"
                        onClick={() => setConfirmDelete(address.id)}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </li>
          ),
        )}
      </ul>
      {draft && !draft.id ? (
        <AddressForm restaurantSlug={restaurantSlug} draft={draft} onCancel={() => setDraft(null)} onSaved={(next) => { setDraft(null); onChange(next); }} />
      ) : !draft ? (
        <Button variant="outline" className="w-full" onClick={() => setDraft(emptyDraft(addresses.length === 0))}>
          <Plus aria-hidden />
          Add new address
        </Button>
      ) : null}
    </section>
  );
}

function AddressForm({
  restaurantSlug,
  draft,
  onCancel,
  onSaved,
}: {
  restaurantSlug: string;
  draft: AddressDraft;
  onCancel: () => void;
  onSaved: (addresses: CustomerAddress[]) => void;
}) {
  const [value, setValue] = useState(draft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const set = (key: keyof AddressDraft) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setValue((current) => ({ ...current, [key]: key === "isDefault" ? event.target.checked : event.target.value }));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!value.label.trim()) next.label = "Give the address a name, e.g. Home.";
    if (value.addressLine1.trim().length < 3) next.addressLine1 = "Please enter the street address.";
    if (value.area.trim().length < 2) next.area = "Please add the area, so we can match a delivery zone.";
    if (value.city.trim().length < 2) next.city = "Please enter the city.";
    setErrors(next);
    if (Object.keys(next).length) return;

    startTransition(async () => {
      const result = await saveAddressAction(restaurantSlug, value);
      if (!result.success) {
        toast.error(result.error.message);
        setErrors({ form: result.error.message });
        return;
      }
      toast.success(value.id ? "Address updated" : "Address saved");
      onSaved(result.data);
    });
  }

  const field = (key: keyof Omit<AddressDraft, "id" | "isDefault">, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className={cn("space-y-1.5", props.className)}>
      <Label htmlFor={`address-${key}`}>{label}</Label>
      <Input
        id={`address-${key}`}
        value={value[key]}
        onChange={set(key)}
        aria-invalid={Boolean(errors[key]) || undefined}
        {...props}
        className={undefined}
      />
      <FieldError>{errors[key]}</FieldError>
    </div>
  );

  return (
    <form onSubmit={submit} noValidate className="animate-sheet space-y-3 rounded-[var(--radius-card)] border border-[var(--color-brand)] bg-[var(--color-surface)] p-4">
      <p className="text-sm font-semibold">{value.id ? "Edit address" : "New address"}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("label", "Name", { placeholder: "Home, Office…", maxLength: 40, className: "sm:col-span-2" })}
        {field("addressLine1", "Street address", { autoComplete: "address-line1", className: "sm:col-span-2" })}
        {field("addressLine2", "Apartment, floor, landmark (optional)", { autoComplete: "address-line2", className: "sm:col-span-2" })}
        {field("area", "Area", { autoComplete: "address-level3" })}
        {field("city", "City", { autoComplete: "address-level2" })}
        {field("postalCode", "Postal code (optional)", { autoComplete: "postal-code" })}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value.isDefault} onChange={set("isDefault")} className="size-4 accent-[var(--color-brand)]" />
        Use as my default address
      </label>
      <FieldError>{errors.form}</FieldError>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {pending ? "Saving…" : "Save address"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * Google accounts: "Request account deletion". There is no automated deletion, so the server emails the
 * request to the restaurant (Reply-To = the customer). The button asks for a confirmation first, shows
 * progress, and afterwards says the request was sent (it cannot be sent twice from here).
 */
function DeletionRequest({ restaurantSlug, email }: { restaurantSlug: string; email: string | null }) {
  const [step, setStep] = useState<"idle" | "confirm" | "sent">("idle");
  const [pending, startTransition] = useTransition();

  function send() {
    startTransition(async () => {
      const result = await requestAccountDeletionAction(restaurantSlug);
      if (!result.success) {
        toast.error(result.error.message);
        setStep("idle");
        return;
      }
      toast.success("Request sent");
      setStep("sent");
    });
  }

  if (step === "sent") {
    return (
      <p className="flex items-start gap-2 text-[13px] leading-snug text-[var(--color-muted-ink)]" role="status">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--color-success)]" aria-hidden />
        <span>
          Your deletion request was sent to the restaurant.{email ? ` They will contact you at ${email}.` : ""}
        </span>
      </p>
    );
  }
  if (step === "confirm") {
    return (
      <div className="space-y-3">
        <p className="text-[13px] leading-snug">
          This asks the restaurant to delete your account and personal data. Send the request?
        </p>
        <div className="flex gap-2">
          <Button variant="danger" className="flex-1" disabled={pending} onClick={send}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {pending ? "Sending…" : "Send request"}
          </Button>
          <Button variant="ghost" disabled={pending} onClick={() => setStep("idle")}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }
  return (
    <Button variant="outline" className="w-full text-[var(--color-danger)]" onClick={() => setStep("confirm")}>
      <UserRoundX aria-hidden />
      Request account deletion
    </Button>
  );
}
