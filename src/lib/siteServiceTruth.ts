/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SITE SERVICE TRUTH — WORKSTREAM 4's "what the client actually does" fed into WORKSTREAM 6's site
   scope (wave 1 integration, 2026-10-04; docs/pre-sales-certification/wave1-integration.md).

   ⛔ THE ORDER OF TRUST, ONE RULE (serviceScope.resolveServiceTruth — never a second ranking here):
        CLIENT-CONFIRMED BUSINESS TRUTH (their onboarding answer, a build fact Paul VERIFIED)
          outranks SALES NOTES (outreach_leads.services_included)
          outranks DISCOVERY / GENERATED QUESTIONS (never a source of services at all).
      The highest-ranked non-empty list wins WHOLE; the client's explicit "we do NOT offer" list is a hard
      exclusion everywhere.

   What each consumer takes from here:
     · Website Build (siteGate.ts siteIntentMap / siteScopeFromBuild): a PLANNED service page only owns
       baseline questions when the service is one the client confirmed (serviceConfirmed); the
       not-offered list joins the scope's `excluded`. A baseline question about an unconfirmed service
       therefore never seeds a page — it is UNOWNED with its reason, for Paul.
     · The page generator (Q&A + page-plan queue): the service list is the truth list, the not-offered
       list joins the refusal, and a MEASURED question that names something the client never confirmed
       gets no page (measuredQuestionRefusal).

   ⚠️ WHY TWO JUDGES, NOT ONE. serviceScope.questionScope decides whether a question may enter the
      MEASUREMENT (deliberately blunt: a verb form it does not know reads as "unsupported"). Pointing a
      measured question at a page is WS-6's classifyQuestion (work families: "boiler installation" is not
      the servicing page). This module asks WS-4's rule only about SERVICE NAMES (is this planned page a
      service the client does?) and asks WS-6's classifier about QUESTIONS — each rule where it is precise.
   Pure. ⚠️ Edge-reachable (page-generator): relative imports with .ts only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { buildServiceScope, questionScope, resolveServiceTruth, splitServiceList, type ServiceTruth } from './serviceScope.ts';
import { classifyQuestion, excludedFromText, type SiteScope } from './siteScope.ts';

export interface SiteTruthInput {
  /** onboarding_responses.services_list — the client's ticked list. */
  onboardingList?: unknown;
  /** onboarding_responses.services — the same answer typed. */
  onboardingText?: unknown;
  /** A Client Build Fact (key `services`) Paul has VERIFIED. */
  verifiedServices?: unknown;
  /** outreach_leads.services_included — Sales notes. Usable, never "client-confirmed". */
  leadServices?: unknown;
  /** onboarding_responses.services_not_offered — the client's explicit negatives. */
  notOffered?: unknown;
  /** onboarding_responses.must_not_say — its "no X" phrases are negatives too (siteScope.excludedFromText). */
  mustNotSay?: unknown;
  trade: string;
  towns: readonly string[];
}

export interface SiteTruth {
  truth: ServiceTruth;
  /** Everything never to be written about: the not-offered list + must-not-say's "no X" phrases. */
  excluded: string[];
  trade: string;
  towns: string[];
}

export function siteServiceTruth(i: SiteTruthInput): SiteTruth {
  const truth = resolveServiceTruth({
    onboardingList: i.onboardingList, onboardingText: i.onboardingText, buildFacts: i.verifiedServices, lead: i.leadServices, notOffered: i.notOffered,
  });
  const excluded = [...new Map([...truth.notOffered, ...excludedFromText(String(i.mustNotSay ?? ''))].map((x) => [x.toLowerCase(), x])).values()];
  return { truth, excluded, trade: String(i.trade ?? ''), towns: [...new Set((i.towns ?? []).map((t) => String(t ?? '').trim()).filter(Boolean))] };
}

/**
 * Is this service (a planned page, by its name and its catalogue synonyms) one the client confirmed?
 * ⛔ POSITIVE MATCH. No truth list at all → false (absence is never "offered"). Any name or synonym the
 *    client said they do NOT offer → false (the negative wins). Otherwise the NAME may be a confirmed
 *    service or a plain trade name ("Locksmith services"); a SYNONYM counts only as a confirmed SERVICE —
 *    a generic synonym ("emergency locksmith") must not vouch for a page the client never confirmed.
 */
export function serviceConfirmed(name: string, aliases: readonly string[], t: SiteTruth): boolean {
  if (!t.truth.services.length) return false;
  const scope = buildServiceScope({ services: t.truth.services, notOffered: t.truth.notOffered, trade: t.trade, towns: t.towns });
  const verdicts = [name, ...aliases].filter((x) => String(x ?? '').trim()).map((x) => questionScope(x, scope).verdict);
  if (!verdicts.length || verdicts.includes('not_offered')) return false;
  if (verdicts[0] === 'service' || verdicts[0] === 'core') return true;
  return verdicts.slice(1).includes('service');
}

/** A SiteScope built from the truth alone — for a surface with no page plan (the page generator). Price and
 *  out-of-hours words are NOT judged here (the Q&A guards and namesExcluded own those); this scope answers
 *  only "does this question name something the client never confirmed, or a town they do not serve?". */
export function truthSiteScope(t: SiteTruth, extra: { homeTown: string; businessName: string }): SiteScope {
  return {
    services: t.truth.services.map((name) => ({ name, aliases: [] })),
    excluded: t.excluded, towns: t.towns, homeTown: extra.homeTown,
    trade: t.trade ? [t.trade] : [], businessName: extra.businessName,
    pricesVerified: true, outOfHoursVerified: true,
  };
}

/** Why a MEASURED question may not seed a page (null = it may). Names a not-offered service, something no
 *  confirmed service accounts for, or a town not served → refused with the classifier's own reason. */
export function measuredQuestionRefusal(question: string, scope: SiteScope): string | null {
  const c = classifyQuestion(question, scope);
  return c.kind === 'unowned' ? c.reason : null;
}

/** The client's explicit negatives as one line for a prompt ('' when there are none). */
export const notOfferedLine = (t: SiteTruth) => splitServiceList(t.truth.notOffered).join(', ');
