/* A LEAD IN A CALL CAMPAIGN GETS A WHATSAPP OPENER ONLY WHEN THE PERSON CONFIRMS IT (2026-10-15).

   A Call campaign never sends (campaign_launch refuses it) — but its leads could still be queued for WhatsApp one at a
   time or in bulk from Outreach, with nothing said. Every queue door now asks first:
     • the screens (Outreach bulk queue, the lead's WhatsApp controls) read the campaigns' method and ask;
     • the server refuses a salesperson's lead in a Call campaign as 'call_campaign' unless the call carries
       _confirm_call_campaign (sales_queue_opener, migration 20261029090000).
   Fails closed: a campaign list that cannot be read queues nothing. */
/* The reader is passed in (the real client from the screens) so this file stays a testable leaf. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CampaignReader = { from: (t: string) => any };

export interface CampaignLead { id: string; campaign_id?: string | null }

/** Pure: the leads whose campaign is one of the Call campaigns. */
export function leadsInCallCampaigns<T extends CampaignLead>(leads: readonly T[], callCampaignIds: ReadonlySet<string>): T[] {
  return leads.filter((l) => !!l.campaign_id && callCampaignIds.has(l.campaign_id));
}

/** Reads the methods of the campaigns these leads sit in (RLS: the admin reads every campaign, a salesperson their own —
 *  and a salesperson's lead can only be in their own campaign). */
export async function callCampaignLeads<T extends CampaignLead>(sb: CampaignReader, leads: readonly T[]): Promise<{ ok: true; leads: T[] } | { ok: false }> {
  const ids = Array.from(new Set(leads.map((l) => l.campaign_id).filter((v): v is string => !!v)));
  if (ids.length === 0) return { ok: true, leads: [] };
  const { data, error } = await sb.from('campaigns').select('id, method').in('id', ids);
  if (error) return { ok: false };
  const call = new Set(((data ?? []) as Array<{ id: string; method: string | null }>).filter((c) => c.method === 'call').map((c) => c.id));
  return { ok: true, leads: leadsInCallCampaigns(leads, call) };
}

export function callCampaignQuestion(n: number): string {
  return n === 1
    ? 'This lead is in a Call campaign. Queue a WhatsApp message for it anyway?'
    : `${n} of these leads are in a Call campaign. Queue WhatsApp messages for them anyway?`;
}

export const CALL_CAMPAIGN_EXPLAINER = 'A Call campaign is worked by phone, so nothing is sent to its leads on WhatsApp unless you say so here.';
