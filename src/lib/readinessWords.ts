/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHY A SALESPERSON WAS REFUSED — ONBOARDING, NOT "USAGE PAUSED" (final sales release, 2026-10-05; E2E-02).
   The bug: a salesperson whose onboarding is incomplete pressed Find Leads / Add lead / a campaign and read
   "Usage temporarily paused — contact Paul", which names the wrong cause.
   Two doors, one wording:
   • The edge functions now answer a not-ready refusal as error 'not_ready_to_sell' (_shared/protection.ts).
   • The database actions (claim, add lead, queue an opener, CSV import) still collapse every guard refusal
     into 'usage_paused'. guard_action checks SUSPENDED first and NOT ONBOARDED second, so for a salesperson
     whose OWN server-read status (my_onboarding_status) says not ready and not suspended, any guard refusal
     IS the onboarding one. Only then are the words swapped. ⛔ A genuine pause, emergency stop, limit or
     suspension keeps its own words; an unread / failed / loading status never turns into an onboarding claim.
   Wording only — the server already refused; nothing here allows or blocks anything.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { MISSING_KEY_WORDS, startsOnWords } from './salespersonOnboarding.ts';

/* Short words for what is still needed (the banner's list; the Team page keeps the full checklist labels). */
const SHORT_WORDS: Record<string, string> = {
  age_18: '18+ confirmed', right_to_work: 'Right to work', bank_details: 'Bank details', vat: 'VAT status',
  contractor_status: 'Individual or company', start_date: 'Start date', login: 'Your login', team_guide: 'Team guide',
};
/** Salesperson paperwork is handled outside LeadFinderOS — never listed, even if an older answer names it. */
const NEVER_LISTED: ReadonlySet<string> = new Set(['agreement', 'privacy_notice']);

export interface ReadinessSnapshot { gated: boolean; ready: boolean; missing: readonly string[]; startsOn: string | null; failed: boolean; loaded: boolean }

/** The missing items in plain words; a start date still to come reads "Starts on 12 October". */
export function missingItemWords(missing: readonly string[], startsOn: string | null = null, today?: string): string[] {
  return missing.filter((k) => !NEVER_LISTED.has(k)).map((k) =>
    k === 'not_started' && startsOn ? startsOnWords(startsOn, today) : SHORT_WORDS[k] ?? MISSING_KEY_WORDS[k] ?? k);
}

/** "Complete your onboarding before using Find Leads." (+ " Still needed: …" when known). */
export function notReadyMessage(feature: string | null, missing: readonly string[] = [], startsOn: string | null = null, today?: string): string {
  const head = `Complete your onboarding before using ${feature ?? 'this'}.`;
  const items = missingItemWords(missing, startsOn, today);
  return items.length ? `${head} Still needed: ${items.join(' · ')}.` : head;
}

/** Pure: is a guard refusal for this person the onboarding one? Positive match on a loaded, not-ready,
 *  not-suspended salesperson status — anything else (admin, ready, unread, failed, suspended) is not. */
export function refusalIsOnboarding(s: ReadinessSnapshot | null | undefined): boolean {
  return !!s && s.loaded && !s.failed && s.gated && !s.ready && s.missing.length > 0 && !s.missing.includes('suspended');
}

/* The signed-in person's last server-read readiness (written ONLY by useMyReadiness). Module state because the
   refusal mappers are pure functions called from many places; it decides words, never permission. */
let current: ReadinessSnapshot | null = null;
export function noteMyReadiness(s: ReadinessSnapshot | null): void { current = s; }
export function myReadinessSnapshot(): ReadinessSnapshot | null { return current; }

/** The onboarding sentence for a refusal the server collapsed to 'usage_paused' — or null to keep the
 *  original words (not a not-ready salesperson, or the status is not known). */
export function onboardingWordsForPausedRefusal(feature: string | null = null, s: ReadinessSnapshot | null = current): string | null {
  return refusalIsOnboarding(s) ? notReadyMessage(feature, s!.missing, s!.startsOn) : null;
}
