import { forwardRef, useImperativeHandle, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X, ImageOff } from "lucide-react";
import type { BarberSiteContent } from "@/templates/barber/types";

/**
 * Manual drag-and-drop image board (replaces 2B AI auto-placement).
 *
 * Shows the REAL enriched image pool (content.imagePool — Maps + Facebook +
 * Instagram, collected at generate) and lets the operator drag photos into the
 * template's slots. Slots start empty → the template's stock fallback shows; a
 * dragged image overrides stock for that slot. Honesty: only real pooled images
 * (or stock) — nothing fabricated.
 *
 * Composes with SiteImageManager (file uploads): the board only overrides slots
 * the user TOUCHED here, and only APPENDS to the gallery — so it never clobbers a
 * file upload the operator made for an untouched slot.
 *
 * Re-host on SAVE: a placed pool URL (FB/IG CDN expires) is downloaded into the
 * barber-site-images bucket by the rehost-image function and the bucket URL stored
 * — only when the editor's single "Save all changes" runs (no orphan uploads).
 */

const BUCKET_MARKER = "/storage/v1/object/public/barber-site-images/";
const isBucketUrl = (u?: string): boolean => !!u && u.includes(BUCKET_MARKER);

type SingleField = "heroImageUrl" | "aboutImageUrl" | "whyUsImageUrl";
interface SingleSlot { field: SingleField; label: string; hint: string }

// Per-template slots. barber/salon: hero, about + a multi gallery. plumber:
// hero, about, why-us (no gallery section in that template).
function slotsFor(template?: string): { singles: SingleSlot[]; gallery: boolean } {
  if (template === "plumber") {
    return {
      singles: [
        { field: "heroImageUrl", label: "Hero", hint: "Wide, inviting shot" },
        { field: "aboutImageUrl", label: "About", hint: "Team / interior" },
        { field: "whyUsImageUrl", label: "Why us", hint: "Close-up work / install" },
      ],
      gallery: false,
    };
  }
  return {
    singles: [
      { field: "heroImageUrl", label: "Hero", hint: "Wide, inviting shot" },
      { field: "aboutImageUrl", label: "About", hint: "Team / interior" },
    ],
    gallery: true,
  };
}

export interface SiteImagePickerHandle {
  /** Re-host any placed pool images and merge the picker's slot choices into base.
   *  Only TOUCHED single slots are overridden; gallery additions are appended. */
  applyInto(base: BarberSiteContent): Promise<BarberSiteContent>;
}

const GALLERY_MAX = 10;

/** A draggable pool thumbnail. referrerPolicy=no-referrer maximises FB/IG CDN
 *  load success pre-rehost; onError shows a labelled placeholder so it's still a
 *  distinguishable, draggable tile. */
function PoolThumb({ url }: { url: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/uri-list", url); e.dataTransfer.setData("text/plain", url); e.dataTransfer.effectAllowed = "copy"; }}
      title="Drag into a slot"
      className="group relative h-20 w-20 shrink-0 cursor-grab overflow-hidden rounded-md border border-border bg-muted active:cursor-grabbing"
    >
      {broken ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
          <ImageOff className="h-4 w-4" />
          <span className="text-[9px]">photo</span>
        </div>
      ) : (
        <img src={url} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
      )}
    </div>
  );
}

export const SiteImagePicker = forwardRef<SiteImagePickerHandle, {
  siteId: string;
  template?: string;
  content: BarberSiteContent;
  onDirtyChange?: (dirty: boolean) => void;
}>(function SiteImagePicker({ siteId, template, content, onDirtyChange }, ref) {
  const pool = (content.imagePool ?? []).filter((u) => typeof u === "string" && u);
  const { singles, gallery: hasGallery } = slotsFor(template);

  // Single-slot values, seeded from current content. `touched` = the user changed
  // it here (drop or clear) — only those override base at save.
  const [single, setSingle] = useState<Record<SingleField, string | undefined>>({
    heroImageUrl: content.heroImageUrl,
    aboutImageUrl: content.aboutImageUrl,
    whyUsImageUrl: content.whyUsImageUrl,
  });
  const [touched, setTouched] = useState<Set<SingleField>>(new Set());
  // Gallery images ADDED via the board (appended to any file-upload gallery).
  const [galleryAdds, setGalleryAdds] = useState<string[]>([]);

  const markDirty = () => onDirtyChange?.(true);

  const setSlot = (field: SingleField, url: string | undefined) => {
    setSingle((p) => ({ ...p, [field]: url }));
    setTouched((p) => new Set(p).add(field));
    markDirty();
  };

  const onDropSingle = (field: SingleField) => (e: React.DragEvent) => {
    e.preventDefault();
    const url = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
    if (url) setSlot(field, url);
  };
  const onDropGallery = (e: React.DragEvent) => {
    e.preventDefault();
    const url = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
    if (!url) return;
    setGalleryAdds((p) => (p.includes(url) || p.length >= GALLERY_MAX ? p : [...p, url]));
    markDirty();
  };

  const rehost = async (url: string, slot: string): Promise<string> => {
    if (isBucketUrl(url)) return url; // already in our bucket — keep
    const { data, error } = await supabase.functions.invoke("rehost-image", {
      body: { url, site_id: siteId, slot },
    });
    if (error || !data?.url) throw new Error(`Re-host failed for ${slot}`);
    return data.url as string;
  };

  useImperativeHandle(ref, () => ({
    async applyInto(base) {
      const out: BarberSiteContent = { ...base };
      // Single slots: only the ones touched in the board.
      for (const { field } of singles) {
        if (!touched.has(field)) continue;
        const v = single[field];
        out[field] = v ? await rehost(v, field.replace("ImageUrl", "").toLowerCase()) : undefined;
      }
      // Gallery: append board-placed pool images to whatever is already in base
      // (file uploads / kept), de-duped + capped.
      if (hasGallery && galleryAdds.length) {
        const existing = Array.isArray(out.galleryImageUrls) ? out.galleryImageUrls : [];
        const added: string[] = [];
        for (let i = 0; i < galleryAdds.length; i++) added.push(await rehost(galleryAdds[i], `gallery-${i}`));
        out.galleryImageUrls = Array.from(new Set([...existing, ...added])).slice(0, GALLERY_MAX);
      }
      return out;
    },
  }), [singles, hasGallery, touched, single, galleryAdds, siteId]);

  if (!pool.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No enriched photos in the pool yet. Enrich this lead first to pull Google/Facebook/Instagram photos,
        then they'll appear here to drag into slots. You can still upload your own images below.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Drag photos from the pool into a slot. Empty slots show a stock image; a placed photo replaces it.
        Changes save with “Save all changes” (placed photos are copied to your site then).
      </p>

      {/* Pool */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Image pool ({pool.length})</p>
        <div className="flex flex-wrap gap-2">
          {pool.map((url) => <PoolThumb key={url} url={url} />)}
        </div>
      </div>

      {/* Slots */}
      <div className="grid gap-3 sm:grid-cols-3">
        {singles.map(({ field, label, hint }) => {
          const v = single[field];
          return (
            <div key={field} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{label}</span>
                {v && (
                  <button type="button" onClick={() => setSlot(field, undefined)} title="Clear (use stock)"
                    className="text-muted-foreground hover:text-destructive">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDropSingle(field)}
                className="relative flex aspect-video items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-muted/40 text-center"
              >
                {v ? (
                  <img src={v} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                ) : (
                  <span className="px-2 text-[11px] text-muted-foreground">Stock — drop a photo<br />{hint}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Gallery (barber/salon) */}
      {hasGallery && (
        <div className="space-y-1">
          <span className="text-xs font-medium">Gallery (+{galleryAdds.length})</span>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDropGallery}
            className="flex min-h-[68px] flex-wrap items-center gap-2 rounded-md border border-dashed border-border bg-muted/40 p-2"
          >
            {galleryAdds.length === 0 && (
              <span className="px-2 text-[11px] text-muted-foreground">Drop photos here to add to the gallery</span>
            )}
            {galleryAdds.map((url) => (
              <div key={url} className="relative h-16 w-16 overflow-hidden rounded border border-border">
                <img src={url} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                <button type="button" onClick={() => { setGalleryAdds((p) => p.filter((u) => u !== url)); markDirty(); }}
                  title="Remove" className="absolute right-0 top-0 bg-black/60 p-0.5 text-white">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">Added on top of any images you upload below.</p>
        </div>
      )}
    </div>
  );
});
