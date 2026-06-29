import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SiteContent } from "@/templates/shared/content";
import { getTemplateDef, normaliseTemplate, DEFAULT_TEMPLATE_KEY } from "@/templates/registry";
import { STOCK_HERO } from "@/templates/barber/assets";
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
import "@/templates/barber/fonts.css";

// Untyped client: share_token + tracking columns aren't in the generated types
// yet (added by the Phase 1 migration). RLS still applies. Mirrors PublicSite.
const sb = supabase as unknown as SupabaseClient;

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Claim-preview for a BOOKING-ONLY row on /s/:token. Renders the same lean,
 * branded booking layout the live page uses (header + services/hours/contact) so a
 * barber claiming a booking-only page sees their actual product — NOT the bare,
 * half-empty marketing template. The claim CTA stays the ColourEditDock below
 * (unchanged); the hero stays photo-swappable via onEditImage. No live BookingFlow
 * here (booking goes live once published) — the Book button is a visual preview.
 */
function BookingClaimPreview({
  content,
  onEditImage,
}: {
  content: SiteContent;
  onEditImage?: (slot: BarberImageSlot) => void;
}) {
  const accent = content.accentColor && HEX_RE.test(content.accentColor) ? content.accentColor : "#E6A24B";
  const businessName = content.businessName ?? "";
  const services = (content.services ?? []).filter((s) => (s.name ?? "").trim());
  const hours = content.hours ?? [];
  const telHref = content.phone ? `tel:${content.phone.replace(/[^\d+]/g, "")}` : "";
  return (
    <div className="min-h-screen bg-ink font-body text-zinc-200">
      <header className="relative isolate flex min-h-[34vh] flex-col items-center justify-center overflow-hidden px-6 py-12 text-center">
        {/* Real hero, or the bundled stock barber image — never a black background. */}
        <img src={content.heroImageUrl || STOCK_HERO} alt={businessName} className="absolute inset-0 -z-10 h-full w-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/80 to-ink/40" />
        {onEditImage && (
          <button
            type="button"
            onClick={() => onEditImage("hero")}
            className="absolute right-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-black/55 px-3.5 py-1.5 text-xs font-semibold text-white backdrop-blur-sm hover:bg-black/75"
          >
            Change photo
          </button>
        )}
        {content.logoUrl && <img src={content.logoUrl} alt={businessName} className="mb-4 h-14 w-auto object-contain" />}
        <h1 className="font-display text-4xl uppercase tracking-wide text-white drop-shadow-[0_2px_20px_rgba(0,0,0,0.5)] sm:text-5xl">{businessName}</h1>
        <p className="mt-3 text-sm text-zinc-300">Book your appointment online</p>
        <span
          className="mt-7 inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-base font-bold text-ink shadow-lg"
          style={{ backgroundColor: accent }}
        >
          Book appointment
        </span>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
        <div className="grid gap-8 md:grid-cols-2">
          {services.length > 0 && (
            <section className="flex flex-col">
              <h2 className="font-display text-2xl uppercase tracking-wide text-white">Services</h2>
              <ul className="mt-4 flex-1 divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                {services.map((s, i) => (
                  <li key={`${s.name}-${i}`} className="flex items-baseline justify-between gap-3 px-4 py-3.5">
                    <div className="min-w-0">
                      <div className="font-semibold text-white">{s.name}</div>
                      {typeof s.durationMins === "number" && s.durationMins > 0 && (
                        <div className="text-xs uppercase tracking-wide text-zinc-500">{s.durationMins} min</div>
                      )}
                    </div>
                    {s.price && <span className="shrink-0 font-display text-xl tracking-wide" style={{ color: accent }}>{s.price}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {hours.length > 0 && (
            <section className="flex flex-col">
              <h2 className="font-display text-2xl uppercase tracking-wide text-white">Opening hours</h2>
              <ul className="mt-4 flex-1 overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                {hours.map((h, i) => (
                  <li key={`${h.day}-${i}`} className="flex items-center justify-between gap-4 border-b border-white/[0.05] px-4 py-3 last:border-b-0">
                    <span className="text-sm font-medium text-zinc-200">{h.day}</span>
                    <span className={`text-sm tabular-nums ${/closed/i.test(h.open) ? "text-zinc-500" : "text-zinc-300"}`}>{h.open}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        {(content.phone || content.address) && (
          <section className="mx-auto flex max-w-xl flex-col items-center gap-1 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-center text-sm">
            {content.phone && <a href={telHref} className="font-semibold text-white hover:text-amber-soft">{content.phone}</a>}
            {content.address && <div className="text-zinc-400">{content.address}</div>}
          </section>
        )}
      </main>
    </div>
  );
}

interface SiteRow {
  id: string;
  site_name: string;
  content: SiteContent | null;
  template: string;
  claimed_at: string | null;
  addon_interest_at: string | null;
  booking_only: boolean;
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

  // Pre-sign-in image cap: a barber may personalise up to 3 DISTINCT photos
  // (slots) before they have to make an account. Colour changes are unmetered —
  // only photos count. The count is simply the number of distinct slots that
  // currently hold a swap (the keys of imgPreviews: hero, about, + future
  // gallery-N). Re-swapping a slot already chosen is FREE (same photo position);
  // it's reaching for a NEW, 4th slot that triggers the redirect.
  const PRE_SIGNIN_IMAGE_CAP = 3;

  const handleEditImage = (slot: BarberImageSlot) => {
    const alreadySwapped = slot in imgPreviews;
    if (!alreadySwapped && Object.keys(imgPreviews).length >= PRE_SIGNIN_IMAGE_CAP) {
      // 4th distinct photo → don't open the picker; send them to make an account.
      // Framed as the natural next step, not a blocked action.
      toast({
        title: "Create an account to add more",
        description:
          "You've personalised 3 photos — make a free account to keep customising and save your site.",
      });
      beginClaim("more-photos");
      return;
    }
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

  // Bottom "Keep this site" button / hitting the image cap → mint a one-time claim
  // link from the share_token (begin-claim) and hand off to the EXISTING /claim
  // account-creation flow. `reason` lets /claim tailor its copy (e.g. the barber
  // arrived because they hit the 3-photo cap).
  const beginClaim = async (reason?: "more-photos") => {
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
        navigate(data.claim_path, { state: { fromShare: true, reason } });
        return;
      }
      throw new Error("no_claim_path");
    } catch {
      toast({ title: "Couldn't continue", description: "Please try again, or contact Paul.", variant: "destructive" });
      setClaiming(false);
    }
  };

  // Param-less wrapper for click handlers (the dock / template pass a MouseEvent,
  // which must NOT be forwarded as `reason`).
  const handleClaim = () => beginClaim();

  const { data, isLoading } = useQuery({
    queryKey: ["site-by-token", token],
    enabled: !!token,
    queryFn: async (): Promise<SiteRow | null> => {
      const { data, error } = await sb
        .from("generated_sites")
        .select("id, site_name, content, template, claimed_at, addon_interest_at, booking_only")
        .eq("share_token", token)
        .maybeSingle();
      if (error || !data) return null;
      const row = data as { id: string; site_name: string; content: unknown; template: unknown; claimed_at: string | null; addon_interest_at: string | null; booking_only: boolean | null };
      return {
        id: row.id,
        site_name: row.site_name,
        content: (row.content as SiteContent) ?? null,
        template: normaliseTemplate(row.template),
        claimed_at: row.claimed_at,
        addon_interest_at: row.addon_interest_at,
        booking_only: !!row.booking_only,
      };
    },
  });

  const content = data?.content ?? null;
  const template = data?.template ?? DEFAULT_TEMPLATE_KEY;
  const def = getTemplateDef(template);
  const businessName = content?.businessName ?? "";

  // Null while loading → keep the per-barber title the /s/ edge function set in the
  // served HTML; set the real title only once data is in (no fallback flash).
  useSiteBranding(isLoading ? null : (businessName || def.brandFallbackLabel), template);

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

  // Gallery previews: patch swapped indices into a copy of the real gallery so the
  // mosaic shows the new photo instantly (index maps to content.galleryImageUrls).
  const baseGallery = (content as unknown as { galleryImageUrls?: string[] }).galleryImageUrls;
  let galleryOverride: string[] | undefined;
  if (Array.isArray(baseGallery)) {
    for (const [key, url] of Object.entries(imgPreviews)) {
      if (!key.startsWith("gallery-") || !url) continue;
      const idx = Number(key.slice("gallery-".length));
      if (Number.isInteger(idx) && idx >= 0 && idx < baseGallery.length) {
        if (!galleryOverride) galleryOverride = [...baseGallery];
        galleryOverride[idx] = url;
      }
    }
  }

  // Apply the chosen accent + any swapped photos client-side so the site
  // re-renders instantly. The template is a pure function of content, so
  // overriding these fields recolours / re-photographs it with no round-trip.
  const liveContent = {
    ...content,
    ...(accent ? { accentColor: accent } : {}),
    ...(imgPreviews.hero ? { heroImageUrl: imgPreviews.hero } : {}),
    ...(imgPreviews.about ? { aboutImageUrl: imgPreviews.about } : {}),
    ...(galleryOverride ? { galleryImageUrls: galleryOverride } : {}),
  } as SiteContent;

  return (
    <>
      {/* On /s/ the template claim bar is replaced by the ColourEditDock below
          (edit + keep in one place). Preview mode shows the clean site, no dock
          and no photo-edit affordances. */}
      {data.booking_only ? (
        <BookingClaimPreview
          content={liveContent}
          onEditImage={isPreview ? undefined : handleEditImage}
        />
      ) : (
        <Template
          content={liveContent}
          bookingEnabled={false}
          onClaim={handleClaim}
          showClaimBar={false}
          onEditImage={isPreview ? undefined : handleEditImage}
        />
      )}
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
        bookingOnly={!!data?.booking_only}
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
