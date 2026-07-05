import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { OutreachLead } from '@/types/outreach';

/**
 * Per-lead COMBINED enrichment (sub-phase 2A): one click gathers contacts
 * (email/FB/IG), the WhatsApp-capability signal (HLR line-type), and an image
 * pool — via the enrich-business edge function. Surfaces what it found; contacts
 * are only auto-applied when the match is high-confidence (the function decides),
 * and a low-confidence match is flagged for the operator to verify (never silently
 * attaches wrong-company data).
 */
export function useEnrichBusiness(
  lead: OutreachLead,
  onUpdate: (leadId: string, data: Partial<OutreachLead>) => Promise<unknown>,
) {
  const [enriching, setEnriching] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const { toast } = useToast();

  const enrich = async () => {
    setEnriching(true);
    try {
      const { data, error } = await supabase.functions.invoke('enrich-business', {
        body: {
          lead_id: lead.id,
          place_id: lead.place_id ?? null,
          google_maps_url: lead.google_maps_url ?? null,
          phone: lead.phone ?? null,
          country: lead.country ?? null,
          business_name: lead.business_name ?? null,
          facebook_url: lead.facebook_url ?? null,
          instagram_url: lead.instagram_url ?? null,
          website: lead.website ?? null,
        },
      });
      if (error) throw error;
      if (data?.limit_reached) {
        setLimitReached(true);
        toast({ title: 'Daily enrichment limit reached', description: 'Try again tomorrow.', variant: 'destructive' });
        return data;
      }
      if (!data?.success) {
        toast({ title: 'Enrich failed', description: data?.error ?? 'Please try again.', variant: 'destructive' });
        return data;
      }

      const now = new Date().toISOString();
      const patch: Partial<OutreachLead> = {};
      if (data.lineType) { patch.line_type = data.lineType; patch.line_type_checked_at = now; }
      // Website: stored server-side when the lead had none; mirror it locally so the
      // 🌐 link shows immediately.
      if (data.website && !lead.website) patch.website = data.website;
      if (data.applied) {
        if (data.email) Object.assign(patch, { email: data.email, email_status: 'found', email_method: 'apify', enrichment_source: 'apify' });
        if (data.facebook) Object.assign(patch, { facebook_url: data.facebook, facebook_status: 'found', facebook_method: data.facebookMethod ?? 'apify' });
        if (data.instagram) Object.assign(patch, { instagram_url: data.instagram, instagram_status: 'found', instagram_method: data.instagramMethod ?? 'apify' });
      }
      if (Object.keys(patch).length) await onUpdate(lead.id, patch);

      // A possible FB/IG that wasn't auto-attached — surface it for the operator to
      // verify + paste via 🔗. Reason tells them WHY (name vs location mismatch).
      const suggestionWhy = (reason?: string) =>
        reason === 'name_mismatch'
          ? "its name doesn't clearly match this business"
          : "its location doesn't match this lead";
      if (data.facebookSuggestion?.url) {
        toast({
          title: '⚠ Possible Facebook — verify',
          description: `Found ${data.facebookSuggestion.url} but ${suggestionWhy(data.facebookSuggestion.reason)}. Check it, then paste via the 🔗 button if it's right.`,
        });
      }
      if (data.instagramSuggestion?.url) {
        toast({
          title: '⚠ Possible Instagram — verify',
          description: `Found ${data.instagramSuggestion.url} but ${suggestionWhy(data.instagramSuggestion.reason)}. Check it, then paste via the 🔗 button if it's right.`,
        });
      }

      const poolN = Array.isArray(data.imagePool) ? data.imagePool.length : 0;
      const b = data.poolBreakdown ?? { maps: 0, facebook: 0, instagram: 0 };
      const photos = `${poolN} photos (Maps ${b.maps} / FB ${b.facebook} / IG ${b.instagram})`;
      const found = [data.email && 'email', data.facebook && 'FB', data.instagram && 'IG'].filter(Boolean).join(', ');
      const lt = data.lineType && data.lineType !== 'unknown' ? ` · ${data.lineType}` : '';
      if (data.match?.lowConfidence) {
        toast({
          title: '⚠ Verify this is the right business',
          description: `Matched "${data.match.title ?? '—'}"${data.match.address ? ` · ${data.match.address}` : ''}. Contacts NOT auto-applied${lt}. ${photos}.`,
        });
      } else {
        toast({ title: 'Business enriched', description: `${found || 'no contacts found'}${lt} · ${photos}.` });
      }
      return data;
    } catch (e) {
      toast({ title: 'Enrich failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setEnriching(false);
    }
  };

  return { enrich, enriching, limitReached };
}

/** What the socials-focused, on-demand enrich returns to a caller (the site editor's
 *  "Enrich socials" button). `facebook`/`instagram` are the values the cascade actually
 *  ATTACHED (location-matched / Maps-listing / name-gated) — never the unconfirmed
 *  *Suggestion values, which are surfaced separately for the operator to eyeball. */
export interface EnrichSocialsResult {
  facebook: string | null;
  instagram: string | null;
  facebookMethod: string | null;
  instagramMethod: string | null;
  facebookSuggestion: { url: string; reason: string } | null;
  instagramSuggestion: { url: string; reason: string } | null;
  limitReached?: boolean;
}

/**
 * Thin, lead-identity-only caller of enrich-business with `force:true` — runs FRESH
 * FULL web-results social discovery (bypasses both caches server-side) and RETURNS the
 * discovered socials. Distinct from useEnrichBusiness (which is lead-centric: writes the
 * lead + toasts). Used by the site editor, which only has lead identifiers, not a full
 * OutreachLead, and wants the returned values to fill the SITE content fields.
 */
export async function enrichSocials(params: {
  leadId: string;
  placeId?: string | null;
  googleMapsUrl?: string | null;
  businessName?: string | null;
}): Promise<EnrichSocialsResult> {
  const { data, error } = await supabase.functions.invoke('enrich-business', {
    body: {
      lead_id: params.leadId,
      place_id: params.placeId ?? null,
      google_maps_url: params.googleMapsUrl ?? null,
      business_name: params.businessName ?? null,
      force: true, // fresh full web-results discovery (server bypasses both caches)
    },
  });
  if (error) throw error;
  if (data?.limit_reached) {
    return {
      facebook: null, instagram: null, facebookMethod: null, instagramMethod: null,
      facebookSuggestion: null, instagramSuggestion: null, limitReached: true,
    };
  }
  if (!data?.success) throw new Error(data?.error ?? 'Enrich failed');
  return {
    facebook: data.facebook ?? null,
    instagram: data.instagram ?? null,
    facebookMethod: data.facebookMethod ?? null,
    instagramMethod: data.instagramMethod ?? null,
    facebookSuggestion: data.facebookSuggestion ?? null,
    instagramSuggestion: data.instagramSuggestion ?? null,
  };
}

/** What the on-demand IG-images pull returns to the site editor's "Add Instagram
 *  photos" button. `photos` are IG post image URLs (expiring CDN links — re-hosted
 *  only when the operator drags one into a slot and saves). Best-effort: IG scraping
 *  is flaky, so `photos: []` with `igFound:true` means "profile found, no images
 *  this time", and `igFound:false` means "no Instagram profile resolved". */
export interface InstagramPhotosResult {
  photos: string[];
  igFound: boolean;
  instagramUrl: string | null;
  limitReached?: boolean;
}

/**
 * Thin caller of enrich-business in `ig_images_only` mode: resolves the lead's IG
 * profile (stored `instagram_url` if any, else fresh discovery) and scrapes ONLY its
 * post images — no Maps/FB scrape. Named to avoid clashing with the edge-side
 * fetchInstagramPhotos (in _shared/enrichment/socialImages.ts). Used by the site
 * editor to merge IG images into content.imagePool.
 */
export async function fetchInstagramPhotos(params: {
  leadId: string;
  placeId?: string | null;
  instagramUrl?: string | null;
}): Promise<InstagramPhotosResult> {
  const { data, error } = await supabase.functions.invoke('enrich-business', {
    body: {
      lead_id: params.leadId,
      place_id: params.placeId ?? null,
      // Pass the known IG URL so the edge can scrape it directly (skips discovery).
      instagram_url: params.instagramUrl ?? null,
      ig_images_only: true, // IG-only scrape; implies force (fresh, cache-bypassing)
    },
  });
  if (error) throw error;
  if (data?.limit_reached) {
    return { photos: [], igFound: false, instagramUrl: null, limitReached: true };
  }
  if (!data?.success) throw new Error(data?.error ?? 'Instagram enrich failed');
  return {
    photos: Array.isArray(data.instagramPhotos) ? data.instagramPhotos.filter((u: unknown) => typeof u === 'string') : [],
    igFound: !!data.igFound,
    instagramUrl: data.instagramUrl ?? null,
  };
}
