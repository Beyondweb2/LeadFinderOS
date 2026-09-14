// Per-lead WhatsApp template validity — the SINGLE source of truth shared by the Inbox
// quick-chat picker AND SingleWhatsAppDialog, so their guards can't drift.
//
// Requirements per template MIRROR the edge allowlist (supabase/functions/_shared/whatsapp-send.ts
// WA_TEMPLATES[name].vars): a template with a "url" var needs the lead's /s/<share_token> claim
// link; audit_reply needs the lead's completed audit (competitors) + published report slug. Kept a
// deliberate mirror because the SPA can't import Deno edge code (same pattern as src/lib/aggregators.ts).
// KEEP IN SYNC with WA_TEMPLATES when a template's variable shape changes.

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 TEMPLATES THAT WERE RE-REGISTERED AT META UNDER A NEW NAME, AND THE HISTORY THAT CARRIES THE
   OLD ONE (2026-09-12).

   Paul re-registered two templates: `audit_result_hook` -> `video_template` (now with a video
   header) and `re_engage` -> `re_engage_49` (now one variable). Renaming the code is the easy half.
   The half that fails SILENTLY is that the database is full of the old names:

       whatsapp_sends.template        135 audit_result_hook   20 re_engage
       whatsapp_messages.template_name 135 audit_result_hook   21 re_engage

   Every read-side consumer compares a stored name against a literal, so a bare rename would have:
     · emptied the COLD arm of the A/B comparison (armComparison.AB_ARMS) — 135 sends, the entire
       arm, reading as "no data" rather than as an error;
     · dropped 135 sends out of REPORT_LINK_TEMPLATES, moving their real report opens into the
       "not attributable" bucket — the exact failure §14 records for forgetting a template;
     · blanked the Inbox label for 156 rows;
     · broken last-touch attribution for the same rows.
   None of that throws. The numbers would just quietly get smaller.

   ⛔ SO THE STORED NAME IS CANONICALISED ON READ, NEVER MIGRATED IN THE DATABASE. The rows are the
   record of what was actually sent, and `audit_result_hook` IS what Meta was told at the time —
   rewriting them would falsify the receipt to tidy up a display concern.
   ⚠️ ONE DIRECTION ONLY: old -> new. Adding a reverse entry would make two live templates collapse
   into one. ⚠️ An unknown name passes through untouched: absence is not a rename. */
export const TEMPLATE_RENAMES: Readonly<Record<string, string>> = {
  audit_result_hook: 'video_template',
  re_engage: 're_engage_49',
};

/** The current name for a template, given whatever name a stored row happens to carry. */
export function canonicalTemplate(name: string | null | undefined): string {
  const n = (name ?? '').trim();
  return TEMPLATE_RENAMES[n] ?? n;
}

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
  // video_template - the outreach hook. Same shape as audit_reply: its link IS the report link,
  // so it needs the lead's completed audit and never a share_token.
  video_template:      { needsUrl: false, needsAudit: true,  group: 'audit' },
  /* competitor_hook — needsAudit for the same reason as its sibling: its {{6}} IS the report link
     and {{3}}–{{5}} are the rivals that audit named, so the queue must not send it before the audit
     completes (queueAuditStatus reads this flag).
     ⚠️ THE PICKER DOES NOT CHECK FOR THREE RIVALS, DELIBERATELY. `hasCompetitors` already exists
     here and is already unused for the same reason: the rival list is resolved server-side at SEND
     time from the audit, so a client-side count would be a second copy of the rule reading staler
     data — and it would disable the button for a lead the server would happily serve with the
     fallback (src/lib/rivalHook.ts). Enable, then let the server decide what actually goes. */
  competitor_hook:     { needsUrl: false, needsAudit: true,  group: 'audit' },
  /* audit_reply_warm - the warm audit message. needsAudit because its {{3}} IS the report link, so
     the queue must not send it before the audit completes (queueAuditStatus reads this flag). */
  audit_reply_warm:       { needsUrl: false, needsAudit: true,  group: 'audit' },
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
  re_engage_49:              { needsUrl: false, needsAudit: false, group: 'opener' },
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
