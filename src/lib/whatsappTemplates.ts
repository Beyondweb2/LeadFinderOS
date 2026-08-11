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
  // Follow-up after the 24h window. needsUrl is FALSE: its link is the onboarding URL, built
  // from the lead id server-side, so it must not be gated on a generated site's share_token.
  // needsAudit is FALSE too — it pitches the flow, not a report. The only real requirement is a
  // linked lead, which the picker already enforces for every template.
  onboarding_followup:    { needsUrl: false, needsAudit: false, group: 'audit' },
  // No link and no audit — the only real requirement is a linked lead with a business name,
  // which the edge refuses without (no_business_name).
  book_call:              { needsUrl: false, needsAudit: false, group: 'opener' },
  /* Re-engage a lead who went quiet. No link and no audit: it asks a question rather than
     delivering anything, so gating it on a report or a generated site would make it unsendable to
     exactly the leads it is for — the same mistake onboarding_followup's comment records above.
     ⚠️ needsAudit stays FALSE deliberately. If it is ever changed to true, a quiet lead with no
     completed audit becomes unreachable by the one template written for them. */
  re_engage:              { needsUrl: false, needsAudit: false, group: 'opener' },
};

export interface SendabilityLead {
  /** The lead's own /s/<share_token> — resolved strictly by lead id upstream. */
  shareToken?: string | null;
}

export interface SendabilityAudit {
  /** The lead's own completed-audit report identifier — the audit id served live at
   *  /a/<auditId> (or a legacy published slug), i.e. {{4}}. Presence = a ready report. */
  reportSlug?: string | null;
  /** Optional: the audit named ≥1 competitor ({{2}}). NOT required by this client guard —
   *  competitors are enforced at SEND time (resolveAuditReplyVars refuses if empty). */
  hasCompetitors?: boolean;
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
  // audit_reply needs a ready report for this lead (its completed audit → /a/<auditId>).
  // Competitors ({{2}}) are validated server-side at send (resolveAuditReplyVars), not here.
  if (req.needsAudit && !audit?.reportSlug) {
    return { ok: false, reason: 'Run an audit for this lead first.' };
  }
  return { ok: true };
}
