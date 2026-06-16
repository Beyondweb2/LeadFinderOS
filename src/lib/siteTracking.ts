import { supabase } from '@/integrations/supabase/client';

/**
 * Shared types + helpers for barber-site claim/tracking (Phase 1).
 * Phase 2 (Sites scoreboard) and Phase 3 (Track Leads + export) read these.
 */

/** A/B test segment, defaulted from the lead's list_type. */
export type SiteSegment = 'A' | 'B'; // A = no website, B = bad website

/** Public events recorded from the /s/:token page (anon). */
export type PublicSiteEvent = 'open' | 'claim' | 'addon_interest';

/** Admin-side signals set in AdminSiteManage. */
export type AdminSiteEvent = 'sent' | 'replied';

export type SiteEventType = PublicSiteEvent | AdminSiteEvent;

/** The tracking fields stored on each generated_sites row. */
export interface SiteTracking {
  segment: SiteSegment | null;
  sent_at: string | null;
  sent_template: string | null;
  sent_message: string | null;
  first_opened_at: string | null;
  open_count: number;
  replied_at: string | null;
  claimed_at: string | null;
  addon_interest_at: string | null;
}

/** Boolean view of the funnel for one site (Phase 2 scoreboard rows). */
export interface SiteFunnel {
  sent: boolean;
  opened: boolean;
  replied: boolean;
  claimed: boolean;
  addonWanted: boolean;
}

export function toFunnel(t: Partial<SiteTracking>): SiteFunnel {
  return {
    sent: !!t.sent_at,
    opened: !!t.first_opened_at,
    replied: !!t.replied_at,
    claimed: !!t.claimed_at,
    addonWanted: !!t.addon_interest_at,
  };
}

/**
 * Record a public site event (open / claim / addon_interest) via the
 * record-site-event edge function. Anon-safe; keyed by the unguessable token.
 * Never throws — tracking must not break the page.
 */
export async function recordSiteEvent(
  shareToken: string,
  event: PublicSiteEvent,
): Promise<{ ok: boolean; alreadyDone?: boolean }> {
  try {
    const { data, error } = await supabase.functions.invoke('record-site-event', {
      body: { share_token: shareToken, event },
    });
    if (error) return { ok: false };
    return { ok: !!data?.ok, alreadyDone: !!data?.alreadyDone };
  } catch {
    return { ok: false };
  }
}
