/* THE VISIBLE FLAG (Paul, 2026-10-21; record docs/lead-status-and-visible.md).
   If the lead's NEWEST audit (the hook / free check — isDrafterAudit) shows Gemini or Google AI naming the business, then once the
   audit and the website check are final: no pitch is drafted or sent, the lead is marked Visible, its queued follow-ups are
   cancelled, and its replies are not flagged Needs you. A reversible FLAG, not a pipeline stage: a later audit that no longer
   names them removes it and the normal flow resumes.
   ⛔ ChatGPT never counts. "No AI answer shown" (Google AI with no answer) is never "named".
   ⛔ PER ENGINE, MORE THAN HALF (Paul, 2026-10-21): Gemini and Google AI are judged SEPARATELY; an engine "names them" when it
      named them in more than half of ITS OWN answers (the threshold is a setting, VISIBLE_SHARES; default 'half'). 1/1 and 2/2
      are Visible; 1/2 is not (GSI Driving School gets the pitch); 0 answers is never named.
   ⛔ The flag is written ONLY by the database function apply_lead_visible, called by ai-reply-drafts (judgeLeadVisible).
   Counts are the SAME ruler as the Inbox engine chips (ai_audit_queue gemini_* / overview_*, done rows; engineScores.ts).
   Pure and edge-reachable: no imports, no Deno, no DOM. */

export const VISIBLE_RULES = ['either', 'both', 'off'] as const;
export type VisibleRule = (typeof VISIBLE_RULES)[number];
export const DEFAULT_VISIBLE_RULE: VisibleRule = 'either';

/** The setting's choices, in the Inbox Settings popup. */
export const VISIBLE_RULE_LABELS: Record<VisibleRule, string> = {
  either: 'Gemini or Google AI names them',
  both: 'Gemini and Google AI both name them',
  off: 'Off',
};

export const VISIBLE_LABEL = 'Visible';
export const VISIBLE_TITLE = 'Visible: AI already names this business in the newest audit, so no pitch is drafted or sent, its queued follow-ups were cancelled and its replies are not flagged Needs you. A later audit that no longer names them removes this.';
/** What Draft reply / Regenerate say when the move would be a pitch on a Visible lead. */
export const VISIBLE_NO_PITCH_ERROR = 'visible';
export const VISIBLE_NO_PITCH_DETAIL = 'AI already names this business (Visible), so no pitch is written. Answer it yourself if you want to.';
/** The ai_reply_drafts.reason on a reply skipped because the lead is Visible. */
export const VISIBLE_SKIP_REASON = 'visible';

/** The threshold setting (whatsapp_outreach_state.visible_min_share): an engine names them when named / answers is MORE THAN
 *  this share of its answers. */
export const VISIBLE_SHARES = ['half', 'two_thirds', 'all'] as const;
export type VisibleShare = (typeof VISIBLE_SHARES)[number];
export const DEFAULT_VISIBLE_SHARE: VisibleShare = 'half';
export const VISIBLE_SHARE_LABELS: Record<VisibleShare, string> = {
  half: 'in more than half of its answers',
  two_thirds: 'in more than two-thirds of its answers',
  all: 'in every answer',
};
export function parseVisibleShare(v: unknown): VisibleShare {
  return (VISIBLE_SHARES as readonly string[]).includes(String(v)) ? (v as VisibleShare) : DEFAULT_VISIBLE_SHARE;
}
/** What a lead was judged under (outreach_leads.ai_visible_checked_rule): a change of either setting re-judges it. */
export const visibleRuleKey = (rule: VisibleRule, share: VisibleShare): string => `${rule}:${share}`;

/** Audits this far back are re-judged by the tick (a flagged lead is always re-judged when the rule changes). */
export const VISIBLE_RECHECK_DAYS = 30;

export function parseVisibleRule(v: unknown): VisibleRule {
  return (VISIBLE_RULES as readonly string[]).includes(String(v)) ? (v as VisibleRule) : DEFAULT_VISIBLE_RULE;
}

export interface EngineCount { named: number; answers: number }

/** Named in more than the threshold share of that engine's OWN answers; no answer → not named. Integer maths, no rounding. */
export function engineNamesThem(c: EngineCount | null | undefined, share: VisibleShare = DEFAULT_VISIBLE_SHARE): boolean {
  if (!c || !(c.answers > 0) || !(c.named > 0)) return false;
  if (share === 'all') return c.named >= c.answers;
  if (share === 'two_thirds') return c.named * 3 > c.answers * 2;
  return c.named * 2 > c.answers;
}

/** Is the lead Visible under this rule, from its newest audit's Gemini and Google AI counts? */
export function isVisible(s: { gemini: EngineCount | null; overview: EngineCount | null }, rule: VisibleRule, share: VisibleShare = DEFAULT_VISIBLE_SHARE): boolean {
  if (rule === 'off') return false;
  const g = engineNamesThem(s.gemini, share);
  const o = engineNamesThem(s.overview, share);
  return rule === 'both' ? g && o : g || o;
}

/** The counts from the newest audit's DONE queue rows (the chips' columns). */
export function visibleCounts(rows: ReadonlyArray<{ gemini_answered?: boolean | null; gemini_self_named?: boolean | null; overview_answered?: boolean | null; overview_self_named?: boolean | null }>): { gemini: EngineCount; overview: EngineCount } {
  const gemini = { named: 0, answers: 0 }; const overview = { named: 0, answers: 0 };
  for (const r of rows) {
    if (r.gemini_answered) { gemini.answers++; if (r.gemini_self_named) gemini.named++; }
    if (r.overview_answered) { overview.answers++; if (r.overview_self_named) overview.named++; }
  }
  return { gemini, overview };
}
