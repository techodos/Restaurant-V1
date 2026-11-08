"use client";

import { useState } from "react";
import { Loader2, Monitor } from "lucide-react";
import { suggestDeviceCode, type PosBootstrap, type PosDevice, type PosShift } from "@/shared/pos";
import { posApi } from "./api";
import { rs } from "./format";

const input =
  "min-h-12 w-full rounded-[var(--pos-radius)] border border-[var(--pos-line-strong)] bg-white px-3 text-[16px] focus:border-[var(--pos-green)] focus:outline-none";
const primary =
  "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--pos-radius)] bg-[var(--pos-green)] px-4 text-[15px] font-semibold text-white disabled:opacity-50";

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto mt-6 w-full max-w-md px-3 sm:mt-12">
      <div className="rounded-[14px] border border-[var(--pos-line)] bg-white p-5 shadow-[var(--pos-shadow)] sm:p-7">
        <h1 className="text-[19px] font-semibold">{title}</h1>
        <p className="mb-5 mt-1 text-[14px] text-[var(--pos-muted)]">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

/** First run on a browser: pick this till from the registered ones, or (manager) register it. */
export function TillSetup({ boot, onChosen, online }: { boot: PosBootstrap; onChosen: (device: PosDevice) => void; online: boolean }) {
  const [locationId, setLocationId] = useState(boot.cashier.locationId ?? boot.branches[0]?.id ?? "");
  const branch = boot.branches.find((candidate) => candidate.id === locationId);
  const [name, setName] = useState("Counter 1");
  const [code, setCode] = useState(() => suggestDeviceCode(branch?.name ?? "POS", boot.devices.filter((device) => device.locationId === locationId).length + 1));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function register(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await posApi<PosDevice>("tills", { locationId, name, code });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    onChosen(result.data);
  }

  return (
    <Card title="Set up this till" subtitle="Each till numbers its own invoices. Choose which till this screen is.">
      {boot.devices.length > 0 ? (
        <ul className="mb-6 flex flex-col gap-2">
          {boot.devices.map((device) => (
            <li key={device.id}>
              <button
                type="button"
                onClick={() => onChosen(device)}
                className="flex min-h-14 w-full items-center gap-3 rounded-[var(--pos-radius)] border border-[var(--pos-line)] px-4 text-left hover:border-[var(--pos-green)]"
              >
                <Monitor className="size-5 text-[var(--pos-green)]" aria-hidden />
                <span className="flex-1">
                  <span className="block text-[14px] font-semibold">{device.name}</span>
                  <span className="block text-[12px] text-[var(--pos-muted)]">
                    {device.locationName} · invoices {device.code}-…
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {boot.cashier.canManage ? (
        <form onSubmit={register} className="flex flex-col gap-3 border-t border-[var(--pos-line)] pt-5">
          <h2 className="text-[14px] font-semibold">Register a new till</h2>
          <label className="flex flex-col gap-1 text-[13px] font-medium">
            Branch
            <select className={input} value={locationId} onChange={(event) => setLocationId(event.target.value)}>
              {boot.branches.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-medium">
            Till name
            <input className={input} value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-medium">
            Invoice prefix
            <input className={`${input} uppercase`} value={code} maxLength={8} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
            <span className="text-[12px] font-normal text-[var(--pos-muted)]">2–8 letters/digits. Invoices print as {code || "GUL1"}-000001.</span>
          </label>
          {error ? <p role="alert" className="text-[13px] text-[var(--pos-red)]">{error}</p> : null}
          <button type="submit" disabled={busy || !online || !locationId || code.length < 2 || !name.trim()} className={primary}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Register this till
          </button>
          {!online ? <p className="text-[12px] text-[var(--pos-amber)]">Registering a till needs a connection.</p> : null}
        </form>
      ) : boot.devices.length === 0 ? (
        <p className="rounded-[var(--pos-radius)] bg-[var(--pos-amber-tint)] px-3 py-2 text-[13px] text-[var(--pos-amber)]">
          No till is registered at your branch yet. Ask a manager to sign in here once to register it.
        </p>
      ) : null}
    </Card>
  );
}

/** Start of the day (or a new cashier's shift): the opening float in the drawer. */
export function OpenShift({ device, onOpened, online, onChangeTill }: { device: PosDevice; onOpened: (shift: PosShift) => void; online: boolean; onChangeTill: () => void }) {
  const [float, setFloat] = useState("5000");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function open(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await posApi<PosShift>("shift/open", { deviceId: device.id, openingFloat: float || "0" });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    onOpened(result.data);
  }

  return (
    <Card title={`Open a shift · ${device.name}`} subtitle={`${device.locationName}. Count the cash in the drawer before the first sale.`}>
      <form onSubmit={open} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-[13px] font-medium">
          Opening float (cash in the drawer)
          <input className={`${input} tabular-nums`} inputMode="decimal" value={float} onChange={(event) => setFloat(event.target.value.replace(/[^\d.]/g, ""))} />
          <span className="text-[12px] font-normal text-[var(--pos-muted)]">{rs(float || "0")}</span>
        </label>
        {error ? <p role="alert" className="text-[13px] text-[var(--pos-red)]">{error}</p> : null}
        <button type="submit" disabled={busy || !online} className={primary}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Open shift
        </button>
        {!online ? <p className="text-[12px] text-[var(--pos-amber)]">Opening a shift needs a connection.</p> : null}
        <button type="button" onClick={onChangeTill} className="min-h-10 text-[13px] text-[var(--pos-muted)] underline-offset-2 hover:underline">
          This is a different till
        </button>
      </form>
    </Card>
  );
}
