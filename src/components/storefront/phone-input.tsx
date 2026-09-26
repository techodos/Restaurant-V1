"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getCountries, getCountryCallingCode, type CountryCode } from "libphonenumber-js";
import * as RadixSelect from "@radix-ui/react-select";
import { Check, ChevronDown, Lock } from "lucide-react";
import { Input, inputStyles } from "@/components/ui/input";
import { cn } from "@/shared/utils";

/**
 * Country-code + local-number phone field. Emits a normalised E.164 string
 * ("+923001234567") through `onChange`, which is what `e164Phone` (server
 * validation) and every phone column expect — no hand-typed country code, no
 * inconsistent spacing/dashes.
 *
 * The country picker uses Radix Select (already a dependency, unused
 * elsewhere) instead of a bare `<select>`: a native select's closed box always
 * shows the selected `<option>`'s own text, so it cannot show "flag + code"
 * once picked while still listing "flag + code + name" in the open dropdown.
 * Radix's `Select.Value` renders whatever children it's given rather than the
 * matched item's content, so the closed trigger and the list can differ.
 *
 * Flags are `<img>`s from flagcdn.com, not the 🇵🇰-style regional-indicator
 * emoji: Windows' bundled emoji font has no flag glyphs and Chrome/Edge on
 * Windows fall back to rendering the raw two-letter code as text ("PK")
 * instead of a flag — confirmed 2026-09-23. Flags render correctly
 * cross-platform this way; no new dependency, same pattern already used for
 * restaurant logos (a plain `<img src>`).
 */

const DISPLAY_NAMES = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "region" }) : null;

function countryName(code: CountryCode): string {
  return DISPLAY_NAMES?.of(code) ?? code;
}

function FlagImg({ code }: { code: CountryCode }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny external flag icon, not an optimizable local asset
    <img
      src={`https://flagcdn.com/${code.toLowerCase()}.svg`}
      alt=""
      aria-hidden
      className="h-3.5 w-5 shrink-0 rounded-[2px] object-cover"
    />
  );
}

const COUNTRIES = getCountries()
  .map((code) => ({ code, name: countryName(code), callingCode: getCountryCallingCode(code) }))
  .sort((a, b) => a.name.localeCompare(b.name));

interface PhoneInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  defaultCountry?: CountryCode;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  /** locked: shows the value (like a read-only account field, with a lock) and blocks both the country picker and the number, e.g. the account's saved mobile */
  disabled?: boolean;
  required?: boolean;
}

/** Splits an existing E.164 value back into {country, local} so editing an already-filled field keeps its country. */
function splitValue(value: string): { country: CountryCode; local: string } {
  for (const entry of COUNTRIES) {
    const prefix = `+${entry.callingCode}`;
    if (value.startsWith(prefix)) return { country: entry.code, local: value.slice(prefix.length) };
  }
  return { country: "PK", local: "" };
}

export function PhoneInput({ id, value, onChange, defaultCountry = "PK", className, disabled, ...rest }: PhoneInputProps) {
  const initial = useMemo(() => (value ? splitValue(value) : { country: defaultCountry, local: "" }), [value, defaultCountry]);
  const [country, setCountry] = useState<CountryCode>(initial.country);
  const [local, setLocal] = useState(initial.local);

  // A value that arrives or changes from outside (a saved mobile loaded after mount) re-splits into the
  // two fields; the value this component emitted itself is left alone so typing is never disturbed.
  const emitted = useRef(value);
  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    const next = value ? splitValue(value) : { country: defaultCountry, local: "" };
    setCountry(next.country);
    setLocal(next.local);
  }, [value, defaultCountry]);

  function emit(nextCountry: CountryCode, nextLocal: string) {
    const digits = nextLocal.replace(/[^\d]/g, "");
    const next = digits ? `+${getCountryCallingCode(nextCountry)}${digits}` : "";
    emitted.current = next;
    onChange(next);
  }

  return (
    <div className={cn("flex min-w-0 gap-2", className)}>
      <RadixSelect.Root
        value={country}
        disabled={disabled}
        onValueChange={(next) => {
          const code = next as CountryCode;
          setCountry(code);
          emit(code, local);
        }}
      >
        <RadixSelect.Trigger
          aria-label="Country code"
          className={cn(
            inputStyles,
            "w-[7.25rem] shrink-0 cursor-pointer items-center justify-between gap-1",
            disabled && "cursor-not-allowed text-[var(--color-muted-ink)] disabled:opacity-100",
          )}
        >
          {/* Custom children: always "flag + code", never the item's full "flag + code + name" row. */}
          <RadixSelect.Value>
            <span className="flex items-center gap-1.5">
              <FlagImg code={country} />+{getCountryCallingCode(country)}
            </span>
          </RadixSelect.Value>
          {/* locked: no arrow (Radix would draw its own default one for an empty icon) */}
          {disabled ? null : (
            <RadixSelect.Icon>
              <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden />
            </RadixSelect.Icon>
          )}
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content
            position="popper"
            sideOffset={4}
            className="z-50 max-h-72 w-[16rem] overflow-hidden surface-flat shadow-lg"
          >
            <RadixSelect.Viewport className="max-h-72 overflow-y-auto p-1">
              {COUNTRIES.map((entry) => (
                <RadixSelect.Item
                  key={entry.code}
                  value={entry.code}
                  className="flex cursor-pointer select-none items-center justify-between gap-2 rounded-[calc(var(--radius-brand)-2px)] px-2.5 py-2 text-sm text-[var(--color-ink)] outline-none data-[highlighted]:bg-[color-mix(in_srgb,var(--color-ink)_6%,transparent)]"
                >
                  <RadixSelect.ItemText>
                    <span className="flex items-center gap-1.5">
                      <FlagImg code={entry.code} />+{entry.callingCode} {entry.name}
                    </span>
                  </RadixSelect.ItemText>
                  <RadixSelect.ItemIndicator>
                    <Check className="size-4 text-[var(--color-brand)]" aria-hidden />
                  </RadixSelect.ItemIndicator>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
      <div className="relative min-w-0 flex-1">
        <Input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="3001234567"
          className={cn("w-full", disabled && "pr-10 text-[var(--color-muted-ink)]")}
          value={local}
          readOnly={disabled}
          aria-readonly={disabled || undefined}
          onChange={(event) => {
            // digits, spaces and dashes only: anything else cannot be part of a local number
            const typed = event.target.value.replace(/[^\d\s-]/g, "");
            setLocal(typed);
            emit(country, typed);
          }}
          {...rest}
        />
        {disabled ? (
          <Lock className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted-ink)]" aria-hidden />
        ) : null}
      </div>
    </div>
  );
}
