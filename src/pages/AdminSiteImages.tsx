import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Loader2, Upload, ExternalLink } from "lucide-react";
import type { BarberSiteContent } from "@/templates/barber/types";
import type { Json } from "@/integrations/supabase/types";

/**
 * Admin-only page to upload images for a generated barber site (done-for-you).
 *
 * Admin picks a generated site, uploads 1 hero + up to 2 gallery images, and the
 * public URLs are written into that site's generated_sites.content
 * (heroImageUrl / galleryImageUrls). The template renders these and falls back
 * to bundled stock when a slot is empty.
 *
 * Security: writes are gated server-side by the barber-site-images storage
 * policies (admins only) and the generated_sites admin RLS policy. The isAdmin
 * check here is UX only (redirect non-admins) — it is NOT the security boundary.
 */

const BUCKET = "barber-site-images";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

type SiteRow = {
  id: string;
  site_name: string;
  status: string;
  content: BarberSiteContent;
};

export default function AdminSiteImages() {
  const { isAdmin, isLoading: roleLoading } = useSubscription();
  const navigate = useNavigate();

  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [hero, setHero] = useState<File | null>(null);
  const [g1, setG1] = useState<File | null>(null);
  const [g2, setG2] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const selected = useMemo(
    () => sites.find((s) => s.id === selectedId) ?? null,
    [sites, selectedId],
  );

  const loadSites = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("generated_sites")
      .select("id, site_name, status, content")
      .order("created_at", { ascending: false });
    if (error) setErr(error.message);
    else setSites((data ?? []) as unknown as SiteRow[]);
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) loadSites();
  }, [isAdmin]);

  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/landing" replace />;

  const validate = (f: File | null): string | null => {
    if (!f) return null;
    if (!ALLOWED.includes(f.type)) return `${f.name}: must be JPEG, PNG or WebP`;
    if (f.size > MAX_BYTES) return `${f.name}: must be under 5 MB`;
    return null;
  };

  const uploadOne = async (file: File, slot: string, siteId: string): Promise<string> => {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${siteId}/${slot}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  };

  const handleSave = async () => {
    setErr(null);
    setMsg(null);
    if (!selected) return setErr("Pick a site first.");
    if (!hero && !g1 && !g2) return setErr("Choose at least one image.");
    const vErr = validate(hero) || validate(g1) || validate(g2);
    if (vErr) return setErr(vErr);

    setBusy(true);
    try {
      const existing = (selected.content || {}) as BarberSiteContent;
      const heroUrl = hero ? await uploadOne(hero, "hero", selected.id) : existing.heroImageUrl;
      const g1Url = g1 ? await uploadOne(g1, "gallery-1", selected.id) : existing.galleryImageUrls?.[0];
      const g2Url = g2 ? await uploadOne(g2, "gallery-2", selected.id) : existing.galleryImageUrls?.[1];
      const gallery = [g1Url, g2Url].filter(Boolean) as string[];

      const newContent: BarberSiteContent = {
        ...existing,
        ...(heroUrl ? { heroImageUrl: heroUrl } : {}),
        ...(gallery.length ? { galleryImageUrls: gallery } : {}),
      };

      const { error } = await supabase
        .from("generated_sites")
        .update({ content: newContent as unknown as Json })
        .eq("id", selected.id);
      if (error) throw error;

      setSites((prev) =>
        prev.map((s) => (s.id === selected.id ? { ...s, content: newContent } : s)),
      );
      setHero(null);
      setG1(null);
      setG2(null);
      setMsg("Saved — the site now uses the uploaded image(s).");
    } catch (e) {
      setErr((e as Error).message || "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold text-foreground">Barber Site Images</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Upload images on the barber's behalf — 1 hero + up to 2 gallery images per site. They
        replace the bundled stock photos on the generated site; leave a slot empty to keep the
        current image. JPEG/PNG/WebP, max 5&nbsp;MB.
      </p>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Choose a site</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <Select
              value={selectedId}
              onValueChange={(v) => {
                setSelectedId(v);
                setHero(null);
                setG1(null);
                setG2(null);
                setMsg(null);
                setErr(null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a generated site…" />
              </SelectTrigger>
              <SelectContent>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {(s.content?.businessName || s.site_name) + ` — ${s.status}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {sites.length === 0 && (
              <p className="text-sm text-muted-foreground">No generated sites yet.</p>
            )}

            {selected && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Thumb label="Hero" url={selected.content?.heroImageUrl} />
                  <Thumb label="Gallery 1" url={selected.content?.galleryImageUrls?.[0]} />
                  <Thumb label="Gallery 2" url={selected.content?.galleryImageUrls?.[1]} />
                </div>

                <FileSlot label="Hero image" file={hero} onPick={setHero} />
                <FileSlot label="Gallery image 1" file={g1} onPick={setG1} />
                <FileSlot label="Gallery image 2" file={g2} onPick={setG2} />

                {err && <p className="text-sm text-destructive">{err}</p>}
                {msg && <p className="text-sm text-green-500">{msg}</p>}

                <div className="flex items-center gap-4">
                  <Button onClick={handleSave} disabled={busy}>
                    {busy ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    {busy ? "Uploading…" : "Upload & save"}
                  </Button>
                  <a
                    href={`/p/${selected.site_name}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    Preview site <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Thumb({ label, url }: { label: string; url?: string }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="aspect-video overflow-hidden rounded-md border border-border bg-muted/30 flex items-center justify-center">
        {url ? (
          <img src={url} alt={label} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-muted-foreground">stock</span>
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
