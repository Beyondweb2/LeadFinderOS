import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, ExternalLink, Copy, Globe, EyeOff, Trash2, Plus, X } from "lucide-react";
import { SiteImageManager, type SiteImageManagerHandle } from "@/components/SiteImageManager";
import type { BarberSiteContent, BarberService } from "@/templates/barber/types";
import type { Json } from "@/integrations/supabase/types";

/**
 * Admin-only Manage Site page for a single generated barber site.
 * Edit text + services/prices, manage images/logo, publish/unpublish, copy link,
 * delete. A SINGLE "Save all changes" commits text + images in one DB write, with
 * an unsaved-changes guard. All writes go through admin-gated RLS; the isAdmin
 * check here is UX only.
 */
type SiteRow = {
  id: string;
  site_name: string;
  status: string;
  content: BarberSiteContent;
};

export default function AdminSiteManage() {
  const { id } = useParams();
  const { isAdmin, isLoading: roleLoading } = useSubscription();
  const navigate = useNavigate();
  const { toast } = useToast();
  const imageRef = useRef<SiteImageManagerHandle>(null);

  const [site, setSite] = useState<SiteRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [heroHeadline, setHeroHeadline] = useState("");
  const [tagline, setTagline] = useState("");
  const [about, setAbout] = useState("");
  const [services, setServices] = useState<BarberService[]>([]);
  const [showExamplePrices, setShowExamplePrices] = useState(false);
  const [googleReviewsUrl, setGoogleReviewsUrl] = useState("");

  const [textDirty, setTextDirty] = useState(false);
  const [imageDirty, setImageDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const anyDirty = textDirty || imageDirty;

  useEffect(() => {
    if (!isAdmin || !id) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("generated_sites")
        .select("id, site_name, status, content")
        .eq("id", id)
        .maybeSingle();
      if (error || !data) {
        setNotFound(true);
      } else {
        const row = data as unknown as SiteRow;
        setSite(row);
        const c = row.content || ({} as BarberSiteContent);
        setHeroHeadline(c.heroHeadline ?? "");
        setTagline(c.tagline ?? "");
        setAbout(c.about ?? "");
        setServices((c.services ?? []).map((s) => ({ ...s })));
        setShowExamplePrices(!!c.showExamplePrices);
        setGoogleReviewsUrl(c.googleReviewsUrl ?? "");
        setTextDirty(false);
        setImageDirty(false);
      }
      setLoading(false);
    })();
  }, [isAdmin, id]);

  // Warn before leaving (refresh / tab close) with unsaved edits.
  useEffect(() => {
    if (!anyDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [anyDirty]);

  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/landing" replace />;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }
  // Missing/deleted site (e.g. browser-back to a deleted row) → bounce to the
  // live Sites list instead of a dead-end, and replace it in history.
  if (notFound || !site) {
    return <Navigate to="/admin/sites" replace />;
  }

  const isPublished = site.status === "published";
  const publicUrl = `${window.location.origin}/p/${site.site_name}`;

  const updateService = (i: number, field: keyof BarberService, value: string) => {
    setServices((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));
    setTextDirty(true);
  };
  const addService = () => {
    setServices((prev) => [...prev, { name: "" }]);
    setTextDirty(true);
  };
  const removeService = (i: number) => {
    setServices((prev) => prev.filter((_, idx) => idx !== i));
    setTextDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const cleanedServices: BarberService[] = services
        .filter((s) => (s.name ?? "").trim())
        .map((s) => {
          const out: BarberService = { name: s.name.trim() };
          if (s.description && s.description.trim()) out.description = s.description.trim();
          if (s.price && s.price.trim()) out.price = s.price.trim();
          if (typeof s.durationMins === "number") out.durationMins = s.durationMins;
          return out;
        });

      const base: BarberSiteContent = {
        ...site.content,
        heroHeadline: heroHeadline.trim(),
        tagline: tagline.trim(),
        about: about.trim(),
        services: cleanedServices,
        showExamplePrices,
        googleReviewsUrl: googleReviewsUrl.trim() || undefined,
      };

      // Upload any pending images and merge them in — one combined content write.
      const finalContent = imageRef.current ? await imageRef.current.uploadPendingInto(base) : base;

      const { error } = await supabase
        .from("generated_sites")
        .update({ content: finalContent as unknown as Json })
        .eq("id", site.id);
      if (error) throw error;

      setSite({ ...site, content: finalContent });
      setServices(cleanedServices.map((s) => ({ ...s })));
      setTextDirty(false);
      setImageDirty(false);
      toast({ title: "Saved", description: "All changes saved." });
    } catch (e) {
      toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublish = async () => {
    setSavingStatus(true);
    const next = isPublished ? "draft" : "published";
    try {
      const { error } = await supabase
        .from("generated_sites")
        .update({ status: next as never })
        .eq("id", site.id);
      if (error) throw error;
      setSite({ ...site, status: next });
      toast({
        title: next === "published" ? "Published" : "Unpublished",
        description:
          next === "published"
            ? "The site is now publicly visible at its link."
            : "The site is now a draft (public visitors can't see it).",
      });
    } catch (e) {
      toast({ title: "Status change failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSavingStatus(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete the site for "${site.content?.businessName || site.site_name}"? This can't be undone.`)) {
      return;
    }
    setDeleting(true);
    try {
      const { error } = await supabase.from("generated_sites").delete().eq("id", site.id);
      if (error) throw error;
      toast({ title: "Site deleted" });
      navigate("/admin/sites", { replace: true });
    } catch (e) {
      toast({ title: "Delete failed", description: (e as Error).message, variant: "destructive" });
      setDeleting(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast({ title: "Link copied", description: publicUrl });
    } catch {
      toast({ title: "Copy failed", description: publicUrl, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            title="Back"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/admin/sites"))}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {site.content?.businessName || site.site_name}
            </h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant={isPublished ? "default" : "secondary"}>
                {isPublished ? "Published" : "Draft"}
              </Badge>
              <span className="font-mono text-xs">/p/{site.site_name}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={copyLink}>
            <Copy className="h-4 w-4 mr-2" /> Copy link
          </Button>
          <a href={publicUrl} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm">
              <ExternalLink className="h-4 w-4 mr-2" /> Preview
            </Button>
          </a>
          <Button size="sm" onClick={handleTogglePublish} disabled={savingStatus}>
            {savingStatus ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : isPublished ? (
              <EyeOff className="h-4 w-4 mr-2" />
            ) : (
              <Globe className="h-4 w-4 mr-2" />
            )}
            {isPublished ? "Unpublish" : "Publish"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleDelete} disabled={deleting} className="text-destructive hover:text-destructive">
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Text content */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Text content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Hero headline</Label>
            <Input value={heroHeadline} onChange={(e) => { setHeroHeadline(e.target.value); setTextDirty(true); }} />
          </div>
          <div className="space-y-1.5">
            <Label>Tagline</Label>
            <Input value={tagline} onChange={(e) => { setTagline(e.target.value); setTextDirty(true); }} />
          </div>
          <div className="space-y-1.5">
            <Label>About</Label>
            <Textarea rows={4} value={about} onChange={(e) => { setAbout(e.target.value); setTextDirty(true); }} />
          </div>

          <div className="space-y-3">
            <Label>Services &amp; prices</Label>
            {services.length === 0 && (
              <p className="text-sm text-muted-foreground">No services yet — add the shop's real menu below.</p>
            )}
            {services.map((s, i) => (
              <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1 space-y-2">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px]">
                      <Input value={s.name} placeholder="Service name" onChange={(e) => updateService(i, "name", e.target.value)} />
                      <Input value={s.price ?? ""} placeholder="Price (optional)" onChange={(e) => updateService(i, "price", e.target.value)} />
                    </div>
                    <Input value={s.description ?? ""} placeholder="Description (optional)" onChange={(e) => updateService(i, "description", e.target.value)} />
                  </div>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" title="Remove service" onClick={() => removeService(i)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addService}>
              <Plus className="h-4 w-4 mr-2" /> Add service
            </Button>
            <p className="text-xs text-muted-foreground">
              Enter the shop's real services and prices. Leave a price blank to show "Price on request" (or an example, below).
              Nothing is auto-generated.
            </p>
          </div>

          <div className="space-y-4 border-t border-border pt-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label>Show example prices</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Services without a confirmed price show an illustrative <span className="font-medium">example</span> price
                  (clearly labelled) instead of "Price on request". Confirmed prices are never relabelled.
                </p>
              </div>
              <Switch checked={showExamplePrices} onCheckedChange={(v) => { setShowExamplePrices(v); setTextDirty(true); }} />
            </div>

            <div className="space-y-1.5">
              <Label>Google reviews / Maps URL</Label>
              <Input
                value={googleReviewsUrl}
                placeholder="https://maps.google.com/…"
                onChange={(e) => { setGoogleReviewsUrl(e.target.value); setTextDirty(true); }}
              />
              <p className="text-xs text-muted-foreground">
                Adds a "Read our Google reviews" link (with the Google logo) by the rating. Leave blank to hide it.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Images + logo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Images &amp; logo</CardTitle>
        </CardHeader>
        <CardContent>
          <SiteImageManager
            ref={imageRef}
            controlled
            key={site.id}
            siteId={site.id}
            content={site.content}
            onDirtyChange={setImageDirty}
          />
        </CardContent>
      </Card>

      {/* Single save bar — saves text + prices + reviews + toggle + images at once */}
      <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-xl border border-border bg-background/95 px-4 py-3 backdrop-blur">
        <span className={`text-sm ${anyDirty ? "text-amber-500" : "text-muted-foreground"}`}>
          {anyDirty ? "You have unsaved changes" : "All changes saved"}
        </span>
        <Button onClick={handleSave} disabled={saving || !anyDirty}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save all changes
        </Button>
      </div>
    </div>
  );
}
