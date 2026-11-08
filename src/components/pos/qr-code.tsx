"use client";

import { useMemo } from "react";
import qrcode from "qrcode-generator";

/** A QR code drawn in the browser (no network): the fiscal QR prints offline too. Same technique as table-links.tsx. */
export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    let d = "";
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) if (qr.isDark(row, col)) d += `M${col + 2} ${row + 2}h1v1h-1z`;
    }
    return { size: count + 4, path: d };
  }, [value]);
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" className={className}>
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
