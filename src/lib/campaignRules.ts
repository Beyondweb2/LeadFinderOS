/* ════════════════════════════════════════════════════════════════════════════════════════════════
   CAMPAIGNS — the pure rules the screens read (2026-10-03, the salesperson's own campaigns).

   The enforcement is in the database (migration 20261006120000): ownership (created_by, set from the
   signed-in account), privacy (a salesperson reads only their own), global name uniqueness (a unique index
   on campaign_name_key), and every action through role-checked functions. This file only says things in
   words, and mirrors the name key so the screen can warn early — the server decides.

   ⛔ The owner in brackets is DISPLAY ONLY ("Roofers - Manchester (Sarah)"); the stored name never changes,
      and uniqueness is on the real name.
   ⛔ Status is DERIVED from the counts, never stored: a stored status freezes at a stale rule (CLAUDE.md §6).
   Pure: no React, no I/O.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** The SAME rule as SQL public.campaign_name_key: trimmed, inner whitespace collapsed, case-folded. */
export function campaignNameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export const CAMPAIGN_NAME_MAX = 80;

/** One campaign as my_campaigns / campaign_detail return it. Owner fields come only to the admin. */
export interface CampaignSummary {
  id: string;
  name: string;
  created_at: string;
  default_template: string | null;
  is_mine: boolean;
  leads: number;
  ready: number;
  queued: number;
  contacted: number;
  replied: number;
  interested: number;
  owner_id?: string;
  owner_name?: string | null;
  owner_role?: string | null;
}

/** The admin sees whose campaign it is beside the name — except their own, which stays plain. A
 *  salesperson only ever sees their own, so never a bracket. */
export function campaignDisplayName(c: Pick<CampaignSummary, 'name' | 'is_mine' | 'owner_name'>, viewerIsAdmin: boolean): string {
  if (!viewerIsAdmin || c.is_mine) return c.name;
  const owner = (c.owner_name ?? '').trim();
  return owner ? `${c.name} (${owner})` : `${c.name} (another user)`;
}

export type CampaignStatus = 'draft' | 'ready' | 'sending' | 'sent' | 'partly_sent';

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: 'Draft',
  ready: 'Ready to send',
  sending: 'Sending',
  partly_sent: 'Sent · new leads waiting',
  sent: 'Sent',
};

/** Derived from the counts. Enumerates every arrival; an empty campaign is a draft. */
export function campaignStatus(c: Pick<CampaignSummary, 'leads' | 'ready' | 'queued' | 'contacted'>): CampaignStatus {
  if (c.leads === 0) return 'draft';
  if (c.queued > 0) return 'sending';
  if (c.contacted === 0) return c.ready > 0 ? 'ready' : 'draft';
  return c.ready > 0 ? 'partly_sent' : 'sent';
}

/** The one thing to do next, in plain words. */
export function campaignNextStep(c: Pick<CampaignSummary, 'leads' | 'ready' | 'queued' | 'contacted' | 'replied'>): string {
  const s = campaignStatus(c);
  if (s === 'draft') return c.leads === 0 ? 'Add leads' : 'Add leads that can be messaged';
  if (s === 'ready') return `Launch: ${c.ready} ${c.ready === 1 ? 'lead is' : 'leads are'} ready`;
  if (s === 'sending') return 'Sending in the send window — nothing to do';
  if (s === 'partly_sent') return `Send to the ${c.ready} new ${c.ready === 1 ? 'lead' : 'leads'}`;
  return c.replied > 0 ? 'Answer replies in WhatsApp' : 'Wait for replies';
}

/** What the first message is FOR, in a salesperson's words — never the internal template name. An opener not
 *  listed here falls back to the registry label (the caller passes it). */
const OPENER_PURPOSE: Record<string, string> = {
  initial_contact: 'A short hello that checks it is the right business',
  initial_opener_v2: 'A short hello that checks it is the right business (new wording)',
};
export function openerPurpose(template: string | null | undefined, fallback: string): string {
  return (template && OPENER_PURPOSE[template]) || fallback;
}

/** Server codes → words. ⛔ name_taken never says whose: the other campaign may not be one you can see. */
export const CAMPAIGN_ERROR_TEXT: Record<string, string> = {
  name_taken: 'A campaign with this name already exists. Choose a different name.',
  name_required: 'Give the campaign a name.',
  name_too_long: `Keep the name under ${CAMPAIGN_NAME_MAX} characters.`,
  not_found: 'That campaign is not available.',
  has_leads: 'Only an empty campaign can be deleted. Take its leads out first.',
  no_approved_opener: 'There is no approved first message to send right now. Ask Paul.',
  usage_paused: 'Usage temporarily paused — contact Paul',
  too_many: 'Too many leads at once (500 at most).',
  no_leads: 'Choose at least one lead.',
  unknown_campaign: 'That campaign is not available.',
};

export function campaignErrorText(code: string | undefined | null): string {
  return (code && CAMPAIGN_ERROR_TEXT[code]) || (code ? `Not done (${code}).` : 'Not done.');
}

/** Why a lead was not queued at launch (sales_queue_opener's own skip keys), in words. */
export const LAUNCH_SKIP_TEXT: Record<string, string> = {
  not_found: 'not found', not_yours: 'not your lead', archived: 'archived', client: 'already a client',
  not_new: 'already in progress', already_contacted: 'already contacted', no_phone: 'no phone number',
  not_a_uk_mobile: 'not a mobile number', opted_out: 'asked not to be contacted', daily_limit: 'over your daily limit',
};

export function launchSkipLine(skipped: Record<string, number> | null | undefined): string {
  const parts = Object.entries(skipped ?? {}).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${LAUNCH_SKIP_TEXT[k] ?? k}`);
  return parts.length ? `Not sent: ${parts.join(', ')}.` : '';
}
