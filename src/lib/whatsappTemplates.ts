// Per-lead WhatsApp template validity — the SINGLE source of truth shared by the Inbox
// quick-chat picker AND SingleWhatsAppDialog, so their guards can't drift.
//
// Requirements per template MIRROR the edge allowlist (supabase/functions/_shared/whatsapp-send.ts
// WA_TEMPLATES[name].vars): a template with a "url" var needs the lead's /s/<share_token> claim
// link; audit_reply needs the lead's completed audit (competitors) + published report slug. Kept a
// deliberate mirror because the SPA can't import Deno edge code (same pattern as src/lib/aggregators.ts).
// KEEP IN SYNC with WA_TEMPLATES when a template's variable shape changes.
/* The explicit `.ts` costs the SPA nothing (Vite resolves it) and is what keeps this import safe if
   anything edge-reachable ever pulls this module in — the extensionless form is the one the Supabase
   bundler refuses outright while tsc and vite both resolve it happily (CLAUDE.md §3). */
import { AI_SITE_FINDINGS_V2, AI_SITE_FINDINGS_V2_APPROVED } from './siteFindings.ts';
import { STALE_OFFER_TEMPLATES } from './findableOffer.ts';

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
  /** Needs the lead's crawl check to have found a fault — its {{6}} names one and Meta rejects an
   *  empty parameter, so this template is only OFFERED when there is a fault to name
   *  (audit_followup_fault). Absent/false = no such requirement. */
  needsSiteFault?: boolean;
  /** Needs the lead's crawl check to have found a STRONG fault on a site that actually exists — its
   *  {{6}} names two or three of them (ai_site_findings_v2). Narrower than needsSiteFault on
   *  purpose: see the note on that template below. Absent/false = no such requirement. */
  needsSiteFindings?: boolean;
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
  /* initial_opener_v2 - the A/B variant of the opener (src/lib/openerVariant.ts). Same shape as its
     sibling: no link, no audit, and it is an OPENER, which is what keeps it out of every
     continuation path. It carries no variables at all. */
  initial_opener_v2:      { needsUrl: false, needsAudit: false, group: 'opener' },
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
  /* audit_followup — submitted to Meta 2026-09-15. needsAudit because its {{6}} IS the report link
     and {{3}}-{{5}} are the rivals that audit named, so the queue must not send it before the audit
     completes (queueAuditStatus reads this flag).
     ⚠️ Like competitor_hook, the picker does NOT check for three rivals — that decision belongs at
     send time, where a lead short of three falls back to video_template rather than being refused. */
  audit_followup:         { needsUrl: false, needsAudit: true,  group: 'audit' },
  /* audit_followup_call — submitted to Meta 2026-09-16. ⛔ needsAudit is TRUE even though it carries
     NO LINK, and that is the whole subtlety of this entry: {{3}}-{{5}} are the rivals the audit
     named, so the message cannot be built before the audit completes. An entry copied from
     explain_offer (also linkless, also needsAudit false) would have been wrong for exactly that
     reason. ⚠️ Like its siblings the picker does NOT check for three rivals — that is resolved
     server-side at send time, where a lead short of three is HELD (this template is a continuation,
     so there is no cold fallback to substitute). */
  audit_followup_call:    { needsUrl: false, needsAudit: true,  group: 'audit' },
  /* audit_followup_fault — submitted to Meta 2026-09-17. needsAudit like its siblings (rivals + the
     report link {{7}} come from the completed audit). ⛔ needsSiteFault is the NEW gate: {{6}} names
     the site's main crawl fault and Meta rejects an empty parameter, so it is only OFFERED when the
     lead's crawl check found a fault — a clean-site lead gets audit_followup_call instead. The
     server also fails closed (site_fault throws) if it is ever sent without one.
     ⚠️ Like its siblings the picker does NOT check for three rivals — that is resolved server-side,
     where a lead short of three is HELD (a continuation, no cold fallback). */
  audit_followup_fault:   { needsUrl: false, needsAudit: true,  needsSiteFault: true, group: 'audit' },
  /* ai_site_findings_v2 — submitted to Meta 2026-09-22. audit_followup_fault's requirements exactly,
     with the fault gate swapped for the findings gate: needsAudit (rivals + the report link {{7}}),
     and needsSiteFindings because {{6}} names two or three real findings and Meta rejects an empty
     parameter.
     ⛔ needsSiteFindings IS NOT needsSiteFault AND THE TWO MUST NOT BE MERGED. The findings gate is
     strictly narrower: it refuses a lead with no website (the copy says "had a proper look at your
     site") and a lead whose site crawled clean (the copy has already asserted the site is the
     problem), both of which audit_followup_fault accepts and has a line for. Sharing one flag would
     make this template offerable to leads its own words contradict.
     ⛔ AND IT IS GATED ON APPROVAL. Until AI_SITE_FINDINGS_V2_APPROVED flips, getTemplateSendability
     refuses it outright, before any of these requirements are even consulted. */
  ai_site_findings_v2:    { needsUrl: false, needsAudit: true,  needsSiteFindings: true, group: 'audit' },
  /* explain_offer - the full pitch. ⛔ needsAudit is FALSE and that is the point: its {{3}} is the
     SIGN-UP link, built from the lead id alone, so nothing here waits on a completed audit. It is
     the only outreach template that can go to a lead we have never audited.
     ⚠️ needsUrl stays false too - 'url' means the CLAIM/site link and gates on a share_token no
     Findable lead has; onboarding_url is a different variable for exactly that reason. */
  explain_offer:          { needsUrl: false, needsAudit: false, group: 'audit' },
  /* explain_offer_v2 - the same message with the proof paragraph (2026-09-16). Same shape for the
     same reasons: its link is the sign-up, so no audit and no share_token. */
  explain_offer_v2:       { needsUrl: false, needsAudit: false, group: 'audit' },
  // Follow-up after the 24h window. needsUrl is FALSE: its link is the onboarding URL, built
  // from the lead id server-side, so it must not be gated on a generated site's share_token.
  // needsAudit is FALSE too — it pitches the flow, not a report. The only real requirement is a
  // linked lead, which the picker already enforces for every template.
  onboarding_followup:    { needsUrl: false, needsAudit: false, group: 'audit' },
  // No link and no audit — the only real requirement is a linked lead with a business name,
  // which the edge refuses without (no_business_name).
  /* contact_followup - the NO-REPLY chase: a lead that got the opener and never answered. It had
     no entry here until 2026-09-15 and did not need one, because the Inbox read a second hardcoded
     list that omitted it entirely. Now that every picker reads the one list it renders here, and an
     absent record falls through getTemplateSendability's `if (!req) return { ok: true }` - enabled
     with nothing checked. Stating it is the point: no link, no audit, the same shape as book_call.
     ⚠️ AND THE PERMISSIVE DEFAULT IS WORTH KNOWING ABOUT rather than relying on: a template missing
     from this table is offered UNGATED, which is the absent-value shape pointing the wrong way on a
     picker. Left as it is - flipping it would silently disable anything else not listed - but every
     entry in WHATSAPP_TEMPLATES should have a record here. */
  contact_followup:       { needsUrl: false, needsAudit: false, group: 'opener' },
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
  /** The lead's crawl check found a fault to name ({{6}} of audit_followup_fault). Presence gates
   *  that one template; every other template ignores it. Resolved per-lead by the caller. */
  hasSiteFault?: boolean;
  /** The lead has a website AND its crawl found something strong enough to write two or three plain
   *  findings from ({{6}} of ai_site_findings_v2). Presence gates that one template; every other
   *  template ignores it. Resolved per-lead by the caller from resolveSiteFindings. */
  hasSiteFindings?: boolean;
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
  /* ⛔ THE APPROVAL GATE COMES FIRST, BEFORE EVERY OTHER REQUIREMENT. A template Meta has not
     approved cannot be sent to anyone for any reason, so asking "does this lead have an audit"
     first would let a lead who satisfies everything else look sendable one refactor away from
     being one. While the constant is false this is the structural half of the switch; the picker
     label is only the half the operator reads. One line in src/lib/siteFindings.ts flips both. */
  if (template === AI_SITE_FINDINGS_V2 && !AI_SITE_FINDINGS_V2_APPROVED) {
    return { ok: false, reason: 'Waiting on Meta approval — a send would fail. Use audit_followup_fault.' };
  }
  /* The registered body quotes the retired £29.99 monthly and "Stop any time" (2026-09-23) — blocked
     until a corrected version is approved at Meta. Same set the server refuses on. */
  if (STALE_OFFER_TEMPLATES.has(template)) {
    return { ok: false, reason: 'Quotes the old £29.99/month offer — blocked until the corrected version is approved at Meta.' };
  }
  const req = WA_TEMPLATE_REQS[template];
  if (!req) return { ok: true };
  const link = siteLinkGuard(req.needsUrl, lead?.shareToken);
  if (!link.ok) return link;
  // audit_reply needs a ready report for this lead (its completed audit → /a/<auditId>).
  // Competitors ({{2}}) are validated server-side at send (resolveAuditReplyVars), not here.
  if (req.needsAudit && !audit?.reportSlug) {
    return { ok: false, reason: 'Run an audit for this lead first.' };
  }
  /* audit_followup_fault names a specific site fault in {{6}}, and Meta rejects an empty parameter,
     so it may only be offered when the lead's crawl check actually found one. A clean-site (or
     un-crawled) lead is steered to the call version instead — the send would fail closed anyway. */
  if (req.needsSiteFault && !audit?.hasSiteFault) {
    return { ok: false, reason: 'No site fault to name yet — use the call version (audit_followup_call).' };
  }
  /* ai_site_findings_v2's {{6}} names two or three findings, and it is refused outright for a lead
     with no website or a site that crawled clean — its own copy says "had a proper look at your
     site" and blames the site, so neither lead can be sent it honestly. resolveSiteFindings is the
     single source of both the gate and the value, so "offered" and "sendable" cannot come apart. */
  if (req.needsSiteFindings && !audit?.hasSiteFindings) {
    return { ok: false, reason: 'Nothing strong enough found on the site yet — use audit_followup_call.' };
  }
  return { ok: true };
}
