import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, ExternalLink, Copy, Globe, EyeOff, Trash2, MessageCircle, MessageSquare, Phone } from "lucide-react";
import { SiteEditor } from "@/components/SiteEditor";
import { publicSiteUrl, barberSiteUrl } from "@/config/publicSite";
import { useTemplates } from "@/hooks/useTemplates";
import type { BarberSiteContent } from "@/templates/barber/types";

/**
 * Admin-only Manage Site page for a single generated barber site.
 *
 * The editable form (text + services/prices + images/logo + Save) now lives in
 * the reusable <SiteEditor>; this page keeps the admin-only surroundings: header
 * (preview/copy/publish/delete) and the "Barber access" claim-link card.
 * All writes go through admin-gated RLS; the isAdmin check here is UX only.
 */
// Untyped client for the Phase 1 columns/table not in the generated types yet
// (share_token, sent_at…, site_events). RLS still applies. Mirrors PublicSite.
const sb = supabase as unknown as SupabaseClient;

type SiteRow = {
  id: string;
  site_name: string;
  status: string;
  content: BarberSiteContent;
  owner_id: string | null;
};

type LeadInfo = { id: string; phone: string | null; business_name: string };

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

  // Launch pad: the barber's /s/ link + the linked lead (to target its Outreach row).
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [leadInfo, setLeadInfo] = useState<LeadInfo | null>(null);
  const { templates } = useTemplates();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  // Only the user's saved text templates (voice scripts aren't sent as messages).
  const textTemplates = templates.filter((t) => t.template_type === "text");

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
        setLoading(false);
        return;
      }
      setSite(data as unknown as SiteRow);
      setLoading(false);

      // Share token (the /s/ link) + the linked lead — never block the page on these.
      const { data: tk } = await sb
        .from("generated_sites")
        .select("share_token, lead_id")
        .eq("id", id)
        .maybeSingle();
      const row = tk as { share_token?: string; lead_id?: string } | null;
      if (row?.share_token) setShareToken(row.share_token);
      if (row?.lead_id) {
        const { data: lead } = await sb
          .from("outreach_leads")
          .select("id, phone, business_name")
          .eq("id", row.lead_id)
          .maybeSingle();
        if (lead) setLeadInfo(lead as unknown as LeadInfo);
      }
    })();
  }, [isAdmin, id]);

  // Default the template selector to the first saved text template.
  useEffect(() => {
    if (!selectedTemplateId && textTemplates.length > 0) {
      setSelectedTemplateId(textTemplates[0].id);
    }
  }, [textTemplates, selectedTemplateId]);

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
  const publicUrl = publicSiteUrl(site.site_name);

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

  // ── Launch pad: the barber's /s/ link + jump-to-Outreach composer ──
  const barberLink = shareToken ? barberSiteUrl(shareToken) : null;
  const selectedTemplate = textTemplates.find((t) => t.id === selectedTemplateId) || null;

  const copyBarberLink = async () => {
    if (!barberLink) return;
    try {
      await navigator.clipboard.writeText(barberLink);
      toast({ title: "Barber link copied", description: barberLink });
    } catch {
      toast({ title: "Copy failed", description: barberLink, variant: "destructive" });
    }
  };

  // Jump to the Outreach page (single source of truth) with THIS barber's row +
  // composer open, the chosen template pre-filled, and the /s/ link carried in.
  const launchOutreach = (channel: "sms" | "whatsapp" | "call") => {
    if (!leadInfo) {
      toast({ title: "No lead linked", description: "This site isn't linked to an Outreach lead.", variant: "destructive" });
      return;
    }
    navigate("/outreach", {
      state: {
        launch: {
          leadId: leadInfo.id,
          channel,
          templateContent: selectedTemplate?.content ?? null,
          shareLink: barberLink,
        },
      },
    });
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
        {/* Launch pad — send this barber's link via the Outreach page (the single
            source of truth for all tracking). No duplicate stats live here. */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Contact this barber</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Barber site link <span className="font-normal text-muted-foreground">(unguessable, re-openable)</span></p>
              <div className="flex items-center gap-2">
                <Input readOnly value={barberLink ?? ""} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
                <Button variant="outline" size="icon" title="Copy barber link" onClick={copyBarberLink} disabled={!barberLink}>
                  <Copy className="h-4 w-4" />
                </Button>
                {barberLink && (
                  <a href={barberLink} target="_blank" rel="noreferrer">
                    <Button variant="outline" size="icon" title="Open"><ExternalLink className="h-4 w-4" /></Button>
                  </a>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium">Template</p>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder={textTemplates.length ? "Choose a saved template" : "No saved templates"} />
                </SelectTrigger>
                <SelectContent>
                  {textTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Opens the Outreach composer with this template, the business name and the link above auto-filled.
              </p>
            </div>

            {!leadInfo && (
              <p className="text-sm text-muted-foreground">This site isn't linked to an Outreach lead, so it can't launch a composer.</p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => launchOutreach("sms")} disabled={!leadInfo}>
                <MessageCircle className="h-4 w-4 mr-2" /> SMS
              </Button>
              <Button size="sm" onClick={() => launchOutreach("whatsapp")} disabled={!leadInfo}>
                <MessageSquare className="h-4 w-4 mr-2" /> WhatsApp
              </Button>
              <Button size="sm" variant="outline" onClick={() => launchOutreach("call")} disabled={!leadInfo}>
                <Phone className="h-4 w-4 mr-2" /> Call
              </Button>
              <Button size="sm" variant="outline" onClick={copyBarberLink} disabled={!barberLink}>
                <Copy className="h-4 w-4 mr-2" /> Copy link
              </Button>
            </div>
          </CardContent>
        </Card>
      </SiteEditor>
    </div>
  );
}
