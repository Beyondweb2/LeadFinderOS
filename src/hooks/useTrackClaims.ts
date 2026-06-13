import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { TeamClaim } from '@/hooks/useTeamClaims';
import type { OutreachLead } from '@/types/outreach';

/**
 * Teammate-claim lookup for tracked (Track Leads) rows. Unlike useTeamClaims
 * (search results, single active campaign), each tracked lead carries its own
 * campaign_id — so a claim warns only when a teammate claimed the SAME business
 * in the SAME campaign as this lead. Reads only the team-readable lead_claims +
 * profiles tables (no schema change). Returns a map keyed by lead.id.
 */
export function useTrackClaims(leads: OutreachLead[]) {
  const { user } = useAuth();
  const [byLeadId, setByLeadId] = useState<Record<string, TeamClaim>>({});

  // Stable dependency: the set of lead ids currently shown.
  const leadKey = leads.map((l) => l.id).join(',');

  useEffect(() => {
    if (!user?.id || leads.length === 0) {
      setByLeadId({});
      return;
    }
    let cancelled = false;

    (async () => {
      const { data: claims, error } = await supabase
        .from('lead_claims')
        .select('place_id, google_maps_url, campaign_id, user_id, contacted')
        .neq('user_id', user.id);
      if (cancelled || error || !claims) {
        if (!cancelled && error) console.warn('[track-claims] lookup failed:', error.message);
        return;
      }

      const claimantIds = [...new Set(claims.map((c) => c.user_id))];
      let profileMap = new Map<string, any>();
      if (claimantIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, display_name, avatar_url')
          .in('user_id', claimantIds);
        profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
      }

      const map: Record<string, TeamClaim> = {};
      for (const lead of leads) {
        const placeId = (lead as any).place_id ?? null;
        const url = lead.google_maps_url ?? null;
        const leadCampaign = lead.campaign_id ?? null;
        const match = claims.find(
          (c) =>
            (c.campaign_id ?? null) === leadCampaign &&
            ((placeId && c.place_id === placeId) || (url && c.google_maps_url === url))
        );
        if (match) {
          const p = profileMap.get(match.user_id);
          map[lead.id] = {
            userId: match.user_id,
            displayName: p?.display_name ?? null,
            avatarUrl: p?.avatar_url ?? null,
            contacted: !!match.contacted,
          };
        }
      }
      if (!cancelled) setByLeadId(map);
    })();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadKey, user?.id]);

  return byLeadId;
}
