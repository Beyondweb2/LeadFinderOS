import { useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Check, Globe, EyeOff, X, PencilLine, Palette, Camera, Upload, Trash2 } from "lucide-react";
import { BarberSiteTemplate } from "@/templates/barber/BarberSiteTemplate";
import type { BarberSiteContent } from "@/templates/barber/types";
import { BARBER_ACCENTS } from "@/config/barberAccents";
import type { OwnedSite } from "@/components/barber/BarberShell";
import { useToast } from "@/hooks/use-toast";
import { uploadOne, validate as validateImageFile, GALLERY_MAX, IMAGE_ACCEPT } from "@/components/SiteImageManager";
import type { BarberImageSlot } from "@/lib/barberEdits";

/**
 * Live tap-to-edit editor (Phase 0 + 1).
 *
 * Renders the REAL BarberSiteTemplate full-screen in `editable` mode. Tapping a
 * marked element opens a bottom sheet with just that element's control; typing
 * updates `liveContent` so the site re-renders live behind the sheet; changes
 * autosave to generated_sites.content (the same path the classic form uses).
 *
 * The global bar handles site-wide things: colour theme, Publish/Unpublish, Done.
 * Phase 1 wires TEXT elements (headline / tagline / about / business name); Phase 2
 * wires PHOTOS — tapping the hero / about / a gallery tile opens an image sheet that
 * uploads via the owner SiteImageManager path and patches the URL into content live.
 * The gallery also supports add + remove (the owner's full editor).
 */

type ElementDef = {
  label: string;
  render: (content: BarberSiteContent, patch: (next: Partial<BarberSiteContent>) => void) => ReactNode;
};

// What the image bottom-sheet is currently editing. Gallery edits carry the index
// into content.galleryImageUrls; "gallery-add" appends a new photo.
type ImageTarget =
  | { kind: "hero" }
  | { kind: "about" }
  | { kind: "gallery"; index: number }
  | { kind: "gallery-add" };

function TextControl({
  value,
  onChange,
  multiline = false,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const cls =
    "w-full rounded-lg border border-line bg-ink-soft px-3 py-2 text-white placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/60";
  return multiline ? (
    <textarea
      autoFocus
      rows={5}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`${cls} resize-none leading-relaxed`}
    />
  ) : (
    <Input autoFocus value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cls} />
  );
}

// elementKey → { label, control }. Phase 1: top-level text fields.
const ELEMENTS: Record<string, ElementDef> = {
  businessName: {
    label: "Business name",
    render: (c, patch) => <TextControl value={c.businessName ?? ""} onChange={(v) => patch({ businessName: v })} />,
  },
  heroHeadline: {
    label: "Headline",
    render: (c, patch) => <TextControl value={c.heroHeadline ?? ""} onChange={(v) => patch({ heroHeadline: v })} />,
  },
  tagline: {
    label: "Tagline",
    render: (c, patch) => <TextControl multiline value={c.tagline ?? ""} onChange={(v) => patch({ tagline: v })} />,
  },
  about: {
    label: "About — your story",
    render: (c, patch) => <TextControl multiline value={c.about ?? ""} onChange={(v) => patch({ about: v })} />,
  },
};

export function LiveSiteEditor({
  site,
  onContentSaved,
  onExit,
  published,
  onTogglePublish,
  savingStatus,
  onUseClassic,
}: {
  site: OwnedSite;
  onContentSaved?: (content: BarberSiteContent) => void;
  onExit: () => void;
  published: boolean;
  onTogglePublish: () => void;
  savingStatus: boolean;
  onUseClassic: () => void;
}) {
  const { toast } = useToast();
  const [liveContent, setLiveContent] = useState<BarberSiteContent>(site.content);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [imgTarget, setImgTarget] = useState<ImageTarget | null>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const firstRun = useRef(true);
  const imgInputRef = useRef<HTMLInputElement>(null);

  const patch = (next: Partial<BarberSiteContent>) => setLiveContent((c) => ({ ...c, ...next }));

  // Debounced autosave: every liveContent change persists to generated_sites.content
  // (owner-RLS; content is not a protected field). Last-write-wins — fine for one
  // barber editing their own site.
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    setSaveState("saving");
    const t = setTimeout(async () => {
      const { error } = await (supabase as unknown as SupabaseClient)
        .from("generated_sites")
        .update({ content: liveContent })
        .eq("id", site.id);
      if (error) {
        setSaveState("idle");
        toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
        return;
      }
      onContentSaved?.(liveContent);
      setSaveState("saved");
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveContent]);

  // ── Photo editing (Phase 2) ────────────────────────────────────────────────
  // Open the image sheet for a tapped photo. Slots come from the template:
  // "hero" | "about" | "gallery-<i>". Clears any open text sheet.
  const handleEditImage = (slot: BarberImageSlot) => {
    setActiveKey(null);
    if (slot === "hero") setImgTarget({ kind: "hero" });
    else if (slot === "about") setImgTarget({ kind: "about" });
    else if (slot.startsWith("gallery-")) {
      const index = Number.parseInt(slot.slice("gallery-".length), 10);
      if (!Number.isNaN(index)) setImgTarget({ kind: "gallery", index });
    }
  };

  const handleAddImage = () => {
    if ((liveContent.galleryImageUrls ?? []).length >= GALLERY_MAX) {
      toast({ title: "Gallery is full", description: `You can have up to ${GALLERY_MAX} photos.` });
      return;
    }
    setActiveKey(null);
    setImgTarget({ kind: "gallery-add" });
  };

  // Upload a picked file for the current target and patch its URL into content
  // (live preview + the debounced autosave persists it). Uses the owner storage
  // path via the shared SiteImageManager helper.
  const uploadForTarget = async (file: File | null, target: ImageTarget) => {
    if (!file) return;
    const vErr = validateImageFile(file);
    if (vErr) {
      toast({ title: "Can't use that file", description: vErr, variant: "destructive" });
      return;
    }
    setImgBusy(true);
    try {
      const len = (liveContent.galleryImageUrls ?? []).length;
      const slotLabel =
        target.kind === "hero" ? "hero"
        : target.kind === "about" ? "about"
        : target.kind === "gallery" ? `gallery-${target.index}`
        : `gallery-${len}`;
      const url = await uploadOne(file, slotLabel, site.id);
      if (target.kind === "hero") patch({ heroImageUrl: url });
      else if (target.kind === "about") patch({ aboutImageUrl: url });
      else if (target.kind === "gallery") {
        setLiveContent((c) => {
          const next = [...(c.galleryImageUrls ?? [])];
          next[target.index] = url;
          return { ...c, galleryImageUrls: next };
        });
      } else {
        setLiveContent((c) => ({
          ...c,
          galleryImageUrls: [...(c.galleryImageUrls ?? []), url].slice(0, GALLERY_MAX),
        }));
      }
      setImgTarget(null);
    } catch (e) {
      toast({ title: "Upload failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setImgBusy(false);
    }
  };

  const removeGalleryAt = (index: number) => {
    setLiveContent((c) => ({
      ...c,
      galleryImageUrls: (c.galleryImageUrls ?? []).filter((_, i) => i !== index),
    }));
    setImgTarget(null);
  };

  const currentImgUrl =
    imgTarget?.kind === "hero" ? liveContent.heroImageUrl
    : imgTarget?.kind === "about" ? liveContent.aboutImageUrl
    : imgTarget?.kind === "gallery" ? (liveContent.galleryImageUrls ?? [])[imgTarget.index]
    : undefined;

  const imgSheetTitle =
    imgTarget?.kind === "hero" ? "Hero photo"
    : imgTarget?.kind === "about" ? "About photo"
    : imgTarget?.kind === "gallery" ? "Gallery photo"
    : "Add a photo";

  const currentAccent = (liveContent.accentColor ?? BARBER_ACCENTS[0].hex).toLowerCase();
  const active = activeKey ? ELEMENTS[activeKey] : null;

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-ink">
      {/* The real site, live + full-bleed, in edit mode. Text taps open the element
          sheet; photo taps (hero/about/gallery) open the image sheet; the gallery
          gains add/remove via owner mode. */}
      <BarberSiteTemplate
        content={liveContent}
        bookingEnabled={false}
        editable
        onEditElement={(key) => { setImgTarget(null); setActiveKey(key); }}
        onEditImage={handleEditImage}
        onAddImage={handleAddImage}
      />

      {/* ── GLOBAL BAR (site-wide controls) ─────────────────────────────────── */}
      <div className="fixed inset-x-0 bottom-0 z-[55] border-t-2 border-white/15 bg-ink/95 px-3 py-2.5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
          {/* Colour theme — palette icon + evenly spaced swatches (palette from the
              pre-claim dock). Centres on its own row on mobile, left-aligns inline on
              desktop; no overflow scroll stub. */}
          <div className="flex items-center justify-center gap-2.5 sm:justify-start">
            <Palette className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
            <div className="flex flex-wrap items-center justify-center gap-2">
              {BARBER_ACCENTS.map((a) => {
                const selected = a.hex.toLowerCase() === currentAccent;
                return (
                  <button
                    key={a.hex}
                    type="button"
                    title={a.name}
                    aria-label={a.name}
                    aria-pressed={selected}
                    onClick={() => patch({ accentColor: a.hex })}
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ring-2 ring-offset-2 ring-offset-ink transition-transform ${
                      selected ? "scale-110 ring-white" : "ring-white/15 hover:scale-105 hover:ring-white/40"
                    }`}
                    style={{ backgroundColor: a.hex }}
                  >
                    {selected && <Check className="h-3.5 w-3.5 text-ink" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 sm:ml-auto">
            {/* Save status */}
            <span className="hidden text-xs text-zinc-400 sm:inline">
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
            </span>
            <button
              type="button"
              onClick={onUseClassic}
              className="hidden text-xs text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline sm:inline"
            >
              Classic editor
            </button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onTogglePublish}
              disabled={savingStatus}
              aria-label={published ? "Unpublish" : "Publish"}
              className="rounded-full border-line bg-white/[0.03] text-zinc-200 hover:border-amber/50 hover:text-white"
            >
              {savingStatus ? <Loader2 className="h-4 w-4 animate-spin sm:mr-1.5" /> : published ? <EyeOff className="h-4 w-4 sm:mr-1.5" /> : <Globe className="h-4 w-4 sm:mr-1.5" />}
              <span className="hidden sm:inline">{published ? "Unpublish" : "Publish"}</span>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onExit}
              className="rounded-full bg-amber font-bold text-ink hover:bg-amber-soft"
            >
              Done
            </Button>
          </div>
        </div>
      </div>

      {/* ── BOTTOM SHEET (per-element editor) ───────────────────────────────── */}
      {active && (
        <div className="fixed inset-x-0 bottom-0 z-[60] rounded-t-2xl border-t-2 border-amber/30 bg-ink-card px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.85)]">
          <div className="mx-auto max-w-md">
            <div className="mb-3 flex items-center justify-between">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                <PencilLine className="h-4 w-4 text-amber" /> {active.label}
              </div>
              <button
                type="button"
                onClick={() => setActiveKey(null)}
                aria-label="Close"
                className="rounded-full p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {active.render(liveContent, patch)}
            <Button
              type="button"
              onClick={() => setActiveKey(null)}
              className="mt-4 w-full rounded-full bg-amber font-bold text-ink hover:bg-amber-soft"
            >
              Done
            </Button>
          </div>
        </div>
      )}

      {/* ── BOTTOM SHEET (photo editor) ─────────────────────────────────────── */}
      {imgTarget && (
        <div className="fixed inset-x-0 bottom-0 z-[60] rounded-t-2xl border-t-2 border-amber/30 bg-ink-card px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.85)]">
          <div className="mx-auto max-w-md">
            <div className="mb-3 flex items-center justify-between">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                <Camera className="h-4 w-4 text-amber" /> {imgSheetTitle}
              </div>
              <button
                type="button"
                onClick={() => setImgTarget(null)}
                aria-label="Close"
                className="rounded-full p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Current photo preview (or a note when the site is on a stock photo). */}
            {currentImgUrl ? (
              <div className="overflow-hidden rounded-lg border border-line">
                <img src={currentImgUrl} alt="Current" className="aspect-video w-full object-cover" />
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-line bg-ink-soft px-3 py-4 text-center text-sm text-zinc-400">
                {imgTarget.kind === "gallery-add" ? "Choose a photo to add to your gallery." : "Currently showing a stock photo — upload your own to replace it."}
              </p>
            )}

            {/* Hidden picker, driven by the upload button. */}
            <input
              ref={imgInputRef}
              type="file"
              accept={IMAGE_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.target.value = "";
                if (f && imgTarget) uploadForTarget(f, imgTarget);
              }}
            />

            <Button
              type="button"
              disabled={imgBusy}
              onClick={() => imgInputRef.current?.click()}
              className="mt-4 w-full rounded-full bg-amber font-bold text-ink hover:bg-amber-soft"
            >
              {imgBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {imgBusy ? "Uploading…" : currentImgUrl ? "Replace photo" : "Upload a photo"}
            </Button>

            {/* Remove (existing gallery photos only). */}
            {imgTarget.kind === "gallery" && (
              <Button
                type="button"
                variant="outline"
                disabled={imgBusy}
                onClick={() => removeGalleryAt(imgTarget.index)}
                className="mt-2 w-full rounded-full border-line bg-transparent text-red-300 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-200"
              >
                <Trash2 className="mr-2 h-4 w-4" /> Remove photo
              </Button>
            )}

            <p className="mt-3 text-center text-[11px] text-zinc-500">JPEG, PNG or WebP · up to 5 MB</p>
          </div>
        </div>
      )}
    </div>
  );
}
