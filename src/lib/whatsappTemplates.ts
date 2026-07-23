// Per-lead WhatsApp template validity — the SINGLE source of truth shared by the Inbox
// quick-chat picker AND SingleWhatsAppDialog, so their guards can't drift.
//
// Requirements per template MIRROR the edge allowlist (supabase/functions/_shared/whatsapp-send.ts
// WA_TEMPLATES[name].vars): a template with a "url" var needs the lead's /s/<share_token> claim
// link; audit_reply needs the lead's completed audit (competitors) + published report slug. Kept a
// deliberate mirror because the SPA can't import Deno edge code (same pattern as src/lib/aggregators.ts).
// KEEP IN SYNC with WA_TEMPLATES when a template's variable shape changes.

export type TemplateGroup = 'site' | 'opener' | 'audit';

export interface TemplateReq {
  /** Needs the lead's /s/<share_token> claim link (template has a "url" var). */
  needsUrl: boolean;
  /** Needs the lead's completed audit (competitors) + published report slug (audit_reply). */
  needsAudit: boolean;
  /** Coarse flow grouping — for optional visual labelling only, NOT for auto-hiding. */
  group: TemplateGroup;
}

export const WA_TEMPLATE_REQS: Record<string, TemplateReq> = {
  booking_page_intro:     { needsUrl: true,  needsAudit: false, group: 'site' },
  no_website_barbers:     { needsUrl: true,  needsAudit: false, group: 'site' },
  barber_poor_website:    { needsUrl: true,  needsAudit: false, group: 'site' },
  booking_switch_barbers: { needsUrl: true,  needsAudit: false, group: 'site' },
  barber_fresha_booksy:   { needsUrl: true,  needsAudit: false, group: 'site' },
  initial_contact:        { needsUrl: false, needsAudit: false, group: 'opener' },
  // audit_reply is not yet wired into the manual send path; its rule lives here so the guard is
  // ready the moment it's added to the picker + sender (no drift when that happens).
  audit_reply:            { needsUrl: false, needsAudit: true,  group: 'audit' },
};

export interface SendabilityLead {
  /** The lead's own /s/<share_token> — resolved strictly by lead id upstream. */
  shareToken?: string | null;
}

export interface SendabilityAudit {
  /** The lead's own latest audit named at least one competitor ({{2}}). */
  hasCompetitors?: boolean;
  /** The lead's own published audit report slug (drives /a/<slug>, {{4}}). */
  reportSlug?: string | null;
}

export interface Sendability {
  ok: boolean;
  reason?: string;
}

/** Shared low-level rule: a send that needs a site link is blocked when the lead has no
 *  share_token. Used by SingleWhatsAppDialog (free-text {{link}}) AND getTemplateSendability. */
export function siteLinkGuard(needsUrl: boolean, shareToken: string | null | undefined): Sendability {
  if (needsUrl && !shareToken) return { ok: false, reason: 'No site link yet — generate the site first.' };
  return { ok: true };
}

/**
 * Can this named template be sent to this lead right now? Single source of truth for the picker
 * disable state + reason. Resolves ONLY from the target lead's own record/audit (passed in by the
 * caller, keyed by lead id) — never a name or another lead. Unknown template → not blocked here
 * (the edge sender still validates the allowlist).
 */
export function getTemplateSendability(
  template: string,
  lead: SendabilityLead | null | undefined,
  audit?: SendabilityAudit | null,
): Sendability {
  const req = WA_TEMPLATE_REQS[template];
  if (!req) return { ok: true };
  const link = siteLinkGuard(req.needsUrl, lead?.shareToken);
  if (!link.ok) return link;
  if (req.needsAudit && !(audit?.hasCompetitors && audit?.reportSlug)) {
    return { ok: false, reason: 'Run an audit for this lead first.' };
  }
  return { ok: true };
}
