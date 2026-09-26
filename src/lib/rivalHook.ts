/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE COMPETITOR HOOK — three named rivals, or this template does not go out.

   `competitor_hook` names three real competing firms in the body ({{3}}, {{4}}, {{5}}). That is the
   whole point of it and it is also its whole risk: those three values are the only variables in the
   book whose CONTENT is a claim about somebody else's business, printed to a stranger.

   ⛔ A META PARAMETER MAY NEVER BE EMPTY, so "we only found two" cannot degrade — it is a rejected
   send (#132000-class), which is exactly how video_template failed for its whole life. There are
   only two honest outcomes: three real names, or a different message.

   ⛔ AND IT MUST NEVER PAD. "and others", "other firms", a repeated name — each turns a checkable
   statement ("they came back with X, Y and Z") into a vague one a prospect cannot verify, on the
   first message they ever get from us. The audit either supports the claim or it does not.

   ✅ SO THE ANSWER IS A FALLBACK, NOT A REFUSAL (Paul, 2026-09-14): a lead that cannot fill three
   names is sent `video_template` — the current, approved, video-header hook that needs no rivals at
   all. They get a message today rather than sitting in a queue waiting for someone to notice.

   🔴 MEASURED BEFORE BUILDING IT, and the shape of the data is why this is a fallback rather than a
   per-name top-up: across the 147 newest lead-linked audits with a completed run, the grouped rival
   list held THREE names 141 times, ZERO names 6 times, and one or two names NEVER. It is
   all-or-nothing, so a partial-fill path would be dead code guarding a case that does not occur.
   ⚠️ AND THE SIX ZEROES ARE NOT "AI NAMED NOBODY". Every one is run-level SUPPRESSION firing
   (competitorCleaning.ts) — AD Locksmithing's audit holds 106 genuine Newcastle locksmiths and is
   blanked because its cleaning receipt reads complete:false. So the 4% is the rate at which the
   SAFETY NET fires, not the rate at which AI declines to name anyone, and it will move if the
   cleaner's completeness improves. Do not quote it as a property of the market.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/* ⛔ THE FALLBACK IS ONLY LEGAL FOR A COLD TEMPLATE, AND THE RULE LIVES HERE SO BOTH SENDERS GET IT
   (2026-09-16). See the long note above rivalHookDecision. */
import { isColdOutreachTemplate } from "./coldOutreach.ts";

/** The template whose body names three competitors. Registered at Meta with a VIDEO header. */
export const RIVAL_HOOK_TEMPLATE = 'competitor_hook';

/* ⛔ THE FALLBACK IS video_template AND IT IS NAMED HERE, ONCE. Both senders read this constant, so
   the queue and the manual path cannot fall back to different messages — the rules-in-N-places
   failure this codebase has recorded five times. */
export const RIVAL_HOOK_FALLBACK = 'video_template';

/** How many rival names the body needs. Not tunable at a call site: it is the number of variables
 *  Meta has registered, so changing it means re-registering the template. */
export const RIVALS_REQUIRED = 3;

/** The variable names a template declares when its body names rivals, in body order. */
export const RIVAL_VARS = ['rival_1', 'rival_2', 'rival_3'] as const;

/** Does this template's declared variable list name rivals? Asked as a PROPERTY of the template,
 *  never as `name === 'competitor_hook'` — a guard written as a name expires silently the day the
 *  product moves, which is precisely how 16 cold sends walked past the phone-history seatbelt on
 *  2026-09-02 (CLAUDE.md §8). A second rival-naming template is covered by this the day it is
 *  registered. */
export function templateNeedsRivals(vars: readonly string[] | undefined | null): boolean {
  if (!vars) return false;
  return vars.some((v) => (RIVAL_VARS as readonly string[]).includes(v));
}

/** Usable rival names: collapsed, non-blank, de-duplicated (case-insensitively), capped at three.
 *  ⛔ DE-DUPLICATION IS A CORRECTNESS RULE, NOT TIDINESS. "Timpson" twice in the list would render
 *  "businesses including Timpson, Timpson and X" — visibly machine-made, and it would also mean the
 *  message claims three firms while naming two.
 *  ⚠️ The collapse mirrors formatCompetitors and templateBodyParams' own `forMeta`: Meta rejects the
 *  WHOLE send when any parameter carries a newline, a tab or 4+ consecutive spaces (#132018, which
 *  killed four live audit_reply sends on 2026-08-12 on a name that arrived as
 *  "Checkatrade\n    \n    If"). Three variables now carry extractor output instead of one, so the
 *  collapse happens where the names are CHOSEN as well as where they are sent. */
export function usableRivals(names: readonly (string | null | undefined)[] | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of names ?? []) {
    const n = String(raw ?? '').replace(/\s+/g, ' ').trim();
    if (!n) continue;
    const k = n.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(n);
    if (out.length >= RIVALS_REQUIRED) break;
  }
  return out;
}

export interface RivalHookDecision {
  /** The template to actually send. Unchanged when `held` — nothing is sent. */
  template: string;
  /** True when the requested template could not be filled and the fallback was substituted. */
  fellBack: boolean;
  /** True when it could not be filled AND no legal fallback exists, so NOTHING may go out. */
  held: boolean;
  /** Operator-facing explanation, empty when nothing changed. */
  reason: string;
}

/**
 * Which template should actually be sent, given what the audit could supply.
 *
 * ⛔ THE FALLBACK IS ONE-WAY AND NARROW: it fires ONLY for a template that needs rivals and cannot
 * get them. It never redirects anything else, and the fallback is never itself substituted — a
 * fallback that could fall back is a loop with a message at the end of it.
 * ⚠️ THE FALLBACK CAN STILL REFUSE, AND THAT IS NOT THIS FUNCTION'S JOB TO HIDE. video_template's
 * body says "for a {{2}}", so its own vowel-sound rule holds an accountant or an electrician — a
 * lead that falls back for want of rivals AND is held by that rule is genuinely unsendable today,
 * and the sender reports it as the hold it is rather than as a silent drop.
 *
 * 🔴 AND A CONTINUATION HAS NO LEGAL FALLBACK, SO IT HOLDS (2026-09-16). `video_template` is a COLD
 * opener — "is this the right number", a video header, written for a stranger. Substituting it for
 * a template written to CONTINUE a conversation is wrong twice over:
 *   1. THE COPY. It is sent to somebody who has already answered us, so it reads as a machine that
 *      has forgotten the conversation it is in.
 *   2. THE SEATBELT, AND THIS IS THE HALF THAT MAKES IT A BUG RATHER THAN A STYLE OPINION.
 *      send-whatsapp-message runs `isColdOutreachTemplate` ONCE, above every branch, on the
 *      REQUESTED name — and the substitution happens later, inside the audit branch. So a
 *      continuation passes the check and then a COLD template goes out to a number already in
 *      conversation, with the one guard written for exactly that mistake already behind it. That
 *      is the 2026-09-02 incident's shape (CLAUDE.md §4: a guard keyed to today's instance), and
 *      re-running the check after the swap would only convert it into a confusing refusal —
 *      "phone_already_contacted" for a template the operator never chose.
 * ⛔ SO THE TEST IS THE PROPERTY, NOT THE NAME. Any continuation that names rivals holds; any cold
 * one falls back. A rival-naming template registered tomorrow is covered the day it is classified
 * in CONTINUATION_TEMPLATES, which it must be anyway before it can reach a live thread.
 * ⚠️ HOLDING IS THE RIGHT ANSWER HERE AND WOULD BE THE WRONG ONE FOR THE DRIP. A continuation is
 * sent BY HAND from the Inbox: a person is looking at the thread, so a refusal naming the reason is
 * an answer at the moment of the decision, not a lead stuck in a queue nobody is watching. That is
 * the same reasoning process-whatsapp-queue's FIRST-REPLY lane already wrote down for itself; this
 * makes it a property of the template instead of a property of the lane.
 */
export function rivalHookDecision(
  templateName: string,
  needsRivals: boolean,
  rivalCount: number,
): RivalHookDecision {
  if (!needsRivals || rivalCount >= RIVALS_REQUIRED) {
    return { template: templateName, fellBack: false, held: false, reason: '' };
  }
  const short =
    `${templateName} names ${RIVALS_REQUIRED} competitors and this lead's audit could supply ` +
    `${rivalCount}. An empty competitor is rejected by Meta and a padded one is a claim we cannot show.`;
  if (!isColdOutreachTemplate(templateName)) {
    return {
      template: templateName,
      fellBack: false,
      held: true,
      reason:
        `${short} It continues an existing conversation, so there is no cold template to send ` +
        `instead — ${RIVAL_HOOK_FALLBACK} would open as though we had never spoken. Nothing was sent; ` +
        `pick another template or re-run the audit.`,
    };
  }
  return {
    template: RIVAL_HOOK_FALLBACK,
    fellBack: true,
    held: false,
    reason: `${short} Sent ${RIVAL_HOOK_FALLBACK} instead.`,
  };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   A BUSINESS IS NEVER ITS OWN RIVAL.

   🔴 MEASURED 2026-09-15, AND IT WAS LIVE ON competitor_hook — not a risk introduced by the new
   audit_followup. Driving the real selection (count -> groupNames -> rank -> top 3) over every
   audit on file: **26 of 1,145 audits with stored competitors named their own business in the
   three that get sent, and all 26 were attached to a lead**, so every one was sendable. The
   plainest are exact — "Appleyard Locksmiths", "Moore Secure Locksmiths", "Strongs Locksmiths
   Services", "All Access Locksmith Middlesbrough Door & Window Repair" each sat in their own top
   three. The message reads "I asked chatgpt for a locksmith in Middlesbrough, it came back with
   X, YOU and Z", sent to them.

   ⛔ THE OLD PROTECTION WAS cleanNames AT AUDIT TIME AND IT DOES NOT HOLD: 241 stored competitor
   names across the book match their own audited business under nameMatches. Paul's instruction was
   to prove that rather than trust it, and this is what the proof found.

   ⛔ IT IS A LEAF SO IT CAN BE TESTED WITHOUT A DATABASE. resolveAuditReplyVars needs a supabase
   client to reach, so a rule written inline there is a rule nothing asserts.

   ⛔ IT NEVER TOPS UP. Removing a self-match can leave fewer than three names, and that is already
   handled: rivalHookDecision sends video_template instead. Reaching further down the ranked list
   to refill would substitute weaker evidence for the name we removed and turn a checkable claim
   into a vague one. (Measured: on the real book this costs NOTHING — 0 audits drop below three.)
   ⚠️ nameMatches BOTH WAYS. A Google listing and an extracted mention are not written alike:
   "Norwich Plumber" and "Norwich Plumbing Services" are the same operator written two ways, and
   only one direction catches each.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Does this candidate name the audited business itself? */
export function isSelfRival(
  candidate: string | null | undefined,
  business: string | null | undefined,
  matches: (haystack: string, name: string) => boolean,
): boolean {
  const c = String(candidate ?? '').trim();
  const b = String(business ?? '').trim();
  if (!c || !b) return false;   // nothing to compare is not evidence of a match
  return matches(c, b) || matches(b, c);
}

/**
 * Drop any candidate that names the audited business.
 *
 * ⛔ `matches` IS INJECTED RATHER THAN IMPORTED, and that is deliberate: nameMatches lives in a
 * module this leaf must not depend on (it is imported by SPA and edge alike), and injecting it
 * means the test drives the REAL predicate rather than a reimplementation of it.
 * ⚠️ AN EMPTY BUSINESS NAME FILTERS NOTHING. Absence is not a licence to strip the list — with no
 * name to compare against there is no evidence anything is a self-match.
 */
export function excludeSelfRivals(
  pool: readonly (string | null | undefined)[] | null | undefined,
  business: string | null | undefined,
  matches: (haystack: string, name: string) => boolean,
): string[] {
  const list = (pool ?? []).map((c) => String(c ?? '').trim()).filter(Boolean);
  if (!String(business ?? '').trim()) return list;
  return list.filter((c) => !isSelfRival(c, business, matches));
}

/* ── WHICH ENGINE A TEMPLATE SAYS IT ASKED (Paul, 2026-09-26) ─────────────────────────────────────
   Since the six-result hook, the rival names a template carries are ONE engine's answer to ONE
   question (resolveAuditReplyVars reads the hook pick's own cell). Most registered bodies attribute
   the answer generically ("i asked AI", "AI tools like ChatGPT", "ChatGPT and Gemini"), and those
   stay true whichever engine the hook came from. A body that names ONE engine as the one it asked
   does not: audit_followup's approved text is "I asked chatgpt … It came back with {{3}}…", so a
   Google AI hook's names under it would be a false statement to a stranger.
   ⛔ So such a template is REFUSED for a hook from another engine, never re-worded (the words are
   Meta's) and never re-sourced from a different engine's answer (that would break the
   question + engine + competitors pairing). The map says what each REGISTERED body claims. A new
   single-engine body must be added here, and scripts/hook-score.test.ts scans the bodies for it. */
export const TEMPLATE_SINGLE_ENGINE_CLAIM: Readonly<Record<string, string>> = {
  audit_followup: 'chatgpt',
};

const ENGINE_WORDS: Record<string, string> = { chatgpt: 'ChatGPT', gemini: 'Google AI' };

/** Null when the template can carry this hook's rivals truthfully. Otherwise the refusal reason. */
export function templateEngineConflict(templateName: string | null | undefined, hookEngine: string | null | undefined): string | null {
  if (!templateName || !hookEngine) return null;
  const claimed = TEMPLATE_SINGLE_ENGINE_CLAIM[templateName];
  if (!claimed || claimed === hookEngine) return null;
  const said = ENGINE_WORDS[claimed] ?? claimed;
  const got = ENGINE_WORDS[hookEngine] ?? hookEngine;
  return `hook_engine_mismatch: ${templateName}'s approved wording says it asked ${said}, but this lead's hook ` +
    `search was measured on ${got}, so its competitors cannot be attributed to ${said}. Send a template ` +
    `that does not name one engine instead.`;
}
