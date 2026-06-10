import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, ExternalLink, Copy, Globe, EyeOff, Trash2, Link2, CheckCircle2 } from "lucide-react";
import { SiteEditor } from "@/components/SiteEditor";
import type { BarberSiteContent } from "@/templates/barber/types";

/**
 * Admin-only Manage Site page for a single generated barber site.
 *
 * The editable form (text + services/prices + images/logo + Save) now lives in
 * the reusable <SiteEditor>; this page keeps the admin-only surroundings: header
 * (preview/copy/publish/delete) and the "Barber access" claim-link card.
 * All writes go through admin-gated RLS; the isAdmin check here is UX only.
 */
type SiteRow = {
  id: string;
  site_name: string;
  status: string;
  content: BarberSiteContent;
  owner_id: string | null;
};

export default function AdminSiteManage() {
  const { id } = useParams();
  const { isAdmin, isLoading: roleLoading } = useSubscription();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [site, setSite] = useState<SiteRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [savingStatus, setSavingStatus] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [claimLink, setClaimLink] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);

  useEffect(() => {
    if (!isAdmin || !id) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("generated_sites")
        .select("id, site_name, status, content, owner_id")
        .eq("id", id)
        .maybeSingle();
      if (error || !data) {
        setNotFound(true);
      } else {
        setSite(data as unknown as SiteRow);
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
  // Missing/deleted site (e.g. browser-back to a deleted row) → bounce to the
  // live Sites list instead of a dead-end, and replace it in history.
  if (notFound || !site) {
    return <Navigate to="/admin/sites" replace />;
  }

  const isPublished = site.status === "published";
  const publicUrl = `${window.location.origin}/p/${site.site_name}`;

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

  const handleGenerateClaimLink = async () => {
    setGeneratingLink(true);
    setClaimLink(null);
    try {
      const { data, error } = await supabase.functions.invoke("create-claim-link", {
        body: { site_id: site.id },
      });
      if (error) throw new Error("Couldn't reach the server. Please try again.");
      if (data?.error) {
        throw new Error(
          data.error === "already_claimed"
            ? "This site has already been claimed by a barber."
            : "Couldn't create a claim link.",
        );
      }
      // Send the share-shim URL so social previews show barber branding (not
      // LeadFinder); fall back to the raw claim path only if it's missing.
      setClaimLink(data.share_url || `${window.location.origin}${data.claim_path}`);
    } catch (e) {
      toast({ title: "Claim link failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setGeneratingLink(false);
    }
  };

  const copyClaimLink = async () => {
    if (!claimLink) return;
    try {
      await navigator.clipboard.writeText(claimLink);
      toast({ title: "Claim link copied" });
    } catch {
      toast({ title: "Copy failed", description: claimLink, variant: "destructive" });
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

      {/* Editable form + images + save bar (shared with the barber dashboard).
          The admin-only "Barber access" card is slotted between images and save. */}
      <SiteEditor site={site} onSaved={(content) => setSite({ ...site, content })}>
        {/* Barber access — generate the private claim link to send the barber */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Barber access</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {site.owner_id ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                This site has been claimed by a barber. They manage it from their own dashboard.
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Generate a private, single-use link (valid 7 days) and send it to the barber.
                  They create their own account on that page and become the owner of this one site.
                </p>
                <Button variant="outline" size="sm" onClick={handleGenerateClaimLink} disabled={generatingLink}>
                  {generatingLink ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />}
                  {claimLink ? "Generate a new link" : "Generate claim link"}
                </Button>

                {claimLink && (
                  <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                      Copy this link now — it won't be shown again. Generating a new link invalidates this one.
                    </p>
                    <div className="flex items-center gap-2">
                      <Input readOnly value={claimLink} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
                      <Button variant="outline" size="icon" title="Copy claim link" onClick={copyClaimLink}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </SiteEditor>
    </div>
  );
}
