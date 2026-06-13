import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface TeamMemberStat {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  claimed: number;
  contacted: number;
}

export interface TeamCampaignStat {
  campaignId: string | null;
  name: string;
  claimed: number;
  contacted: number;
  contributors: { userId: string; displayName: string | null; avatarUrl: string | null }[];
}

export interface TeamActivity {
  totals: { claimed: number; contacted: number; activeTeammates: number };
  members: TeamMemberStat[];
  campaigns: TeamCampaignStat[];
}

const EMPTY: TeamActivity = {
  totals: { claimed: 0, contacted: 0, activeTeammates: 0 },
  members: [],
  campaigns: [],
};

/**
 * Read-only roll-up of TEAM activity for the dashboard's Team zone. Same pattern
 * as useTeamClaims / useTrackClaims: it reads ONLY the team-readable tables —
 * `lead_claims` (per-teammate, per-campaign claim registry), `profiles`
 * (display name + avatar) and `campaigns` (names). It NEVER touches
 * outreach_leads, lead_notes content, user_metrics, or emails — so no private
 * revenue / pipeline / notes detail is exposed and no RLS change is required.
 *
 * Each `lead_claims` row = one teammate claiming one business in one campaign,
 * so "claimed" counts those rows; "contacted" counts the subset flagged
 * contacted. Aggregates are produced per-person (leaderboard) and per-campaign.
 */
export function useTeamActivity() {
  const [activity, setActivity] = useState<TeamActivity>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);

  const fetchActivity = useCallback(async () => {
    setIsLoading(true);

    const { data: claims, error } = await supabase
      .from('lead_claims')
      .select('user_id, campaign_id, contacted');

    if (error || !claims) {
      if (error) console.warn('[team-activity] claims lookup failed:', error.message);
      setActivity(EMPTY);
      setIsLoading(false);
      return;
    }

    // Resolve the profiles + campaign names referenced by the claims.
    const userIds = [...new Set(claims.map((c) => c.user_id))];
    const campaignIds = [...new Set(claims.map((c) => c.campaign_id).filter(Boolean))] as string[];

    const [profilesRes, campaignsRes] = await Promise.all([
      userIds.length
        ? supabase.from('profiles').select('user_id, display_name, avatar_url').in('user_id', userIds)
        : Promise.resolve({ data: [] as any[] }),
      campaignIds.length
        ? supabase.from('campaigns').select('id, name').in('id', campaignIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.user_id, p]));
    const campaignNameMap = new Map((campaignsRes.data || []).map((c: any) => [c.id, c.name as string]));

    // Per-person leaderboard.
    const memberMap = new Map<string, TeamMemberStat>();
    // Per-campaign breakdown (null campaign bucketed under a stable key).
    const NO_CAMPAIGN = '__none__';
    const campaignMap = new Map<string, TeamCampaignStat & { contributorIds: Set<string> }>();

    for (const c of claims) {
      const p = profileMap.get(c.user_id);

      const member = memberMap.get(c.user_id) ?? {
        userId: c.user_id,
        displayName: p?.display_name ?? null,
        avatarUrl: p?.avatar_url ?? null,
        claimed: 0,
        contacted: 0,
      };
      member.claimed += 1;
      if (c.contacted) member.contacted += 1;
      memberMap.set(c.user_id, member);

      const key = c.campaign_id ?? NO_CAMPAIGN;
      const camp = campaignMap.get(key) ?? {
        campaignId: c.campaign_id ?? null,
        name: c.campaign_id ? (campaignNameMap.get(c.campaign_id) ?? 'Campaign') : 'Unsorted',
        claimed: 0,
        contacted: 0,
        contributors: [],
        contributorIds: new Set<string>(),
      };
      camp.claimed += 1;
      if (c.contacted) camp.contacted += 1;
      if (!camp.contributorIds.has(c.user_id)) {
        camp.contributorIds.add(c.user_id);
        camp.contributors.push({
          userId: c.user_id,
          displayName: p?.display_name ?? null,
          avatarUrl: p?.avatar_url ?? null,
        });
      }
      campaignMap.set(key, camp);
    }

    const members = [...memberMap.values()].sort(
      (a, b) => b.claimed - a.claimed || b.contacted - a.contacted
    );
    const campaigns = [...campaignMap.values()]
      .map(({ contributorIds, ...rest }) => rest)
      .sort((a, b) => b.claimed - a.claimed);

    setActivity({
      totals: {
        claimed: claims.length,
        contacted: claims.filter((c) => c.contacted).length,
        activeTeammates: memberMap.size,
      },
      members,
      campaigns,
    });
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  return { activity, isLoading, refetch: fetchActivity };
}
