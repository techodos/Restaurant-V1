"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, ImagePlus, Images, Loader2, RefreshCw, Search, Trash2, Upload as UploadIcon, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LibraryImage } from "@/shared/contract/models";
import { cn } from "@/shared/utils";

/**
 * Image upload + media library for the super-admin editors. The page editor provides `upload` (stores the file and records
 * it in `media`) and `browse` (the restaurant's images), so the field components stay free of restaurant ids and actions.
 */

type Upload = (file: File) => Promise<string | null>;
type Browse = () => Promise<LibraryImage[] | null>;
export type PickedImage = { url: string; alt?: string | null };

interface MediaApi {
  upload: Upload;
  /** cached per editor; dropped after an upload so the new file shows up */
  library: () => Promise<LibraryImage[] | null>;
}
const MediaContext = createContext<MediaApi | null>(null);

export function ImageUploadProvider({ upload, browse, children }: { upload: Upload; browse: Browse; children: React.ReactNode }) {
  const cache = useRef<Promise<LibraryImage[] | null> | null>(null);
  const api = useMemo<MediaApi>(
    () => ({
      upload: async (file) => {
        const url = await upload(file);
        if (url) cache.current = null;
        return url;
      },
      library: () => {
        cache.current ??= browse().then((list) => {
          if (!list) cache.current = null; // a failed load is retried next time
          return list;
        });
        return cache.current;
      },
    }),
    [upload, browse],
  );
  return <MediaContext.Provider value={api}>{children}</MediaContext.Provider>;
}

const ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/gif,image/svg+xml";
// Server Actions accept 4 MB bodies (next.config.ts); storage itself allows 5 MB
const MAX_BYTES = 4_000_000;

/** Validates and uploads one file; shared by the tile and the library's "Upload new". */
function useUploader(onUploaded: (url: string) => void) {
  const media = useContext(MediaContext);
  const [busy, setBusy] = useState(false);
  async function take(file: File | undefined) {
    if (!file || !media) return;
    if (!ACCEPT.split(",").includes(file.type)) return void toast.error("Use a JPG, PNG, WEBP, AVIF, GIF or SVG image.");
    if (file.size > MAX_BYTES) return void toast.error("Images must be 4 MB or smaller.");
    setBusy(true);
    try {
      const url = await media.upload(file);
      if (url) onUploaded(url);
    } finally {
      setBusy(false);
    }
  }
  return { busy, take, enabled: Boolean(media) };
}

const overlayButton = "inline-flex h-7 items-center gap-1 rounded-md bg-white/95 px-2 text-xs font-medium text-[var(--color-ink)] shadow-sm hover:bg-white";

/**
 * A preview tile: upload on click or drop, or pick from the library. Empty: a dashed drop zone with both actions.
 * Filled: the image with Replace / Library / Remove. `onChange(undefined)` clears it. The address stays editable next
 * to it, so a hosted image can still be linked by hand.
 */
export function ImageUploadTile({
  url,
  onChange,
  label,
  className,
}: {
  url: string;
  onChange: (image: PickedImage | undefined) => void;
  label: string;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [picking, setPicking] = useState(false);
  const hintId = useId();
  const { busy, take, enabled } = useUploader((uploaded) => {
    onChange({ url: uploaded });
    toast.success("Image uploaded. Save the page to publish it.");
  });
  const pick = () => input.current?.click();

  return (
    <div
      className={cn(
        "group/tile relative isolate aspect-[4/3] w-full overflow-hidden rounded-lg border bg-[var(--sa-subtle)] transition-colors",
        over ? "border-[var(--color-brand)] ring-[3px] ring-[var(--sa-focus)]" : url ? "border-[var(--color-hairline)]" : "border-dashed border-[var(--sa-border-strong)]",
        className,
      )}
      onDragOver={(event) => {
        event.preventDefault();
        if (enabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        void take(event.dataTransfer.files[0]);
      }}
    >
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          void take(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- admin preview of an arbitrary stored address */}
          <img src={url} alt="" className="size-full object-cover" />
          {enabled ? (
            <div className="absolute inset-x-0 bottom-0 flex flex-wrap justify-end gap-1 bg-gradient-to-t from-black/55 to-transparent p-1.5 pt-6 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/tile:opacity-100 sm:group-focus-within/tile:opacity-100">
              <button type="button" onClick={pick} disabled={busy} className={overlayButton}>
                <RefreshCw className="size-3.5" aria-hidden /> Replace
              </button>
              <button type="button" onClick={() => setPicking(true)} disabled={busy} className={overlayButton} aria-label={`Choose ${label.toLowerCase()} from library`}>
                <Images className="size-3.5" aria-hidden /> Library
              </button>
              <button
                type="button"
                onClick={() => onChange(undefined)}
                disabled={busy}
                aria-label={`Remove ${label.toLowerCase()}`}
                className="grid size-7 place-items-center rounded-md bg-white/95 text-[var(--color-danger)] shadow-sm hover:bg-white"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1.5 px-2 text-center">
          <button
            type="button"
            onClick={pick}
            disabled={!enabled || busy}
            aria-describedby={hintId}
            className="flex flex-col items-center gap-1 rounded-md px-2 py-1 text-[var(--color-muted-ink)] transition-colors hover:text-[var(--color-brand)]"
          >
            <ImagePlus className="size-5" aria-hidden />
            <span className="text-xs font-medium">Upload {label.toLowerCase()}</span>
          </button>
          <span id={hintId} className="text-[11px] text-[var(--sa-faint-ink)]">Click or drop · up to 4 MB</span>
          {enabled ? (
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="mt-0.5 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[var(--color-brand)] hover:bg-[var(--sa-primary-soft)]"
            >
              <Images className="size-3.5" aria-hidden /> Choose from library
            </button>
          ) : null}
        </div>
      )}
      {busy ? (
        <div className="absolute inset-0 grid place-items-center bg-white/75" role="status">
          <span className="flex items-center gap-2 text-xs font-medium text-[var(--color-ink)]">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Uploading…
          </span>
        </div>
      ) : null}
      {picking ? (
        <MediaLibraryDialog
          current={url}
          onClose={() => setPicking(false)}
          onPick={(image) => {
            onChange(image);
            setPicking(false);
          }}
        />
      ) : null}
    </div>
  );
}

type Filter = "all" | "upload" | "website";

/** The restaurant's images in a dialog: search, filter, pick one, or upload a new one right here. */
function MediaLibraryDialog({ current, onClose, onPick }: { current: string; onClose: () => void; onPick: (image: PickedImage) => void }) {
  const media = useContext(MediaContext);
  const [images, setImages] = useState<LibraryImage[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(current || null);
  const [container] = useState(() => (typeof document === "undefined" ? null : document.querySelector<HTMLElement>(".sa-root")));
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    if (!media) return;
    setFailed(false);
    void media.library().then((list) => {
      if (list) setImages(list);
      else setFailed(true);
    });
  }, [media]);
  useEffect(load, [load]);

  const { busy, take } = useUploader((url) => {
    toast.success("Image uploaded.");
    onPick({ url });
  });

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (images ?? []).filter(
      (image) => (filter === "all" || image.source === filter) && (!q || image.name.toLowerCase().includes(q) || (image.alt ?? "").toLowerCase().includes(q)),
    );
  }, [images, query, filter]);
  const chosen = images?.find((image) => image.url === selected) ?? null;
  const counts = { all: images?.length ?? 0, upload: images?.filter((i) => i.source === "upload").length ?? 0, website: images?.filter((i) => i.source === "website").length ?? 0 };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal container={container ?? undefined}>
        <Dialog.Overlay className="animate-overlay fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="animate-dialog fixed left-1/2 top-1/2 z-50 flex max-h-[min(44rem,calc(100dvh-2rem))] w-[min(56rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-hairline)] bg-[var(--color-surface)] shadow-[var(--sa-shadow-md)] focus:outline-none"
        >
          <div className="flex items-center justify-between gap-3 border-b border-[var(--color-hairline)] px-5 py-4">
            <div>
              <Dialog.Title className="text-[15px] font-semibold text-[var(--color-ink)]">Media library</Dialog.Title>
              <p className="text-[13px] text-[var(--color-muted-ink)]">Images uploaded for this restaurant and ones already on its website.</p>
            </div>
            <Dialog.Close className="grid size-8 place-items-center rounded-md text-[var(--color-muted-ink)] hover:bg-[var(--sa-subtle)] hover:text-[var(--color-ink)]" aria-label="Close">
              <X className="size-4" aria-hidden />
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-2 border-b border-[var(--color-hairline)] px-5 py-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--sa-faint-ink)]" aria-hidden />
              <Input type="search" aria-label="Search images" placeholder="Search by file name or description" value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" />
            </div>
            <div role="radiogroup" aria-label="Show" className="flex shrink-0 rounded-lg bg-[var(--sa-subtle)] p-0.5">
              {(["all", "upload", "website"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={filter === value}
                  onClick={() => setFilter(value)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    filter === value ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-[var(--sa-shadow-xs)]" : "text-[var(--color-muted-ink)] hover:text-[var(--color-ink)]",
                  )}
                >
                  {value === "all" ? "All" : value === "upload" ? "Uploads" : "On website"} <span className="tabular-nums text-[var(--sa-faint-ink)]">{counts[value]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {failed ? (
              <div className="grid place-items-center gap-3 py-12 text-center">
                <p className="text-sm text-[var(--color-muted-ink)]">The library could not be loaded.</p>
                <Button type="button" variant="outline" size="sm" onClick={load}>Try again</Button>
              </div>
            ) : images === null ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4" aria-busy="true" aria-label="Loading images">
                {Array.from({ length: 8 }, (_, index) => (
                  <div key={index} className="skeleton-shimmer aspect-[4/3] rounded-lg" />
                ))}
              </div>
            ) : shown.length === 0 ? (
              <div className="grid place-items-center gap-2 py-12 text-center">
                <Images className="size-6 text-[var(--sa-faint-ink)]" aria-hidden />
                <p className="text-sm font-medium text-[var(--color-ink)]">{images.length ? "No images match" : "No images yet"}</p>
                <p className="text-[13px] text-[var(--color-muted-ink)]">{images.length ? "Try another search or filter." : "Upload the first one below."}</p>
              </div>
            ) : (
              <ul role="listbox" aria-label="Images" className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {shown.map((image) => {
                  const active = image.url === selected;
                  return (
                    <li key={image.url}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => setSelected(image.url)}
                        onDoubleClick={() => onPick({ url: image.url, alt: image.alt })}
                        className={cn(
                          "group/item relative block w-full overflow-hidden rounded-lg border text-left transition-[border-color,box-shadow] duration-150",
                          active ? "border-[var(--color-brand)] ring-[3px] ring-[var(--sa-focus)]" : "border-[var(--color-hairline)] hover:border-[var(--sa-border-strong)]",
                        )}
                      >
                        <span className="block aspect-[4/3] bg-[var(--sa-subtle)]">
                          {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary stored addresses, thumbnails only */}
                          <img src={image.url} alt={image.alt ?? ""} loading="lazy" className="size-full object-cover" />
                        </span>
                        <span className="flex items-center justify-between gap-2 px-2 py-1.5">
                          <span className="truncate text-xs text-[var(--color-ink)]" title={image.name}>{image.name}</span>
                          {image.url === current ? <span className="shrink-0 text-[10px] font-medium text-[var(--color-brand)]">In use</span> : null}
                        </span>
                        {active ? (
                          <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-[var(--color-brand)] text-white shadow-sm" aria-hidden>
                            <Check className="size-3" />
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-[var(--color-hairline)] bg-[var(--sa-subtle)]/50 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(event) => {
                void take(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <UploadIcon className="size-4" aria-hidden />}
              {busy ? "Uploading…" : "Upload new"}
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={onClose} className="flex-1 sm:flex-none">Cancel</Button>
              <Button type="button" size="sm" disabled={!chosen || busy} onClick={() => chosen && onPick({ url: chosen.url, alt: chosen.alt })} className="flex-1 sm:flex-none">
                Use image
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
