import { supabase } from '@/integrations/supabase/client';

/**
 * lead_claims is the team-readable registry of "who is working which business
 * in which campaign". It holds NO sensitive fields — only the claimed/contacted
 * facts plus public business identifiers. All writes are best-effort and
 * non-blocking: a failed claim must never break adding/working a lead.
 */

interface ClaimKey {
  userId: string;
  campaignId: string | null;
  placeId: string | null;
  googleMapsUrl: string | null;
  businessName: string;
}

/** Claim a business on add. Never downgrades an existing claim (ignores dupes). */
export async function recordClaimOnAdd(k: ClaimKey): Promise<void> {
  if (!k.userId) return;
  try {
    await supabase
      .from('lead_claims')
      .upsert(
        {
          user_id: k.userId,
          campaign_id: k.campaignId,
          place_id: k.placeId,
          google_maps_url: k.googleMapsUrl,
          business_name: k.businessName,
          contacted: false,
        },
        { onConflict: 'user_id,campaign_id,place_id', ignoreDuplicates: true }
      );
  } catch (e) {
    console.warn('[claims] recordClaimOnAdd failed (non-blocking):', e);
  }
}

/** Mark the claim contacted (creates one if missing). Idempotent. */
export async function markClaimContacted(k: ClaimKey): Promise<void> {
  if (!k.userId) return;
  try {
    await supabase
      .from('lead_claims')
      .upsert(
        {
          user_id: k.userId,
          campaign_id: k.campaignId,
          place_id: k.placeId,
          google_maps_url: k.googleMapsUrl,
          business_name: k.businessName,
          contacted: true,
        },
        { onConflict: 'user_id,campaign_id,place_id' }
      );
  } catch (e) {
    console.warn('[claims] markClaimContacted failed (non-blocking):', e);
  }
}
