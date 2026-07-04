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
import { ArrowLeft, Loader2, ExternalLink, Copy, Globe, EyeOff, Trash2, MessageCircle, MessageSquare, Phone, CalendarClock, Check, X, Send } from "lucide-react";
import { SiteEditor } from "@/components/SiteEditor";
import { PushToInstantlyDialog } from "@/components/PushToInstantlyDialog";
import { publicSiteUrl, barberSiteUrl } from "@/config/publicSite";
import { bookingUrl } from "@/lib/subdomain";
import { useTemplates } from "@/hooks/useTemplates";
import { WHATSAPP_TEMPLATES } from "@/types/outreach";
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
  template?: string | null;
};

type LeadInfo = { id: string; phone: string | null; business_name: string; website: string | null; place_id: string | null; status: string | null; previous_status: string | null; whatsapp_sent_at: string | null };

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
  const [converting, setConverting] = useState(false);
  const [isBookingOnly, setIsBookingOnly] = useState(false);

  // Launch pad: the barber's /s/ link + the linked lead (to target its Outreach row).
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [leadInfo, setLeadInfo] = useState<LeadInfo | null>(null);
  const { templates } = useTemplates();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  // Approved WhatsApp template (Meta) used when queueing this barber — distinct
  // from the free-text saved templates above (those drive the SMS/Call composer).
  const [waTemplate, setWaTemplate] = useState<string>(WHATSAPP_TEMPLATES[0].value);
  const [queuingWhatsApp, setQueuingWhatsApp] = useState(false);
  // Push-to-Instantly dialog (campaign picker) — mirrors the Outreach feature.
  const [pushInstantlyOpen, setPushInstantlyOpen] = useState(false);

  // Only the user's saved text templates (voice scripts aren't sent as messages).
  const textTemplates = templates.filter((t) => t.template_type === "text");

  useEffect(() => {
    if (!isAdmin || !id) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("generated_sites")
        .select("id, site_name, status, content, owner_id, template")
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
        .select("share_token, lead_id, booking_only")
        .eq("id", id)
        .maybeSingle();
      const row = tk as { share_token?: string; lead_id?: string; booking_only?: boolean } | null;
      if (row?.share_token) setShareToken(row.share_token);
      setIsBookingOnly(!!row?.booking_only);
      if (row?.lead_id) {
        const { data: lead } = await sb
          .from("outreach_leads")
          .select("id, phone, business_name, website, place_id, status, previous_status, whatsapp_sent_at")
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
  // Booking-only sites live at bookmybarber.uk/<slug> — point Preview/Copy straight
  // there so there's no yoursites.uk → bookmybarber.uk redirect hop.
  const publicUrl = isBookingOnly ? bookingUrl(site.site_name) : publicSiteUrl(site.site_name);

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

  // Convert an existing (full marketing) site to a BOOKING-ONLY page in place. Runs
  // generate-barber-site in booking_only mode for the linked lead; the function
  // updates THIS row (no duplicate) — swapping content to the booking page (using the
  // lead's confirmed services), setting booking_only=true so /p/ and the subdomain
  // redirect to bookmybarber.uk. The full-site marketing content is replaced.
  const handleConvertToBookingOnly = async () => {
    if (!leadInfo) {
      toast({ title: "No lead linked", description: "This site isn't linked to an Outreach lead, so it can't be converted.", variant: "destructive" });
      return;
    }
    if (!window.confirm(
      `Convert "${site.content?.businessName || site.site_name}" to a booking-only page?\n\n` +
      "This replaces the marketing site with the booking page (using the lead's confirmed services). " +
      "Its /p/ and subdomain links will redirect to the bookmybarber.uk booking page. This can't be auto-undone.",
    )) return;
    setConverting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const tmpl = site.template === "salon" ? "salon" : "barber";
      const { data, error } = await supabase.functions.invoke("generate-barber-site", {
        body: { lead_id: leadInfo.id, template: tmpl, mode: "booking_only" },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      if ((data as { error?: string } | null)?.error) throw new Error((data as { error?: string }).error);
      // Refetch the converted row so the editor + status reflect the booking content.
      const { data: fresh } = await supabase
        .from("generated_sites")
        .select("id, site_name, status, content, owner_id, template")
        .eq("id", site.id)
        .maybeSingle();
      if (fresh) setSite(fresh as unknown as SiteRow);
      setIsBookingOnly(true);
      toast({
        title: "Converted to booking-only",
        description: "This is now a booking page — its /p/ and subdomain links redirect to bookmybarber.uk.",
      });
    } catch (e) {
      toast({ title: "Convert failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setConverting(false);
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

  // Add/remove THIS barber's lead from the LIVE WhatsApp outreach queue — mirrors
  // WhatsAppLeadControls.toggleQueue exactly. Already queued → RESTORE the pre-queue
  // status (toggle off; never re-queue, so queued_at/attempts aren't churned). Not
  // queued → write the queue shape (process-whatsapp-queue sends within the daily
  // window): capture previous_status for restore-on-cancel, reset attempts for fresh
  // retries, use an APPROVED template. We deliberately pass NO URL — the queue
  // processor builds the claim link server-side from the lead's own site.
  const toggleWhatsAppQueue = async () => {
    if (!leadInfo) {
      toast({ title: "No lead linked", description: "This site isn't linked to an Outreach lead.", variant: "destructive" });
      return;
    }
    if (leadInfo.status === "no_whatsapp") {
      toast({ title: "Not on WhatsApp", description: "This number can't receive WhatsApp — try SMS or Call.", variant: "destructive" });
      return;
    }
    const queued = leadInfo.status === "queued";
    setQueuingWhatsApp(true);
    try {
      if (queued) {
        // Restore the status the lead had BEFORE queueing (fallback not_contacted).
        const restored = leadInfo.previous_status ?? "not_contacted";
        const { error } = await sb
          .from("outreach_leads")
          .update({ status: restored, previous_status: null, queued_at: null, contact_method: null })
          .eq("id", leadInfo.id);
        if (error) throw error;
        setLeadInfo({ ...leadInfo, status: restored, previous_status: null });
        toast({ title: "Removed from WhatsApp queue" });
      } else {
        const { error } = await sb
          .from("outreach_leads")
          .update({
            status: "queued",
            previous_status: leadInfo.status ?? null, // capture pre-queue status for restore-on-cancel
            queued_at: new Date().toISOString(),
            whatsapp_template: waTemplate,
            whatsapp_attempts: 0, // fresh retries (e.g. re-queuing a whatsapp_failed lead)
            contact_method: "whatsapp", // attribute to WhatsApp immediately (cleared on cancel / permanent fail)
          })
          .eq("id", leadInfo.id);
        if (error) throw error;
        setLeadInfo({ ...leadInfo, status: "queued", previous_status: leadInfo.status ?? null });
        const tmplLabel = WHATSAPP_TEMPLATES.find((t) => t.value === waTemplate)?.label ?? waTemplate;
        toast({
          title: "Added to WhatsApp queue",
          description: `Template: ${tmplLabel}. Sends within the daily 7am–7pm UK window (max 10/day).`,
        });
      }
    } catch (e) {
      toast({ title: "Couldn't update queue", description: (e as Error).message, variant: "destructive" });
    } finally {
      setQueuingWhatsApp(false);
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
              {isBookingOnly && (
                <Badge variant="outline" className="gap-1 border-violet-500/40 text-violet-400">
                  <CalendarClock className="h-3 w-3" /> Booking-only
                </Badge>
              )}
              <span className="font-mono text-xs">{isBookingOnly ? `bookmybarber.uk/${site.site_name}` : `/p/${site.site_name}`}</span>
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
          {!isBookingOnly && (
            <Button variant="outline" size="sm" onClick={handleConvertToBookingOnly} disabled={converting || !leadInfo} title={leadInfo ? 'Convert this site to a booking-only page' : 'No linked lead to convert'}>
              {converting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CalendarClock className="h-4 w-4 mr-2" />}
              Convert to booking-only
            </Button>
          )}
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
      <SiteEditor
        site={site}
        scanContext={leadInfo?.website ? {
          website: leadInfo.website,
          placeId: leadInfo.place_id ?? null,
          businessName: leadInfo.business_name ?? null,
          leadId: leadInfo.id,
        } : undefined}
        onSaved={(content) => setSite({ ...site, content })}
      >
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
              <p className="text-sm font-medium">WhatsApp template <span className="font-normal text-muted-foreground">(approved)</span></p>
              <Select value={waTemplate} onValueChange={setWaTemplate}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WHATSAPP_TEMPLATES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Adds this barber to the live WhatsApp queue with the chosen approved template. The queue builds the claim link from the barber's own site server-side — no link is attached here.
              </p>
            </div>

            {!leadInfo && (
              <p className="text-sm text-muted-foreground">This site isn't linked to an Outreach lead, so it can't launch a composer.</p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => launchOutreach("sms")} disabled={!leadInfo}>
                <MessageCircle className="h-4 w-4 mr-2" /> SMS
              </Button>
              {leadInfo?.whatsapp_sent_at ? (
                // Already sent → read-only line, no queue button (mirrors WhatsAppLeadControls).
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Check className="h-3.5 w-3.5 text-green-500" />
                  Sent {new Date(leadInfo.whatsapp_sent_at).toLocaleDateString()}
                </span>
              ) : (
                <Button
                  size="sm"
                  variant={leadInfo?.status === "queued" ? "outline" : "default"}
                  onClick={toggleWhatsAppQueue}
                  disabled={!leadInfo || queuingWhatsApp || leadInfo.status === "no_whatsapp"}
                  title={leadInfo?.status === "no_whatsapp" ? "This number isn't on WhatsApp" : leadInfo?.status === "queued" ? "Remove from the WhatsApp queue" : "Add to the live WhatsApp queue"}
                >
                  {queuingWhatsApp ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : leadInfo?.status === "queued" ? <X className="h-4 w-4 mr-2" /> : <MessageSquare className="h-4 w-4 mr-2" />}
                  {leadInfo?.status === "queued" ? "Remove from queue" : "Queue WhatsApp"}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => launchOutreach("call")} disabled={!leadInfo}>
                <Phone className="h-4 w-4 mr-2" /> Call
              </Button>
              <Button size="sm" variant="outline" onClick={copyBarberLink} disabled={!barberLink}>
                <Copy className="h-4 w-4 mr-2" /> Copy link
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPushInstantlyOpen(true)}
                disabled={!leadInfo}
                className="text-sky-600 hover:text-sky-600"
                title="Push this lead (if it has an email) into an Instantly.ai email campaign."
              >
                <Send className="h-4 w-4 mr-2" /> Instantly
              </Button>
            </div>
          </CardContent>
        </Card>
      </SiteEditor>

      {/* Push this barber's lead into an Instantly.ai email campaign (mirrors Outreach).
          The dialog + edge function handle no-email / already-pushed / admin scoping. */}
      <PushToInstantlyDialog
        open={pushInstantlyOpen}
        onOpenChange={setPushInstantlyOpen}
        leadIds={leadInfo ? [leadInfo.id] : []}
        onPushed={async () => {
          if (!leadInfo) return;
          const { data: lead } = await sb
            .from("outreach_leads")
            .select("id, phone, business_name, website, place_id, status, previous_status, whatsapp_sent_at")
            .eq("id", leadInfo.id)
            .maybeSingle();
          if (lead) setLeadInfo(lead as unknown as LeadInfo);
        }}
      />
    </div>
  );
}
