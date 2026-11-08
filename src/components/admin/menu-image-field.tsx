"use client";

import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { discardMenuImageAction, uploadMenuImageAction } from "@/app/admin/(dashboard)/menu/items/actions";
import { cn } from "@/shared/utils";
import { MENU_IMAGE_ACCEPT, MENU_IMAGE_HINT, MENU_IMAGE_MAX_BYTES, isMenuImageType, menuImageProblem } from "@/shared/media-upload";

/** Long edge a too-large photo is scaled down to; plenty for a menu card or the dish page. */
const SHRINK_EDGE = 2400;

/**
 * A phone photo is often 5–10 MB. Rather than refuse it, re-encode it in the browser (WEBP, or JPEG where the browser
 * cannot write WEBP) until it fits under the limit. Files already under the limit are sent untouched.
 */
async function fitUnderLimit(file: File): Promise<File> {
  if (file.size <= MENU_IMAGE_MAX_BYTES || typeof createImageBitmap !== "function") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // the browser cannot decode it; the size check reports the real problem
  }
  try {
    for (const [edge, quality] of [[SHRINK_EDGE, 0.86], [SHRINK_EDGE, 0.74], [1800, 0.74], [1400, 0.7]] as const) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
      if (!blob || blob.type !== "image/webp") blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= MENU_IMAGE_MAX_BYTES) {
        const name = file.name.replace(/\.[^.]+$/, "") + (blob.type === "image/webp" ? ".webp" : ".jpg");
        return new File([blob], name, { type: blob.type });
      }
    }
    return file;
  } finally {
    bitmap.close();
  }
}

/**
 * The menu item's photo: upload from the device (tap/click, or drop on desktop), replace, remove, or paste an address.
 * An upload goes straight to storage and only fills the field; the item changes when the form is saved. A photo
 * uploaded here and then replaced/removed before saving is deleted again (`discardMenuImageAction`); one replaced
 * after saving is cleaned up by the save itself.
 */
export function MenuImageField({
  value,
  savedUrl,
  onChange,
  onBusyChange,
  error,
}: {
  value: string;
  /** the address currently saved on the item (never discarded from here) */
  savedUrl: string | null;
  onChange: (url: string) => void;
  onBusyChange?: (busy: boolean) => void;
  error?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [broken, setBroken] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // addresses uploaded by this form and not saved yet
  const unsaved = useRef(new Set<string>());

  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);
  useEffect(() => setBroken(false), [value]);

  function replaceWith(next: string) {
    const previous = value;
    if (previous && previous !== next && previous !== savedUrl && unsaved.current.has(previous)) {
      unsaved.current.delete(previous);
      void discardMenuImageAction(previous);
    }
    onChange(next);
  }

  async function take(picked: File | undefined) {
    if (!picked || busy) return;
    if (!isMenuImageType(picked.type)) return void toast.error("Use a JPG, PNG, WEBP or AVIF photo.");
    setBusy(true);
    try {
      const file = await fitUnderLimit(picked);
      const problem = menuImageProblem(file);
      if (problem) return void toast.error(problem);
      const data = new FormData();
      data.append("file", file);
      const result = await uploadMenuImageAction(data);
      if (!result.success) return void toast.error(result.error.message);
      unsaved.current.add(result.data.url);
      replaceWith(result.data.url);
      toast.success(file === picked ? "Photo uploaded. Save to apply it." : "Photo resized and uploaded. Save to apply it.");
    } catch {
      // e.g. the request body limit or a dropped connection: the action never answered
      toast.error("The photo could not be uploaded. Check your connection or try a smaller photo.");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const choose = () => fileInput.current?.click();

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "relative aspect-[4/3] overflow-hidden rounded-xl bg-[var(--steel-2)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--color-ink)_8%,transparent)] transition-shadow",
          dragging && "ring-2 ring-[var(--color-brand)]",
        )}
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void take(event.dataTransfer.files[0]);
        }}
      >
        {value && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element -- a live preview of an upload or a typed address
          <img src={value} alt="" className="size-full object-cover" onError={() => setBroken(true)} />
        ) : (
          <button
            type="button"
            onClick={choose}
            disabled={busy}
            className="grid size-full place-items-center px-4 text-center text-[13px] text-[var(--color-muted-ink)] transition-colors hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand)]"
          >
            <span className="flex flex-col items-center gap-2">
              {value ? <ImageIcon className="size-6" aria-hidden /> : <ImagePlus className="size-6" aria-hidden />}
              <span className="font-medium text-[var(--color-ink)]">{value ? "This address does not load an image" : "Add a photo"}</span>
              <span>
                Tap to choose from your device<span className="hidden [@media(hover:hover)]:inline"> or drop it here</span>
              </span>
            </span>
          </button>
        )}
        {busy ? (
          <div className="absolute inset-0 grid place-items-center bg-[color-mix(in_srgb,var(--color-surface)_78%,transparent)] backdrop-blur-[2px]" role="status">
            <span className="flex items-center gap-2 text-[13px] font-medium text-[var(--color-ink)]">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Uploading…
            </span>
          </div>
        ) : null}
      </div>

      <input ref={fileInput} type="file" accept={MENU_IMAGE_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={(event) => void take(event.target.files?.[0])} />

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={choose} disabled={busy} className="min-w-0 flex-1">
          <Upload aria-hidden /> {value ? "Replace photo" : "Upload photo"}
        </Button>
        {value ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => replaceWith("")} disabled={busy} className="shrink-0 text-[var(--color-danger,#b42318)]">
            <Trash2 aria-hidden /> Remove
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-[var(--color-muted-ink)]">{MENU_IMAGE_HINT}. Larger photos are resized automatically.</p>

      <div className="space-y-1.5">
        <Label htmlFor="imageUrl">
          Or image address <span className="font-normal text-[var(--color-muted-ink)]">(optional)</span>
        </Label>
        <Input id="imageUrl" value={value} onChange={(event) => onChange(event.target.value)} placeholder="https://..." disabled={busy} />
        <FieldError>{error}</FieldError>
      </div>
    </div>
  );
}
