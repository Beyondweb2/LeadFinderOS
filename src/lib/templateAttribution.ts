/* ============================================================
   PER-TEMPLATE ATTRIBUTION — which message earned the reply, and which one earned the open.

   ⛔ THE CARD USED TO SAY THIS WAS IMPOSSIBLE, AND THAT NOTE WAS ABOUT A DIFFERENT METHOD.
   The old per-template "replied" was `hasThisLeadEverReplied`, intersected with each template's
   lead set — so a lead who answered the opener was counted as having answered the pitch, the
   sign-up link and everything else they were ever sent. Every row claimed the same replies. That
   is genuinely unusable, and removing it was right.
   What is buildable — and is what this file does — is LAST-TOUCH attribution: a reply belongs to
   the newest real templated send that preceded it, and any inbound message CLOSES the run, because
   once someone has answered, the next send is a new question rather than a competing one.

   ⚠️ MEASURED BEFORE IT WAS BUILT, over every message in the book (2026-09-05): 757 credited
   lead+template pairs, of which 725 are unambiguous and 32 (4%) are not. "Ambiguous" has an exact
   meaning here — 2+ DIFFERENT templates went out with no reply between them, so nobody can know
   which one the reply answers. It is not a guess about intent; it is a fact about the sequence.
     initial_contact    530 credited, 0 ambiguous
     audit_reply        191 credited, 10 ambiguous
     contact_followup    20 credited, 20 ambiguous  <- ALL of them, by construction
     audit_result_hook    5 credited, 0 ambiguous
   ⛔ contact_followup IS THE CASE THAT MUST NEVER BE PRESENTED AS CLEAN. A chase only exists
   because the opener got no answer, so every reply to it follows two templates with nothing in
   between, and last-touch hands the credit to the chase. That may well be right — the chase is
   what unstuck it — but the caller MUST surface the contested count beside the rate. Returning the
   number without `repliedAmbiguous` would make a 26% chase rate look as solid as a 52% opener.
   That is why `repliedAmbiguous` is not optional in the return shape.

   ⚠️ WHY NOT REQUIRE A REPLY WITHIN N MINUTES: measured, the gap from the credited send to the
   reply is p10 1 min, median 8 min, p90 210 min — a long tail with no natural cut. Any window
   would be invented, and a cut-off would silently drop the slow repliers, who are the ones a chase
   is aimed at. Sequence is a fact; a time window would be a guess.
   ============================================================ */
import { isRealSend } from './realSend';
import { looksAutomated } from './inboundClassify';

/** The shape both folds need. Deliberately structural, not the DB row type: this file is pure and
 *  must be drivable from a test without a Supabase type in sight. */
export interface AttributableMsg {
  direction: string | null;
  template_name: string | null;
  status: string | null;
  created_at: string;
  body: string | null;
}

export interface ReplyCredit {
  /** The template the reply is credited to. */
  template: string;
  /** True when 2+ different templates went out with no inbound between them, so which one earned
   *  the reply is unknowable and this credit is last-touch by rule rather than by evidence. */
  ambiguous: boolean;
}

/* ⚠️ A PLAIN BOOLEAN, DELIBERATELY NOT A TYPE PREDICATE. Written as
   `m is AttributableMsg & { template_name: string }`, TypeScript narrows the ELSE branch of every
   `if (isTemplatedSend(m))` to `never` — subtracting the intersection leaves nothing — so the
   inbound handling below stopped type-checking at all. The predicate bought one avoided `!` and
   cost the rest of the function. */
const isTemplatedSend = (m: AttributableMsg): boolean =>
  m.direction === 'outbound' && !!m.template_name && isRealSend(m.status);

/**
 * Credit one lead's replies to templates, last-touch.
 *
 * Takes that lead's messages in ascending time order (both directions) and returns at most one
 * credit per template — a lead who answers the same template twice is one replier, not two, because
 * every rate on the card is per-LEAD.
 *
 * ⚠️ A reply before any templated send earns nothing rather than being dropped into the first
 * template that happens to come later. Inbound-first conversations are real (someone messages us
 * cold), and crediting a template that had not been sent yet would be inventing a reply.
 */
export function creditRepliesByTemplate(msgs: AttributableMsg[]): ReplyCredit[] {
  const credits: ReplyCredit[] = [];
  const seen = new Set<string>();
  /* The run of templated sends since the last inbound. Its LAST entry takes the credit; more than
     one DISTINCT name in it is exactly what "ambiguous" means. */
  let run: string[] = [];

  for (const m of msgs) {
    if (isTemplatedSend(m)) { run.push(m.template_name!); continue; }
    if (m.direction !== 'inbound') continue;
    /* An auto-responder is not an answer — the same looksAutomated() the auto-pitch rule uses, so
       the sender and the dashboard agree on what a human is. It also must NOT close the run: a
       booking bot replying instantly would otherwise absolve the next send of competing with the
       one before it. */
    if (looksAutomated(m.body ?? '')) continue;
    if (run.length > 0) {
      const template = run[run.length - 1];
      if (!seen.has(template)) {
        seen.add(template);
        credits.push({ template, ambiguous: new Set(run).size > 1 });
      }
    }
    run = [];
  }
  return credits;
}

/**
 * Which report-link template earned this lead's report open.
 *
 * `firstOpenedAt` is the earliest first_opened_at across the lead's audits, in ms. Returns the
 * newest report-link template sent at or before it, or null when none was.
 *
 * ⛔ THE SLACK IS NOT A FUDGE FACTOR. The send timestamp is Meta's receipt and the open timestamp is
 * our own renderer's clock; a prospect who taps the instant it arrives can legitimately record an
 * open a few seconds "before" the send. Without it those genuine opens fall into the operator
 * bucket and understate the rate.
 */
export const OPEN_ATTRIBUTION_SLACK_MS = 60_000;

/* ⛔ THE ONE REPORT-LINK TEMPLATE SET, AND THE ONE SITE-TRACKING START. Both moved here from
   useCampaignStats 2026-09-16 so the campaign card and the Inbox engagement pills read the SAME
   source rather than two drifting copies (there were already two: useCampaignStats and Inbox.tsx).
   A report-carrying template forgotten here silently moves that template's real opens into the
   "not attributable" bucket AND drops the Inbox AUDIT pill for those leads — the same failure the
   campaign card's own comment records, now in one place. */
export const REPORT_LINK_TEMPLATES: ReadonlySet<string> = new Set([
  'audit_reply', 'video_template', 'free_check_result', 'audit_reply_warm', 'competitor_hook', 'audit_followup',
]);

/* The day page-hit logging went live (findable-onboarding's prefill hook). Every site-visit read is
   measured from here: a send/hit that predates it could not have been counted. Midnight AFTER the
   deploy on 2026-09-05, so no partial first day inflates a rate; London is UTC+1 in September and
   the send window is 07:00-21:30 London, so a UTC-midnight boundary never splits a day. Do not
   "refresh" it and do not derive it from the earliest row (an empty first week would move it
   forward and inflate every rate). */
export const SITE_TRACKING_START = Date.parse('2026-09-06T00:00:00Z');

/**
 * Per-lead engagement for the Inbox pills, from the SAME source the campaign card attributes by.
 *
 * AUDIT pill — the prospect opened their report link. Reads ai_audits.first_opened_at (set once,
 * coalesced) with open_count > 0, and only counts it when the open happened at/after the earliest
 * report-link send to this lead (minus the slack) — the exact rule that separates a real open from
 * an OPERATOR PREVIEW, since both hit the same URL and bump the same counter. No report-link send
 * on record → null: an open we cannot tie to a send we made is not shown as "they opened it".
 * Returns the earliest qualifying open, ISO, or null.
 */
export function leadReportOpenedAt(
  audits: ReadonlyArray<{ open_count: number | null; first_opened_at: string | null }>,
  earliestReportLinkSentMs: number | null,
): string | null {
  if (earliestReportLinkSentMs == null) return null;
  let best: number | null = null;
  for (const a of audits) {
    if ((a.open_count ?? 0) <= 0 || !a.first_opened_at) continue;
    const t = Date.parse(a.first_opened_at);
    if (Number.isNaN(t)) continue;
    if (t >= earliestReportLinkSentMs - OPEN_ATTRIBUTION_SLACK_MS && (best == null || t < best)) best = t;
  }
  return best == null ? null : new Date(best).toISOString();
}

/**
 * SITE pill — the prospect clicked through to findable.live's sign-up page. Reads lead_page_hits
 * (written by findable-onboarding's prefill hook), counting only hits at/after SITE_TRACKING_START
 * for the same reason the campaign card does. Returns the earliest qualifying hit, ISO, or null.
 */
export function leadSiteVisitedAt(pageHitIsos: ReadonlyArray<string>): string | null {
  let best: number | null = null;
  for (const iso of pageHitIsos) {
    const t = Date.parse(iso);
    if (Number.isNaN(t) || t < SITE_TRACKING_START) continue;
    if (best == null || t < best) best = t;
  }
  return best == null ? null : new Date(best).toISOString();
}

export function creditOpenToTemplate(
  msgs: AttributableMsg[],
  reportTemplates: ReadonlySet<string>,
  firstOpenedAt: number | null,
): string | null {
  return creditEventToTemplate(msgs, firstOpenedAt, reportTemplates);
}

/**
 * Credit a dated EVENT (a site visit, a questionnaire submission, a report open) to the newest real
 * templated send that preceded it.
 *
 * `restrictTo` narrows the candidates — a report open can only belong to a template that carried a
 * report link. Omit it and ANY template can take the credit, which is right for a site visit: a
 * prospect who lands on the sign-up page may have got there from the report link, from an
 * onboarding link, or by typing the address after reading any message at all. Last touch is the
 * honest answer to "which message was in front of them when they went".
 *
 * ⛔ RETURNS null WHEN NOTHING PRECEDED THE EVENT, AND THAT IS NOT THE SAME AS ZERO. A visit with
 * no send before it was not driven by outreach; crediting it to whatever template came LATER would
 * invent a click. Callers must keep those out of the numerator rather than defaulting them
 * somewhere convenient.
 */
export function creditEventToTemplate(
  msgs: AttributableMsg[],
  atMs: number | null,
  restrictTo?: ReadonlySet<string>,
): string | null {
  if (atMs === null) return null;
  let credited: string | null = null;
  for (const m of msgs) {
    if (!isTemplatedSend(m)) continue;
    if (restrictTo && !restrictTo.has(m.template_name!)) continue;
    if (new Date(m.created_at).getTime() - OPEN_ATTRIBUTION_SLACK_MS <= atMs) {
      credited = m.template_name!;   // keep walking: the NEWEST qualifying send wins
    }
  }
  return credited;
}
