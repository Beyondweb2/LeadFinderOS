import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Lead } from '@/types/lead';

export interface TeamClaim {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  contacted: boolean;
}

/**
 * For the currently shown search results, find which businesses a TEAMMATE has
 * already claimed in ANY campaign, and resolve the claimant's profile
 * (name + avatar). Matches by place_id, falling back to google_maps_url.
 *
 * - GLOBAL scope: any teammate claim on the business counts (any campaign), so
 *   reps never double-contact a barber anyone has already added.
 * - Excludes the current user's own claims (no self-warnings).
 * - Reads only the team-readable lead_claims + profiles tables.
 */
export function useTeamClaims(leads: Lead[], campaignId: string | null) {
  const { user } = useAuth();
  const [byKey, setByKey] = useState<Record<string, TeamClaim>>({});

  useEffect(() => {
    if (!user?.id || leads.length === 0) {
      setByKey({});
      return;
    }
    let cancelled = false;

    (async () => {
      let query = supabase
        .from('lead_claims')
        .select('place_id, google_maps_url, user_id, contacted')
        .neq('user_id', user.id);
      // GLOBAL scope: show a teammate's avatar if they have this business in ANY
      // campaign (not just the active one), so reps never double-contact a barber
      // anyone has already added. campaignId stays in the signature/deps for
      // call-site compatibility but no longer filters the lookup.

      const { data: claims, error } = await query;
      if (cancelled || error || !claims) {
        if (!cancelled && error) console.warn('[claims] team lookup failed:', error.message);
        return;
      }

      // Keep only claims that match a business currently on screen.
      const placeIds = new Set(leads.map((l) => l.id).filter(Boolean));
      const urls = new Set(leads.map((l) => l.googleMapsUrl).filter(Boolean));
      const relevant = claims.filter(
        (c) => (c.place_id && placeIds.has(c.place_id)) || (c.google_maps_url && urls.has(c.google_maps_url))
      );
      if (relevant.length === 0) {
        if (!cancelled) setByKey({});
        return;
      }

      const claimantIds = [...new Set(relevant.map((c) => c.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', claimantIds);
      const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));

      const map: Record<string, TeamClaim> = {};
      for (const c of relevant) {
        const p = profileMap.get(c.user_id);
        const info: TeamClaim = {
          userId: c.user_id,
          displayName: p?.display_name ?? null,
          avatarUrl: p?.avatar_url ?? null,
          contacted: !!c.contacted,
        };
        if (c.place_id) map[`pid:${c.place_id}`] = info;
        if (c.google_maps_url) map[`url:${c.google_maps_url}`] = info;
      }
      if (!cancelled) setByKey(map);
    })();

    return () => {
      cancelled = true;
    };
  }, [leads, campaignId, user?.id]);

  const getTeamClaim = useCallback(
    (lead: Lead): TeamClaim | null => {
      if (lead.id && byKey[`pid:${lead.id}`]) return byKey[`pid:${lead.id}`];
      if (lead.googleMapsUrl && byKey[`url:${lead.googleMapsUrl}`]) return byKey[`url:${lead.googleMapsUrl}`];
      return null;
    },
    [byKey]
  );

  return { getTeamClaim };
}
