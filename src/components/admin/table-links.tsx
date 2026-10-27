"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import qrcode from "qrcode-generator";
import { Check, Copy, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { adminPath } from "@/shared/utils";

/**
 * The table QR codes for one branch: choose the branch and tables, copy a link, or print the sheet (one card per
 * table: the code, "Table 12", the branch). Printing shows only the sheet (`.qr-sheet`, globals.css).
 */
export function TableLinks({
  branches,
  branchId,
  tablesInput,
  links,
}: {
  branches: { id: string; name: string }[];
  branchId: string;
  tablesInput: string;
  links: { table: string; url: string }[];
}) {
  const router = useRouter();
  const [tables, setTables] = useState(tablesInput);
  const [copied, setCopied] = useState<string | null>(null);
  const branchName = branches.find((branch) => branch.id === branchId)?.name ?? "";
  const go = (branch: string, list: string) =>
    router.push(`${adminPath("/locations/tables")}?branch=${encodeURIComponent(branch)}&tables=${encodeURIComponent(list)}`);

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      window.setTimeout(() => setCopied((value) => (value === url ? null : value)), 1500);
    } catch {
      // the link stays selectable on the card
    }
  }

  return (
    <div className="space-y-5">
      <form
        className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-4 print:hidden sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          go(branchId, tables);
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="qr-branch">Branch</Label>
          <Select id="qr-branch" value={branchId} onChange={(event) => go(event.target.value, tables)}>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="qr-tables">Tables</Label>
          <Input id="qr-tables" value={tables} onChange={(event) => setTables(event.target.value)} placeholder="1-20, Terrace 1" />
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="outline">
            Update
          </Button>
          <Button type="button" onClick={() => window.print()}>
            <Printer aria-hidden /> Print
          </Button>
        </div>
      </form>

      <ul className="qr-sheet grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3 print:gap-4">
        {links.map(({ table, url }) => (
          <li
            key={table}
            className="flex break-inside-avoid flex-col items-center rounded-[var(--radius-card)] border border-[var(--color-hairline)] bg-white p-4 text-center text-black"
          >
            <QrCode value={url} label={`QR code for table ${table}`} />
            <p className="mt-2 font-[family-name:var(--font-display)] text-2xl leading-tight">Table {table}</p>
            <p className="text-xs">{branchName} · Scan to order</p>
            <p className="mt-2 hidden break-all text-[9px] text-neutral-500 print:block">{url}</p>
            <Button type="button" size="sm" variant="ghost" className="mt-2 print:hidden" onClick={() => void copy(url)}>
              {copied === url ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied === url ? "Copied" : "Copy link"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A QR code as one SVG path (crisp at any print size, no injected markup). Error correction "M" survives a little
 * wear on a table sticker; the 4-module quiet zone is part of the image so it scans on any background.
 */
function QrCode({ value, label }: { value: string; label: string }) {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, "M"); // 0 = smallest version that fits the link
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    let d = "";
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) if (qr.isDark(row, col)) d += `M${col + 4} ${row + 4}h1v1h-1z`;
    }
    return { size: count + 8, path: d };
  }, [value]);
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" className="aspect-square w-full max-w-[11rem]">
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
