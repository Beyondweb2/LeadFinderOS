/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE RESEARCH TEMPLATES (Paul, 2026-11-25, feat/templates-from-research). New wording to test; nothing old is removed.

   A · Web devs / agencies (LeadFinderOS-style campaigns only):
       webdev_which_town  — the follow-up to test against initial_question ("do you build websites…?"). Picked PER CAMPAIGN
                            (campaigns.webdev_question, campaign settings), so the Campaign Performance table compares them.
       [town result]      — "Just ran {{town}} + {{trade}}: {{N}} …" is a SAVED REPLY, not a template: the person fills the blanks with
                            what they really found, and it only ever answers their message (inside the 24 hours, free text).
       webdev_town_ready  — the close with the link.
   B · Findable (local businesses, never a LeadFinderOS-style campaign):
       chatgpt_check_question — the second message: "I checked who ChatGPT suggests for '{{1}} in {{2}}' today …".
       chatgpt_named          — after a yes, with the names ChatGPT gave ({{1}} = "A and B", from the lead's REAL audit).
       chatgpt_not_named      — the same without names, for an audit that cannot give two names.
   C · The opt-out goodbye — a SAVED REPLY: "No problem at all, I won't message again." The opt-out is recorded as always
       (Mark opted out); a free-text reply to their own message is never refused for an opt-out.

   ⛔ NOT APPROVED AT META YET (none of the five was registered when this was written). Until Paul registers one and flips its
      switch below, it may ONLY go inside the open 24-hour window, as free text of the same words (inWindowFreeText.ts
      `windowOnly`): outside the window the send is REFUSED with WAITING_META_REASON, never tried at Meta.
   ⛔ MANUAL ONLY: never queued, never bulk, never automatic (goneCold.ts MANUAL_ONLY_TEMPLATES).
   ⛔ B MAY ONLY CLAIM WHAT THE AUDIT SHOWS (chatgptClaimRefusal): the lead's audit hook search was measured on ChatGPT and the
      business was not in that answer; the second message says "today", so that audit finished in the last 24 hours. The names
      are that one answer's names. Anything unreadable refuses.
   Pure; no imports (edge + browser).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export const WEBDEV_WHICH_TOWN = 'webdev_which_town';
export const WEBDEV_TOWN_READY = 'webdev_town_ready';
export const CHATGPT_CHECK_QUESTION = 'chatgpt_check_question';
export const CHATGPT_NAMED = 'chatgpt_named';
export const CHATGPT_NOT_NAMED = 'chatgpt_not_named';

/** The old web-dev question the new one is tested against (openerVariant.ts INITIAL_OPENER_D). */
export const OLD_WEBDEV_QUESTION = 'initial_question';

export const RESEARCH_TEMPLATES: readonly string[] = [WEBDEV_WHICH_TOWN, WEBDEV_TOWN_READY, CHATGPT_CHECK_QUESTION, CHATGPT_NAMED, CHATGPT_NOT_NAMED];

/* ⛔ THE META SWITCHES. false = not approved at Meta: free text inside the 24 hours only. Flip ONE to true only after Paul has
   seen it Approved in WhatsApp Manager under exactly this name. */
export const RESEARCH_TEMPLATE_APPROVED: Readonly<Record<string, boolean>> = {
  [WEBDEV_WHICH_TOWN]: false,
  [WEBDEV_TOWN_READY]: false,
  [CHATGPT_CHECK_QUESTION]: false,
  [CHATGPT_NAMED]: false,
  [CHATGPT_NOT_NAMED]: false,
};

export const WAITING_META_REASON =
  'Not sent: this template is not approved by Meta yet, so it can only go inside the 24 hours after their last message (as a normal message). Their 24 hours have run out.';

/** True when this template may only go as free text inside the open window (a research template Meta has not approved). */
export function windowOnlyTemplate(templateName: string | null | undefined): boolean {
  const t = String(templateName ?? '');
  return Object.prototype.hasOwnProperty.call(RESEARCH_TEMPLATE_APPROVED, t) && RESEARCH_TEMPLATE_APPROVED[t] !== true;
}

/* ── Who each one is for ─────────────────────────────────────────────────────────────────────── */

/** Web-dev wording: only leads in a LeadFinderOS-style campaign. */
export const LFOS_ONLY_TEMPLATES: ReadonlySet<string> = new Set([WEBDEV_WHICH_TOWN, WEBDEV_TOWN_READY]);
/** Local-business wording: never a lead in a LeadFinderOS-style campaign. */
export const FINDABLE_ONLY_TEMPLATES: ReadonlySet<string> = new Set([CHATGPT_CHECK_QUESTION, CHATGPT_NAMED, CHATGPT_NOT_NAMED]);

export const LFOS_ONLY_REASON = 'This message is only for leads in a LeadFinderOS-style campaign (web developers / agencies). Nothing was sent.';
export const FINDABLE_ONLY_REASON = 'This message is for local businesses (Findable campaigns), not web developers. Nothing was sent.';

/** Why this template may not go to a lead whose campaign has this report style, or null. Unknown style = Findable (the default). */
export function audienceRefusal(templateName: string, reportStyle: string | null | undefined): string | null {
  const lfos = String(reportStyle ?? 'findable') === 'leadfinderos';
  if (LFOS_ONLY_TEMPLATES.has(templateName) && !lfos) return LFOS_ONLY_REASON;
  if (FINDABLE_ONLY_TEMPLATES.has(templateName) && lfos) return FINDABLE_ONLY_REASON;
  return null;
}

/* ── A vs the old question, per campaign ─────────────────────────────────────────────────────── */

export type WebdevQuestion = 'initial_question' | 'webdev_which_town';
export const WEBDEV_QUESTIONS: readonly { value: WebdevQuestion; label: string }[] = [
  { value: 'initial_question', label: 'Old: "Do you build websites or do SEO or AI visibility?"' },
  { value: 'webdev_which_town', label: 'New: "I built a tool… Which town do you want clients in?"' },
];
export const WEBDEV_QUESTION_LABEL = 'Web dev follow-up question';
export const WEBDEV_QUESTION_HINT = 'Which question this campaign’s leads get after they reply. Compare them in Performance.';

/** The campaign's choice. Absent / unknown = the old question (what every campaign did before). */
export function webdevQuestionOf(c: { webdev_question?: string | null } | null | undefined): WebdevQuestion {
  return c?.webdev_question === WEBDEV_WHICH_TOWN ? WEBDEV_WHICH_TOWN : OLD_WEBDEV_QUESTION;
}

/** Picker rule: in a LeadFinderOS-style campaign only the question the campaign chose is offered. Null = offer. */
export function webdevQuestionRefusal(templateName: string, campaign: { report_style?: string | null; webdev_question?: string | null } | null | undefined): string | null {
  if (templateName !== OLD_WEBDEV_QUESTION && templateName !== WEBDEV_WHICH_TOWN) return null;
  if (String(campaign?.report_style ?? 'findable') !== 'leadfinderos') return null;
  const chosen = webdevQuestionOf(campaign);
  if (chosen === templateName) return null;
  return chosen === WEBDEV_WHICH_TOWN
    ? 'This campaign uses the new question ("Which town…?"). Change it in the campaign’s settings.'
    : 'This campaign uses the old question ("Do you build websites…?"). Change it in the campaign’s settings.';
}

/* ── The wording (byte for byte what is to be registered at Meta) ────────────────────────────── */

export const WEBDEV_SIGNUP_LINK = 'leadfinderos.com/?ref=wa';

export function webdevWhichTownBody(): string {
  return 'Great.. I\'m Paul. I built a tool that finds local businesses with weak sites. Which town do you want clients in?';
}

export function webdevTownReadyBody(): string {
  return `Here it is, your town is ready, free 7 days: ${WEBDEV_SIGNUP_LINK}`;
}

/** {{1}} the trade as a plural ("plumbers"), {{2}} the town — both from the lead's own audit. */
export function chatgptCheckQuestionBody(tradePlural: string, town: string): string {
  return `I'm Paul. I checked who ChatGPT suggests for '${tradePlural} in ${town}' today. Want to see what it said?`;
}

const TAIL = 'Answers change each time, but there are things that make you show up more often. Want a short voice note?';

/** {{1}} the names ChatGPT gave in that one answer, joined ("A and B"). */
export function chatgptNamedBody(names: string): string {
  return `It named ${names}. You weren't in this answer. ${TAIL}`;
}

export function chatgptNotNamedBody(): string {
  return `You weren't in ChatGPT's answer. ${TAIL}`;
}

/* ── B's evidence gate ───────────────────────────────────────────────────────────────────────── */

export const CHATGPT_NAMED_MIN = 2;
export const CHATGPT_TODAY_MS = 24 * 60 * 60 * 1000;

/**
 * Why a B template may NOT be sent from this lead's audit, or null when it may.
 * `hookEngine` is the engine of the audit's hook search (resolveAuditReplyVars) — the one answer the business was missing from;
 * `rivalCount` its usable names; `auditDoneAt` when that audit's run finished (ms, null = unreadable).
 */
export function chatgptClaimRefusal(templateName: string, a: { hookEngine: string | null | undefined; rivalCount: number; auditDoneAt: number | null | undefined; now?: number }): string | null {
  if (!FINDABLE_ONLY_TEMPLATES.has(templateName)) return null;
  if (a.hookEngine !== 'chatgpt') {
    return 'This message says ChatGPT, but this lead’s audit did not find them missing from a ChatGPT answer'
      + (a.hookEngine ? ` (its result is from ${a.hookEngine === 'gemini' ? 'Google AI' : a.hookEngine})` : '')
      + '. Nothing was sent. Use another template.';
  }
  if (templateName === CHATGPT_CHECK_QUESTION) {
    const now = a.now ?? Date.now();
    if (a.auditDoneAt == null || !Number.isFinite(a.auditDoneAt)) return 'Could not read when the audit ran, and this message says "today". Nothing was sent.';
    if (now - a.auditDoneAt > CHATGPT_TODAY_MS) return 'This message says "today", but this lead’s audit is more than a day old. Re-run the audit first. Nothing was sent.';
  }
  if (templateName === CHATGPT_NAMED && a.rivalCount < CHATGPT_NAMED_MIN) {
    return `ChatGPT's answer gave fewer than ${CHATGPT_NAMED_MIN} names we can use. Nothing was sent. Use "ChatGPT answer, no names" instead.`;
  }
  return null;
}

/* ── Saved replies (free text, the person presses send) ──────────────────────────────────────── */

export interface SavedReply { id: string; label: string; text: string; audience: 'lfos' | 'all' }

export const OPT_OUT_GOODBYE = 'No problem at all, I won\'t message again.';

export const SAVED_REPLIES: readonly SavedReply[] = [
  { id: 'webdev_town_result', label: 'Town result (fill the blanks)', audience: 'lfos',
    /* ⛔ The blanks are {{markers}} on purpose: the Inbox never sends free text that still has one (leadUtils.ts unresolvedTokens),
       so the town, trade and number are always what the person really found. */
    text: 'Just ran {{town}} + {{trade}}: {{N}} with broken or slow sites. Want a 20-sec voice note showing them?' },
  { id: 'opt_out_goodbye', label: 'Opt-out goodbye', audience: 'all', text: OPT_OUT_GOODBYE },
];

/** The saved replies for a lead in a campaign of this report style. */
export function savedRepliesFor(reportStyle: string | null | undefined): SavedReply[] {
  const lfos = String(reportStyle ?? 'findable') === 'leadfinderos';
  return SAVED_REPLIES.filter((r) => r.audience === 'all' || lfos);
}
