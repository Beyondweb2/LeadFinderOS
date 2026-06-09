import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, X, Plus } from "lucide-react";
import type { BarberSiteContent } from "@/templates/barber/types";
import type { Json } from "@/integrations/supabase/types";

/**
 * Reusable admin image/logo uploader for a single generated site.
 * Used by both /admin/site-images and the Manage Site page.
 *
 * - hero / about / logo: single-replace slots (leave empty to keep current).
 * - gallery: a dynamic list of up to 10 images (add new files, remove existing),
 *   stored as content.galleryImageUrls (string[]). Existing sites already use
 *   this array, so no migration is needed.
 *
 * Uploads to the shared `barber-site-images` bucket (admin-only writes via
 * storage RLS); writes URLs into generated_sites.content (admin RLS UPDATE).
 * The page-level isAdmin gate is UX only; the real boundary is those policies.
 */

const BUCKET = "barber-site-images";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const GALLERY_MAX = 10;

function validate(f: File | null): string | null {
  if (!f) return null;
  if (!ALLOWED.includes(f.type)) return `${f.name}: must be JPEG, PNG or WebP`;
  if (f.size > MAX_BYTES) return `${f.name}: must be under 5 MB`;
  return null;
}

async function uploadOne(file: File, slot: string, siteId: string): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${siteId}/${slot}-${Date.now()}-${Math.floor(performance.now())}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export function SiteImageManager({
  siteId,
  content,
  onSaved,
}: {
  siteId: string;
  content: BarberSiteContent;
  onSaved?: (newContent: BarberSiteContent) => void;
}) {
  const [hero, setHero] = useState<File | null>(null);
  const [about, setAbout] = useState<File | null>(null);
  const [logo, setLogo] = useState<File | null>(null);

  // Gallery: existing URLs the admin chooses to keep + new files to add (cap 10).
  const [keptGallery, setKeptGallery] = useState<string[]>(content.galleryImageUrls ?? []);
  const [newFiles, setNewFiles] = useState<File[]>([]);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const galleryTotal = keptGallery.length + newFiles.length;

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    setErr(null);
    const room = GALLERY_MAX - galleryTotal;
    const picked = Array.from(files).slice(0, Math.max(0, room));
    const bad = picked.map(validate).find(Boolean);
    if (bad) return setErr(bad);
    if (Array.from(files).length > room) {
      setErr(`Gallery is capped at ${GALLERY_MAX} images — only the first ${room} were added.`);
    }
    setNewFiles((prev) => [...prev, ...picked]);
  };

  const handleSave = async () => {
    setErr(null);
    setMsg(null);
    const galleryChanged =
      JSON.stringify(keptGallery) !== JSON.stringify(content.galleryImageUrls ?? []) ||
      newFiles.length > 0;
    if (!hero && !about && !logo && !galleryChanged) {
      return setErr("Choose an image or change the gallery first.");
    }
    const vErr = validate(hero) || validate(about) || validate(logo) || newFiles.map(validate).find(Boolean) || null;
    if (vErr) return setErr(vErr);

    setBusy(true);
    try {
      const heroUrl = hero ? await uploadOne(hero, "hero", siteId) : content.heroImageUrl;
      const aboutUrl = about ? await uploadOne(about, "about", siteId) : content.aboutImageUrl;
      const logoUrl = logo ? await uploadOne(logo, "logo", siteId) : content.logoUrl;

      const uploadedGallery: string[] = [];
      for (let i = 0; i < newFiles.length; i++) {
        uploadedGallery.push(await uploadOne(newFiles[i], `gallery-${i}`, siteId));
      }
      const gallery = [...keptGallery, ...uploadedGallery].slice(0, GALLERY_MAX);

      const newContent: BarberSiteContent = {
        ...content,
        ...(heroUrl ? { heroImageUrl: heroUrl } : {}),
        ...(aboutUrl ? { aboutImageUrl: aboutUrl } : {}),
        ...(logoUrl ? { logoUrl } : {}),
        galleryImageUrls: gallery, // always set so removals persist (empty -> stock fallback)
      };

      const { error } = await supabase
        .from("generated_sites")
        .update({ content: newContent as unknown as Json })
        .eq("id", siteId);
      if (error) throw error;

      setHero(null);
      setAbout(null);
      setLogo(null);
      setKeptGallery(gallery);
      setNewFiles([]);
      setMsg("Saved — the site now uses the updated image(s).");
      onSaved?.(newContent);
    } catch (e) {
      setErr((e as Error).message || "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Single-replace slots */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SingleSlot label="Hero image" current={content.heroImageUrl} file={hero} onPick={setHero} />
        <SingleSlot label="About / Story image" current={content.aboutImageUrl} file={about} onPick={setAbout} />
        <SingleSlot label="Logo" current={content.logoUrl} file={logo} onPick={setLogo} contain />
      </div>

      {/* Dynamic gallery */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Gallery images</Label>
          <span className="text-xs text-muted-foreground">{galleryTotal}/{GALLERY_MAX}</span>
        </div>

        {galleryTotal === 0 && (
          <p className="text-xs text-muted-foreground">No gallery images — the site uses bundled stock photos.</p>
        )}

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {keptGallery.map((url, i) => (
            <div key={`${url}-${i}`} className="group relative aspect-square overflow-hidden rounded-md border border-border">
              <img src={url} alt={`Gallery ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => setKeptGallery((prev) => prev.filter((_, idx) => idx !== i))}
                title="Remove"
                className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {newFiles.map((f, i) => (
            <div key={`new-${f.name}-${i}`} className="relative flex aspect-square items-center justify-center rounded-md border border-dashed border-amber/40 bg-amber/5 p-2 text-center">
              <span className="truncate text-[10px] text-muted-foreground">{f.name}</span>
              <button
                type="button"
                onClick={() => setNewFiles((prev) => prev.filter((_, idx) => idx !== i))}
                title="Remove"
                className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {galleryTotal < GALLERY_MAX && (
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary">
              <Plus className="h-5 w-5" />
              <span className="text-[10px]">Add</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => addFiles(e.target.files)}
              />
            </label>
          )}
        </div>
      </div>

      {err && <p className="text-sm text-destructive">{err}</p>}
      {msg && <p className="text-sm text-green-500">{msg}</p>}

      <Button onClick={handleSave} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
        {busy ? "Saving…" : "Save images"}
      </Button>
    </div>
  );
}

function SingleSlot({
  label,
  current,
  file,
  onPick,
  contain,
}: {
  label: string;
  current?: string;
  file: File | null;
  onPick: (f: File | null) => void;
  contain?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <div className="aspect-video overflow-hidden rounded-md border border-border bg-muted/30 flex items-center justify-center">
        {current ? (
          <img src={current} alt={label} className={`h-full w-full ${contain ? "object-contain p-1" : "object-cover"}`} />
        ) : (
          <span className="text-xs text-muted-foreground">{contain ? "wordmark" : "stock"}</span>
        )}
      </div>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        className="block w-full text-xs text-muted-foreground file:mr-2 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary file:px-2 file:py-1 file:text-primary-foreground"
      />
      {file && <p className="truncate text-[11px] text-muted-foreground">{file.name}</p>}
    </div>
  );
}
