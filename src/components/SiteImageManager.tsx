import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Upload } from "lucide-react";
import type { BarberSiteContent } from "@/templates/barber/types";
import type { Json } from "@/integrations/supabase/types";

/**
 * Reusable admin image/logo uploader for a single generated site.
 * Used by both /admin/site-images and the Manage Site page.
 *
 * Uploads to the shared `barber-site-images` bucket (admin-only writes enforced
 * by storage RLS) and writes the public URLs into generated_sites.content
 * (heroImageUrl / galleryImageUrls / aboutImageUrl / logoUrl). Empty slots keep
 * the current image. The page-level isAdmin gate is UX; the real boundary is the
 * storage policies + generated_sites admin RLS.
 */

const BUCKET = "barber-site-images";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

function validate(f: File | null): string | null {
  if (!f) return null;
  if (!ALLOWED.includes(f.type)) return `${f.name}: must be JPEG, PNG or WebP`;
  if (f.size > MAX_BYTES) return `${f.name}: must be under 5 MB`;
  return null;
}

async function uploadOne(file: File, slot: string, siteId: string): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${siteId}/${slot}-${Date.now()}.${ext}`;
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
  const [g1, setG1] = useState<File | null>(null);
  const [g2, setG2] = useState<File | null>(null);
  const [about, setAbout] = useState<File | null>(null);
  const [logo, setLogo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => {
    setHero(null);
    setG1(null);
    setG2(null);
    setAbout(null);
    setLogo(null);
  };

  const handleSave = async () => {
    setErr(null);
    setMsg(null);
    if (!hero && !g1 && !g2 && !about && !logo) {
      return setErr("Choose at least one image.");
    }
    const vErr = validate(hero) || validate(g1) || validate(g2) || validate(about) || validate(logo);
    if (vErr) return setErr(vErr);

    setBusy(true);
    try {
      const heroUrl = hero ? await uploadOne(hero, "hero", siteId) : content.heroImageUrl;
      const aboutUrl = about ? await uploadOne(about, "about", siteId) : content.aboutImageUrl;
      const logoUrl = logo ? await uploadOne(logo, "logo", siteId) : content.logoUrl;
      const g1Url = g1 ? await uploadOne(g1, "gallery-1", siteId) : content.galleryImageUrls?.[0];
      const g2Url = g2 ? await uploadOne(g2, "gallery-2", siteId) : content.galleryImageUrls?.[1];
      const gallery = [g1Url, g2Url].filter(Boolean) as string[];

      const newContent: BarberSiteContent = {
        ...content,
        ...(heroUrl ? { heroImageUrl: heroUrl } : {}),
        ...(aboutUrl ? { aboutImageUrl: aboutUrl } : {}),
        ...(logoUrl ? { logoUrl } : {}),
        ...(gallery.length ? { galleryImageUrls: gallery } : {}),
      };

      const { error } = await supabase
        .from("generated_sites")
        .update({ content: newContent as unknown as Json })
        .eq("id", siteId);
      if (error) throw error;

      reset();
      setMsg("Saved — the site now uses the uploaded image(s).");
      onSaved?.(newContent);
    } catch (e) {
      setErr((e as Error).message || "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Thumb label="Hero" url={content.heroImageUrl} />
        <Thumb label="Gallery 1" url={content.galleryImageUrls?.[0]} />
        <Thumb label="Gallery 2" url={content.galleryImageUrls?.[1]} />
        <Thumb label="About / Story" url={content.aboutImageUrl} />
        <Thumb label="Logo" url={content.logoUrl} contain />
      </div>

      <FileSlot label="Hero image" file={hero} onPick={setHero} />
      <FileSlot label="Gallery image 1" file={g1} onPick={setG1} />
      <FileSlot label="Gallery image 2" file={g2} onPick={setG2} />
      <FileSlot label="About / Story image" file={about} onPick={setAbout} />
      <FileSlot label="Logo (replaces the text wordmark)" file={logo} onPick={setLogo} />

      {err && <p className="text-sm text-destructive">{err}</p>}
      {msg && <p className="text-sm text-green-500">{msg}</p>}

      <Button onClick={handleSave} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
        {busy ? "Uploading…" : "Upload & save images"}
      </Button>
    </div>
  );
}

function Thumb({ label, url, contain }: { label: string; url?: string; contain?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="aspect-video overflow-hidden rounded-md border border-border bg-muted/30 flex items-center justify-center">
        {url ? (
          <img src={url} alt={label} className={`h-full w-full ${contain ? "object-contain p-1" : "object-cover"}`} />
        ) : (
          <span className="text-xs text-muted-foreground">{contain ? "wordmark" : "stock"}</span>
        )}
      </div>
    </div>
  );
}

function FileSlot({
  label,
  file,
  onPick,
}: {
  label: string;
  file: File | null;
  onPick: (f: File | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        className="block w-full text-sm text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground"
      />
      {file && (
        <p className="text-xs text-muted-foreground">
          {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
        </p>
      )}
    </div>
  );
}
