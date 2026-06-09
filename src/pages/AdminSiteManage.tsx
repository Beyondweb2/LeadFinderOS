import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, ExternalLink, Copy, Globe, EyeOff } from "lucide-react";
import { SiteImageManager } from "@/components/SiteImageManager";
import type { BarberSiteContent, BarberService } from "@/templates/barber/types";
import type { Json } from "@/integrations/supabase/types";

/**
 * Admin-only Manage Site page for a single generated barber site.
 * Edit text + prices, manage images/logo (shared SiteImageManager), publish /
 * unpublish, and copy the public link. All writes go through admin-gated RLS
 * (generated_sites UPDATE + barber-site-images storage policies); the isAdmin
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

  const [site, setSite] = useState<SiteRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Text form state (separate from image saves, which only touch image fields).
  const [heroHeadline, setHeroHeadline] = useState("");
  const [tagline, setTagline] = useState("");
  const [about, setAbout] = useState("");
  const [services, setServices] = useState<BarberService[]>([]);
  const [savingText, setSavingText] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

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
      }
      setLoading(false);
    })();
  }, [isAdmin, id]);

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
  if (notFound || !site) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <p className="text-muted-foreground">Site not found.</p>
        <Button onClick={() => navigate("/admin/sites")}>Back to sites</Button>
      </div>
    );
  }

  const isPublished = site.status === "published";
  const publicUrl = `${window.location.origin}/p/${site.site_name}`;

  const updateService = (i: number, field: keyof BarberService, value: string) => {
    setServices((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));
  };

  const handleSaveText = async () => {
    setSavingText(true);
    try {
      // Clean services: keep names; drop empty description/price (never store "").
      const cleanedServices: BarberService[] = services
        .filter((s) => (s.name ?? "").trim())
        .map((s) => {
          const out: BarberService = { name: s.name.trim() };
          if (s.description && s.description.trim()) out.description = s.description.trim();
          if (s.price && s.price.trim()) out.price = s.price.trim();
          if (typeof s.durationMins === "number") out.durationMins = s.durationMins;
          return out;
        });

      const newContent: BarberSiteContent = {
        ...site.content,
        heroHeadline: heroHeadline.trim(),
        tagline: tagline.trim(),
        about: about.trim(),
        services: cleanedServices,
      };

      const { error } = await supabase
        .from("generated_sites")
        .update({ content: newContent as unknown as Json })
        .eq("id", site.id);
      if (error) throw error;

      setSite({ ...site, content: newContent });
      toast({ title: "Saved", description: "Text content updated." });
    } catch (e) {
      toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSavingText(false);
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
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/sites")}>
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
            <Input value={heroHeadline} onChange={(e) => setHeroHeadline(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Tagline</Label>
            <Input value={tagline} onChange={(e) => setTagline(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>About</Label>
            <Textarea rows={4} value={about} onChange={(e) => setAbout(e.target.value)} />
          </div>

          <div className="space-y-3">
            <Label>Services</Label>
            {services.length === 0 && (
              <p className="text-sm text-muted-foreground">No services on this site.</p>
            )}
            {services.map((s, i) => (
              <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px]">
                  <Input
                    value={s.name}
                    placeholder="Service name"
                    onChange={(e) => updateService(i, "name", e.target.value)}
                  />
                  <Input
                    value={s.price ?? ""}
                    placeholder="Price (optional)"
                    onChange={(e) => updateService(i, "price", e.target.value)}
                  />
                </div>
                <Input
                  value={s.description ?? ""}
                  placeholder="Description (optional)"
                  onChange={(e) => updateService(i, "description", e.target.value)}
                />
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Leave price blank to show "Price on request". Nothing is auto-generated — only what you enter is saved.
            </p>
          </div>

          <Button onClick={handleSaveText} disabled={savingText}>
            {savingText && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save text
          </Button>
        </CardContent>
      </Card>

      {/* Images + logo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Images &amp; logo</CardTitle>
        </CardHeader>
        <CardContent>
          <SiteImageManager
            key={site.id}
            siteId={site.id}
            content={site.content}
            onSaved={(c) => setSite({ ...site, content: c })}
          />
        </CardContent>
      </Card>
    </div>
  );
}
