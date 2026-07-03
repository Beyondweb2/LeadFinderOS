import { forwardRef, useImperativeHandle, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X, ImageOff, Upload, Plus } from "lucide-react";
import { uploadOne, validate, GALLERY_MAX, IMAGE_ACCEPT } from "@/components/SiteImageManager";
import type { BarberSiteContent } from "@/templates/barber/types";

/**
 * Merged image section for a generated site: the manual drag-and-drop board PLUS
 * click-to-upload, the logo slot, and gallery deletion — the single images card on
 * the Manage page (the old separate "Upload images & logo" card is gone). The
 * standalone SiteImageManager (and its exported uploadOne / validate / GALLERY_MAX
 * / IMAGE_ACCEPT, reused here) still powers /admin/site-images.
 *
 * Two image SOURCES per slot:
 *   • drag a photo from the REAL enriched pool (content.imagePool — Maps + Facebook
 *     + Instagram, collected at generate) → re-hosted on save (URLs expire), OR
 *   • upload your own File → stored in the barber-site-images bucket via uploadOne.
 * For a single slot, the LAST action wins (a drop clears a picked file and vice
 * versa). The logo is upload-only (no pool/drag source).
 *
 * Honesty: only real pooled images, your own uploads, or the template's stock
 * fallback — nothing fabricated. Empty single slot → the template's stock shows.
 *
 * Re-host on SAVE: a placed pool URL is downloaded into the barber-site-images
 * bucket by the rehost-image function and the bucket URL stored — only when the
 * editor's single "Save all changes" runs (no orphan uploads). Uploaded files are
 * pushed to the same bucket then. One combined content write.
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
  /** Re-host placed pool images, upload picked files, and merge every image choice
   *  (singles, logo, gallery) into base. Only TOUCHED single slots are overridden;
   *  the gallery is rebuilt from kept + dragged-pool-adds + uploads (one cap). */
  applyInto(base: BarberSiteContent): Promise<BarberSiteContent>;
}

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

/** A gallery tile (kept URL, dragged pool add, or uploaded-file preview) with a
 *  remove button. referrerPolicy=no-referrer is harmless for bucket/preview URLs. */
function GalleryTile({ src, onRemove }: { src: string; onRemove: () => void }) {
  return (
    <div className="relative h-16 w-16 overflow-hidden rounded border border-border">
      <img src={src} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
      <button type="button" onClick={onRemove} title="Remove" className="absolute right-0 top-0 bg-black/60 p-0.5 text-white">
        <X className="h-3 w-3" />
      </button>
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

  // Single-slot values, seeded from current content. `single` holds the display URL
  // (existing content URL, a dragged pool URL, or an object-URL preview of a picked
  // file); `singleFile` holds the File to upload when a file was picked. `touched` =
  // the user changed it here (drop / upload / clear) — only those override base.
  const [single, setSingle] = useState<Record<SingleField, string | undefined>>({
    heroImageUrl: content.heroImageUrl,
    aboutImageUrl: content.aboutImageUrl,
    whyUsImageUrl: content.whyUsImageUrl,
  });
  const [singleFile, setSingleFile] = useState<Record<SingleField, File | undefined>>({
    heroImageUrl: undefined,
    aboutImageUrl: undefined,
    whyUsImageUrl: undefined,
  });
  const [touched, setTouched] = useState<Set<SingleField>>(new Set());

  // Logo — upload-only (no pool/drag). Replace-only, mirroring SiteImageManager.
  const [logoUrl, setLogoUrl] = useState<string | undefined>(content.logoUrl);
  const [logoFile, setLogoFile] = useState<File | undefined>(undefined);

  // Gallery: existing saved images (deletable), dragged pool adds, and uploads.
  const [keptGallery, setKeptGallery] = useState<string[]>(
    (content.galleryImageUrls ?? []).filter((u): u is string => typeof u === "string" && !!u),
  );
  const [galleryAdds, setGalleryAdds] = useState<string[]>([]);
  const [galleryFiles, setGalleryFiles] = useState<{ file: File; preview: string }[]>([]);

  const [err, setErr] = useState<string | null>(null);

  const galleryTotal = keptGallery.length + galleryAdds.length + galleryFiles.length;
  const markDirty = () => onDirtyChange?.(true);

  // ── Single slots ──────────────────────────────────────────────────────────
  const dropSlot = (field: SingleField, url: string) => {
    // Dragged a pool photo → this wins; drop any previously-picked file for the slot.
    setSingle((p) => ({ ...p, [field]: url }));
    setSingleFile((p) => ({ ...p, [field]: undefined }));
    setTouched((p) => new Set(p).add(field));
    markDirty();
  };
  const uploadSlot = (field: SingleField, file: File) => {
    const v = validate(file);
    if (v) { setErr(v); return; }
    setErr(null);
    // Uploaded a file → this wins; keep the File and show an object-URL preview.
    setSingle((p) => ({ ...p, [field]: URL.createObjectURL(file) }));
    setSingleFile((p) => ({ ...p, [field]: file }));
    setTouched((p) => new Set(p).add(field));
    markDirty();
  };
  const clearSlot = (field: SingleField) => {
    setSingle((p) => ({ ...p, [field]: undefined }));
    setSingleFile((p) => ({ ...p, [field]: undefined }));
    setTouched((p) => new Set(p).add(field));
    markDirty();
  };
  const onDropSingle = (field: SingleField) => (e: React.DragEvent) => {
    e.preventDefault();
    const url = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
    if (url) dropSlot(field, url);
  };

  // ── Logo (upload only) ────────────────────────────────────────────────────
  const uploadLogo = (file: File) => {
    const v = validate(file);
    if (v) { setErr(v); return; }
    setErr(null);
    setLogoUrl(URL.createObjectURL(file));
    setLogoFile(file);
    markDirty();
  };

  // ── Gallery ───────────────────────────────────────────────────────────────
  const onDropGallery = (e: React.DragEvent) => {
    e.preventDefault();
    const url = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
    if (!url) return;
    if (galleryAdds.includes(url) || keptGallery.includes(url) || galleryTotal >= GALLERY_MAX) return;
    setGalleryAdds((p) => [...p, url]);
    markDirty();
  };
  const addGalleryFiles = (files: FileList | null) => {
    if (!files) return;
    setErr(null);
    const room = GALLERY_MAX - galleryTotal;
    if (room <= 0) { setErr(`Gallery is capped at ${GALLERY_MAX} images.`); return; }
    const picked = Array.from(files).slice(0, room);
    const bad = picked.map(validate).find(Boolean);
    if (bad) { setErr(bad); return; }
    if (Array.from(files).length > room) {
      setErr(`Gallery is capped at ${GALLERY_MAX} images — only the first ${room} were added.`);
    }
    setGalleryFiles((p) => [...p, ...picked.map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
    markDirty();
  };
  const removeKept = (url: string) => { setKeptGallery((p) => p.filter((u) => u !== url)); markDirty(); };
  const removeAdd = (url: string) => { setGalleryAdds((p) => p.filter((u) => u !== url)); markDirty(); };
  const removeFile = (idx: number) => { setGalleryFiles((p) => p.filter((_, i) => i !== idx)); markDirty(); };

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
      // Single slots: only the ones touched here. Uploaded file → uploadOne; else a
      // dragged/kept URL → rehost (bucket URLs pass through); cleared → stock.
      for (const { field } of singles) {
        if (!touched.has(field)) continue;
        const slot = field.replace("ImageUrl", "").toLowerCase();
        const f = singleFile[field];
        if (f) out[field] = await uploadOne(f, slot, siteId);
        else if (single[field]) out[field] = await rehost(single[field]!, slot);
        else out[field] = undefined;
      }
      // Logo: upload-only replace.
      if (logoFile) out.logoUrl = await uploadOne(logoFile, "logo", siteId);
      // Gallery: rebuild from kept (existing, minus deletions) + dragged pool adds
      // (rehosted) + uploaded files, de-duped and capped ONCE.
      if (hasGallery) {
        const rehosted: string[] = [];
        for (let i = 0; i < galleryAdds.length; i++) rehosted.push(await rehost(galleryAdds[i], `gallery-${i}`));
        const uploaded: string[] = [];
        for (let i = 0; i < galleryFiles.length; i++) uploaded.push(await uploadOne(galleryFiles[i].file, `gallery-up-${i}`, siteId));
        out.galleryImageUrls = Array.from(new Set([...keptGallery, ...rehosted, ...uploaded])).slice(0, GALLERY_MAX);
      }
      return out;
    },
  }), [singles, hasGallery, touched, single, singleFile, logoFile, keptGallery, galleryAdds, galleryFiles, siteId]);

  return (
    <div className="space-y-5">
      {pool.length > 0 ? (
        <>
          <p className="text-sm text-muted-foreground">
            Drag photos from the pool into a slot, or use <span className="font-medium">Upload</span> to add your own.
            A placed or uploaded photo replaces the stock image. Changes save with “Save all changes”.
          </p>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Image pool ({pool.length})</p>
            <div className="flex flex-wrap gap-2">
              {pool.map((url) => <PoolThumb key={url} url={url} />)}
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          No enriched photos in the pool yet — enrich this lead to pull Google/Facebook/Instagram photos to drag in.
          You can still upload your own images with the buttons below.
        </p>
      )}

      {/* Single slots — drag a pool photo OR upload a file (last action wins) */}
      <div className="grid gap-3 sm:grid-cols-3">
        {singles.map(({ field, label, hint }) => {
          const v = single[field];
          return (
            <div key={field} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{label}</span>
                {v && (
                  <button type="button" onClick={() => clearSlot(field)} title="Clear (use stock)"
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
                  <span className="px-2 text-[11px] text-muted-foreground">Stock — drop or upload<br />{hint}</span>
                )}
              </div>
              <label className="flex cursor-pointer items-center justify-center gap-1 rounded-md border border-border py-1 text-[11px] text-muted-foreground hover:border-primary hover:text-primary">
                <Upload className="h-3 w-3" /> Upload
                <input
                  type="file"
                  accept={IMAGE_ACCEPT}
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; e.currentTarget.value = ""; if (f) uploadSlot(field, f); }}
                />
              </label>
            </div>
          );
        })}
      </div>

      {/* Logo — upload only (no pool/drag) */}
      <div className="space-y-1 sm:max-w-[220px]">
        <span className="text-xs font-medium">Logo <span className="font-normal text-muted-foreground">(upload only)</span></span>
        <div className="flex aspect-video items-center justify-center overflow-hidden rounded-md border border-border bg-muted/30">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="h-full w-full object-contain p-1" />
          ) : (
            <span className="text-[11px] text-muted-foreground">wordmark</span>
          )}
        </div>
        <label className="flex cursor-pointer items-center justify-center gap-1 rounded-md border border-border py-1 text-[11px] text-muted-foreground hover:border-primary hover:text-primary">
          <Upload className="h-3 w-3" /> Upload logo
          <input
            type="file"
            accept={IMAGE_ACCEPT}
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.currentTarget.value = ""; if (f) uploadLogo(f); }}
          />
        </label>
      </div>

      {/* Gallery — drag pool photos, upload files, remove any tile (saved included) */}
      {hasGallery && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Gallery</span>
            <span className="text-[11px] text-muted-foreground">{galleryTotal}/{GALLERY_MAX}</span>
          </div>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDropGallery}
            className="flex min-h-[68px] flex-wrap items-center gap-2 rounded-md border border-dashed border-border bg-muted/40 p-2"
          >
            {galleryTotal === 0 && (
              <span className="px-2 text-[11px] text-muted-foreground">Drop pool photos here or upload to add to the gallery</span>
            )}
            {keptGallery.map((url) => (
              <GalleryTile key={`kept-${url}`} src={url} onRemove={() => removeKept(url)} />
            ))}
            {galleryAdds.map((url) => (
              <GalleryTile key={`add-${url}`} src={url} onRemove={() => removeAdd(url)} />
            ))}
            {galleryFiles.map((g, i) => (
              <GalleryTile key={`file-${i}-${g.file.name}`} src={g.preview} onRemove={() => removeFile(i)} />
            ))}
            {galleryTotal < GALLERY_MAX && (
              <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-1 rounded border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary">
                <Plus className="h-4 w-4" />
                <span className="text-[9px]">Add</span>
                <input
                  type="file"
                  accept={IMAGE_ACCEPT}
                  multiple
                  className="hidden"
                  onChange={(e) => { addGalleryFiles(e.target.files); e.currentTarget.value = ""; }}
                />
              </label>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Dragged pool photos and uploads are combined here — up to {GALLERY_MAX}. Remove any tile to drop it (saved photos included).
          </p>
        </div>
      )}

      {err && <p className="text-sm text-destructive">{err}</p>}
    </div>
  );
});
