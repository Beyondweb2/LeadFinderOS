import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SiteContent } from "@/templates/shared/content";
import { getTemplateDef, normaliseTemplate, DEFAULT_TEMPLATE_KEY } from "@/templates/registry";
import { useSiteBranding } from "@/hooks/useSiteBranding";
import { useToast } from "@/hooks/use-toast";
import { IntroPopup } from "@/components/site/IntroPopup";
import { ColourEditDock } from "@/components/site/ColourEditDock";
import {
  readPendingBarberEdit,
  writePendingBarberEdit,
  clearPendingBarberEdit,
  setPendingBarberImage,
  validateBarberImage,
  type BarberImageSlot,
} from "@/lib/barberEdits";
import { recordSiteEvent } from "@/lib/siteTracking";

// Untyped client: share_token + tracking columns aren't in the generated types
// yet (added by the Phase 1 migration). RLS still applies. Mirrors PublicSite.
const sb = supabase as unknown as SupabaseClient;

interface SiteRow {
  id: string;
  site_name: string;
  content: SiteContent | null;
  template: string;
  claimed_at: string | null;
  addon_interest_at: string | null;
}

/**
 * /s/:token - the barber's own site link. Unguessable, permanent, re-openable
 * forever (viewing is unlimited). Renders their real site with a claim popup;
 * only the CLAIM is one-time. Records an `open` event on load, and claim /
 * add-on-interest events from the popup (all via record-site-event, keyed by the
 * share token). Booking is shown as a preview (disabled) - this is the barber's
 * claim view, not their live customer booking page.
 */
export default function SiteByToken() {
  const { token = "" } = useParams();
  const [searchParams] = useSearchParams();
  // Operator preview (?preview=1): view-only. Skips the `open` tracking event and
  // hides the claim splash. The barber NEVER gets this param, so their normal link
  // is byte-for-byte unchanged.
  const isPreview = searchParams.get("preview") === "1";
  const navigate = useNavigate();
  const { toast } = useToast();
  const [popupOpen, setPopupOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const openedRef = useRef(false);
  const autoOpenedRef = useRef(false);

  // Pre-sign-in colour edit (Phase 2). Held in the browser; applied on claim.
  const [accent, setAccent] = useState<string | null>(() => readPendingBarberEdit().accentColor ?? null);
  const handleAccent = (hex: string | null) => {
    setAccent(hex);
    if (hex) writePendingBarberEdit({ accentColor: hex });
    else clearPendingBarberEdit();
  };

  // Pre-sign-in photo swap (Phase 3). The File is held in a module singleton
  // (uploaded on claim); here we keep an object-URL per slot purely for the live
  // preview, and override the rendered content so the swap shows instantly.
  const [imgPreviews, setImgPreviews] = useState<Partial<Record<BarberImageSlot, string>>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const editingSlotRef = useRef<BarberImageSlot | null>(null);

  const handleEditImage = (slot: BarberImageSlot) => {
    editingSlotRef.current = slot;
    // Reset value so re-picking the SAME file still fires onChange.
    if (fileInputRef.current) fileInputRef.current.value = "";
    fileInputRef.current?.click();
  };

  const handlePickImage = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const slot = editingSlotRef.current;
    if (!file || !slot) return;
    const err = validateBarberImage(file);
    if (err) {
      toast({ title: "Couldn't use that photo", description: err, variant: "destructive" });
      return;
    }
    setPendingBarberImage(slot, file);
    const url = URL.createObjectURL(file);
    setImgPreviews((prev) => {
      if (prev[slot]) URL.revokeObjectURL(prev[slot]!); // free the old preview
      return { ...prev, [slot]: url };
    });
  };

  // Bottom "Claim for free" bar → mint a one-time claim link from the share_token
  // (begin-claim) and hand off to the EXISTING /claim account-creation flow.
  const handleClaim = async () => {
    if (claiming) return;
    setClaiming(true);
    try {
      const { data, error } = await supabase.functions.invoke("begin-claim", {
        body: { share_token: token },
      });
      if (error) throw error;
      if (data?.already_claimed) {
        toast({ title: "Already set up", description: "This website has already been set up - log in to manage it." });
        navigate("/barber-login");
        return;
      }
      if (data?.ok && data?.claim_path) {
        // Skip the redundant site-preview step on /claim: the barber has already
        // seen + browsed their site here on /s/, so land them straight on the
        // claim/account form. URL stays the clean /claim/<token>.
        navigate(data.claim_path, { state: { fromShare: true } });
        return;
      }
      throw new Error("no_claim_path");
    } catch {
      toast({ title: "Couldn't continue", description: "Please try again, or contact Paul.", variant: "destructive" });
      setClaiming(false);
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["site-by-token", token],
    enabled: !!token,
    queryFn: async (): Promise<SiteRow | null> => {
      const { data, error } = await sb
        .from("generated_sites")
        .select("id, site_name, content, template, claimed_at, addon_interest_at")
        .eq("share_token", token)
        .maybeSingle();
      if (error || !data) return null;
      const row = data as { id: string; site_name: string; content: unknown; template: unknown; claimed_at: string | null; addon_interest_at: string | null };
      return {
        id: row.id,
        site_name: row.site_name,
        content: (row.content as SiteContent) ?? null,
        template: normaliseTemplate(row.template),
        claimed_at: row.claimed_at,
        addon_interest_at: row.addon_interest_at,
      };
    },
  });

  const content = data?.content ?? null;
  const template = data?.template ?? DEFAULT_TEMPLATE_KEY;
  const def = getTemplateDef(template);
  const businessName = content?.businessName ?? "";

  useSiteBranding(businessName || def.brandFallbackLabel, template);

  // Record exactly one `open` per page load, once the site resolves.
  // In preview mode we record NOTHING — operator views must not inflate Opened.
  useEffect(() => {
    if (isPreview) return;
    if (data && !openedRef.current) {
      openedRef.current = true;
      recordSiteEvent(token, "open");
    }
  }, [data, token, isPreview]);

  // Auto-open the claim popup once, so the offer is front-and-centre on arrival.
  // Suppressed in preview mode (operator wants the clean site, no claim splash).
  useEffect(() => {
    if (isPreview) return;
    if (data && content && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      const t = setTimeout(() => setPopupOpen(true), 600);
      return () => clearTimeout(t);
    }
  }, [data, content, isPreview]);

  if (isLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${def.loadingBgClass}`}>
        <Loader2 className={`h-8 w-8 animate-spin ${def.loadingSpinnerClass}`} />
      </div>
    );
  }

  // Invalid / unpublished token → don't leak anything, no demo content.
  if (!data || !content) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-2 bg-ink px-6 text-center">
        <h1 className="text-xl font-bold text-white">Link unavailable</h1>
        <p className="max-w-sm text-sm text-zinc-400">
          This site link isn't available. Please check the link or ask for a fresh one.
        </p>
      </div>
    );
  }

  const Template = def.Component;

  // Apply the chosen accent + any swapped photos client-side so the site
  // re-renders instantly. The template is a pure function of content, so
  // overriding these fields recolours / re-photographs it with no round-trip.
  const liveContent = {
    ...content,
    ...(accent ? { accentColor: accent } : {}),
    ...(imgPreviews.hero ? { heroImageUrl: imgPreviews.hero } : {}),
    ...(imgPreviews.about ? { aboutImageUrl: imgPreviews.about } : {}),
  } as SiteContent;

  return (
    <>
      {/* On /s/ the template claim bar is replaced by the ColourEditDock below
          (edit + keep in one place). Preview mode shows the clean site, no dock
          and no photo-edit affordances. */}
      <Template
        content={liveContent}
        bookingEnabled={false}
        onClaim={handleClaim}
        showClaimBar={false}
        onEditImage={isPreview ? undefined : handleEditImage}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handlePickImage}
      />
      <IntroPopup
        open={popupOpen}
        onOpenChange={setPopupOpen}
        businessName={businessName || "your business"}
      />
      {!isPreview && !popupOpen && (
        <ColourEditDock value={accent} onChange={handleAccent} onKeep={handleClaim} keeping={claiming} />
      )}
      {isPreview && (
        <div className="fixed top-3 right-3 z-[70] rounded-full border border-white/15 bg-black/70 px-3 py-1 text-[11px] font-medium text-white shadow-lg backdrop-blur-sm">
          Preview · not tracked
        </div>
      )}
      {claiming && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/70 backdrop-blur-sm">
          <Loader2 className="h-8 w-8 animate-spin text-amber" />
        </div>
      )}
    </>
  );
}
