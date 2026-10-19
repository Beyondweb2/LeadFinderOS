/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE OFFER FACT SHEET — the ONLY things a reply draft may say about the offer (Paul, 2026-10-20).

   Versioned (FACT_SHEET_VERSION). Built from the LIVE Client Service Agreement v5 (src/lib/clientAgreement.ts,
   CLIENT_AGREEMENT_VERSION). Where Paul's brief and v5 differ, v5 wins and the difference is listed in
   FACT_SHEET_CONFLICTS for Paul to decide. scripts/offer-fact-sheet.test.ts pins every figure to the agreement text.

   ⛔ A draft may state an offer fact ONLY from an entry here with status 'live'. Anything else (a question the
      sheet does not answer) is "Needs you" (replyMove.ts). Never "unlimited", never monthly audits or a fixed amount
      of monthly work (v5 2.6 / 2.7 only say regular review and that we MAY give monthly updates).
   ⛔ CASE STUDIES ARE DRAFTS. None is used in a reply until Paul approves it with permission, evidence and the exact
      quote (caseStudyUsable). Today none is.
   ⛔ The guarantee line is quoted word for word (GUARANTEE_LINE) and never reworded into a ranking, citation or
      recommendation promise.

   Pure and edge-reachable: relative imports with .ts, no Deno, no DOM.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  FINDABLE_SETUP_PRICE_GBP, FINDABLE_MONTHLY_GBP, FINDABLE_BUILD_TOTAL_PAYMENTS, FINDABLE_CONTINUING_GBP,
  FINDABLE_CONTACT_EMAIL, REMEASURE_WEEKS_STANDARD,
} from './findableOffer.ts';

export const FACT_SHEET_VERSION = '2026-10-20.1';
/** The agreement this sheet follows. A new agreement version needs a new sheet version (the test checks). */
export const FACT_SHEET_AGREEMENT = 'v5';

/** Paul's guarantee line, word for word. v5 5.4: the £99 initial payment back if the count is not higher. */
export const GUARANTEE_LINE = 'We improve AI visibility or you get your money back.';

/** The ONE way a reply names the measured engines. v5 2.2 says "ChatGPT and Google AI / Gemini"; the drafter says
 *  "Gemini" (never "google ai"). See FACT_SHEET_CONFLICTS: engine-wording. */
export const ENGINE_WORDING = 'ChatGPT and Gemini';

export type FactTopic =
  | 'price' | 'monthly_start' | 'term' | 'cancel' | 'guarantee' | 'measurement' | 'domain' | 'ownership'
  | 'after_term' | 'build_time' | 'client_needs' | 'changes' | 'what_we_do' | 'provider';

export interface Fact {
  topic: FactTopic;
  /** What a reply may say, in Paul's register. Sentence case; the drafter tidies capitals anyway. */
  say: string;
  /** Where it comes from: the v5 clause(s), or 'paul' for Paul's own operational word (not in the agreement). */
  source: string;
  status: 'live' | 'draft';
  /** Answered, but Paul should look before it goes (a contract-exit question): the conversation is flagged "Needs you". */
  paulLooks?: boolean;
}

const gbp = (n: number) => (Number.isInteger(n) ? `£${n}` : `£${n.toFixed(2)}`);

export const FACT_SHEET: readonly Fact[] = [
  { topic: 'price', status: 'live', source: 'v5 3.1, 4.1',
    say: `It's ${gbp(FINDABLE_SETUP_PRICE_GBP)} to start, then ${gbp(FINDABLE_MONTHLY_GBP)} a month, ${FINDABLE_BUILD_TOTAL_PAYMENTS} payments in total including the first one.` },
  { topic: 'monthly_start', status: 'live', source: 'v5 5.6',
    say: `The monthly ${gbp(FINDABLE_MONTHLY_GBP)} only starts after your results and the 14 day refund window, so nothing more is taken until you've seen whether it worked.` },
  { topic: 'term', status: 'live', source: 'v5 4.1',
    say: `The minimum is ${FINDABLE_BUILD_TOTAL_PAYMENTS} payments, counting the first ${gbp(FINDABLE_SETUP_PRICE_GBP)}. It's not a cancel any time plan.` },
  { topic: 'cancel', status: 'live', source: 'v5 4.2, 5.5', paulLooks: true,
    say: `It's a ${FINDABLE_BUILD_TOTAL_PAYMENTS} payment minimum, so ending early leaves those payments due. The exception is the guarantee: if the number hasn't gone up at the re-check you can claim your ${gbp(FINDABLE_SETUP_PRICE_GBP)} back and it ends there.` },
  { topic: 'guarantee', status: 'live', source: 'v5 5.2 to 5.5',
    say: `${GUARANTEE_LINE} We count how many AI answers name you before we start and again after ${REMEASURE_WEEKS_STANDARD} weeks on the same questions. If that number hasn't gone up, you get your ${gbp(FINDABLE_SETUP_PRICE_GBP)} back.` },
  { topic: 'measurement', status: 'live', source: 'v5 2.2, 5.2, 5.3',
    say: `We ask 20 real customer style questions, 3 times each, on ${ENGINE_WORDING}, then ask the same ones again about ${REMEASURE_WEEKS_STANDARD} weeks later.` },
  { topic: 'domain', status: 'live', source: 'v5 9.1',
    say: `Your domain is always yours. We'd just need you to be able to point it at the new site or move it over.` },
  { topic: 'ownership', status: 'live', source: 'v5 4.3, 8.1, 8.4',
    say: `The site becomes yours once all ${FINDABLE_BUILD_TOTAL_PAYMENTS} payments are made. Your domain, logo and photos stay yours the whole time.` },
  { topic: 'after_term', status: 'live', source: 'v5 9A.2, 9A.5',
    say: `After payment ${FINDABLE_BUILD_TOTAL_PAYMENTS} it stops, nothing carries on by itself. If you want us to keep hosting it there's an optional ${gbp(FINDABLE_CONTINUING_GBP)} a month, and I'll remind you before payment ${FINDABLE_BUILD_TOTAL_PAYMENTS}.` },
  { topic: 'build_time', status: 'live', source: 'paul',
    say: `The build usually takes a few days once we have what we need from you.` },
  { topic: 'client_needs', status: 'live', source: 'v5 7.1, 1.6',
    say: `Just the services and areas you want to be found for, access to point or move your domain, and manager access on your Google Business Profile.` },
  { topic: 'changes', status: 'live', source: 'v5 16.3, 16.6',
    say: `If you ever want something changed you just email me at ${FINDABLE_CONTACT_EMAIL}.` },
  { topic: 'what_we_do', status: 'live', source: 'v5 2.1, Schedule 1',
    say: `We build you a new site set up so AI tools and Google can clearly see what you do and where, then measure before and after.` },
  { topic: 'provider', status: 'live', source: 'v5 1.6, 7.2', paulLooks: true,
    say: `If someone else looks after your site that's fine, as long as you're free to leave them. If you're tied into a contract we can't take you on.` },
];

/** The live answer for a topic, or null (null = the sheet does not say it → Needs you). */
export function factFor(topic: FactTopic): Fact | null {
  return FACT_SHEET.find((f) => f.topic === topic && f.status === 'live') ?? null;
}

/* ── case studies: DRAFT until Paul approves each one ─────────────────────────────────────────── */

export interface CaseStudy {
  id: string;
  /** What Paul's brief names. Never used in a reply while any approval field is missing. */
  label: string;
  status: 'draft' | 'approved';
  /** Written permission from the client to use their name / result (v5 8.9 allows naming a client unless they object). */
  permission: string | null;
  /** Where the number or claim is recorded (an audit id, a report, a screenshot). */
  evidence: string | null;
  /** The exact words a reply may use, approved by Paul. */
  quote: string | null;
}

export const CASE_STUDIES: readonly CaseStudy[] = [
  { id: 'ablm', label: 'ABLM: 0 to 3 of 18 named, all Gemini, on town pages (one client, evidence not proof)', status: 'draft', permission: null, evidence: null, quote: null },
  { id: 'mcl', label: 'MCLocksmiths: moved off a £69/month rented site (service ended early)', status: 'draft', permission: null, evidence: null, quote: null },
  { id: 'bs4', label: 'BS4 Electrical: site owner, still a client', status: 'draft', permission: null, evidence: null, quote: null },
  { id: 'review', label: 'One good client review (not chosen yet)', status: 'draft', permission: null, evidence: null, quote: null },
];

/** ⛔ POSITIVE: usable only when approved AND every approval field is filled. */
export function caseStudyUsable(c: CaseStudy): boolean {
  return c.status === 'approved' && !!c.permission?.trim() && !!c.evidence?.trim() && !!c.quote?.trim();
}

/* ── what the sheet means for the drafter ─────────────────────────────────────────────────────── */

/** The sheet as the model sees it: live facts only, never a draft case study. */
export function factSheetForPrompt(topics?: readonly FactTopic[]): string {
  const rows = FACT_SHEET.filter((f) => f.status === 'live' && (!topics || topics.includes(f.topic)));
  return rows.map((f) => `- ${f.topic}: ${f.say}`).join('\n');
}

/** Money figures the sheet allows a draft to state (the checker warns on any other £ figure). */
export const SHEET_MONEY = [FINDABLE_SETUP_PRICE_GBP, FINDABLE_MONTHLY_GBP, FINDABLE_CONTINUING_GBP].map(gbp);

/* ── gaps and conflicts, for Paul (shown in the report and docs) ──────────────────────────────── */

export const FACT_SHEET_CONFLICTS: readonly { id: string; brief: string; agreement: string; sheetSays: string }[] = [
  { id: 'monthly-start', brief: '£99/month from 42 days later', agreement: 'v5 5.6: the day after the 14-day Refund Window that follows the Results Date (6 weeks after the payment only when the guarantee does not apply)', sheetSays: 'after your results and the 14 day refund window' },
  { id: 'term-words', brief: '12-month minimum', agreement: 'v5 4.1: 12 payments (the release note says count payments, not months)', sheetSays: '12 payments in total including the first one' },
  { id: 'guarantee-line', brief: '"We improve AI visibility or you get your money back."', agreement: 'v5 5.4: refund of the £99 initial payment if the count is not higher; 6.2 no other result is promised', sheetSays: 'the line, then the £99 detail' },
  { id: 'engine-wording', brief: 'one engine wording', agreement: 'v5 2.2 / 5.2: "ChatGPT and Google AI / Gemini"; code since 2026-10-19 also counts Google AI (AI Overview) for new clients; the drafter says "Gemini" and flags "google ai"', sheetSays: ENGINE_WORDING },
  { id: 'build-time', brief: 'build usually takes a few days', agreement: 'not in v5', sheetSays: 'usually a few days (marked as Paul\'s word)' },
  { id: 'reminder-12', brief: 'reminder before payment 12', agreement: 'v5 9A.5 promises it; fn month12-reminder sends it, behind the month12_reminder_settings.enabled switch', sheetSays: 'I\'ll remind you before payment 12' },
  { id: 'case-studies', brief: 'ABLM, MCL, BS4, one review', agreement: 'v5 8.9 allows naming a client unless they object', sheetSays: 'none used until Paul approves each with permission, evidence and quote' },
];
