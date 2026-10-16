/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE SIMPLE ONBOARDING'S NEW ANSWERS (findable.live, 2026-10-16) — read once, shown once.

   The simple findable.live onboarding asks two things LeadFinderOS did not store before
   (migration 20261103090000):
     design_choice         'keep'  = keep the look of their current site
                           'improve' = let Findable improve the design
     agency_contract_ends  the date a client still tied into an agency contract says it ends
   (access_ack_at is stamped by findable-checkout, not read from an answer.)

   ⛔ ANYTHING ELSE STORES NULL. An unknown design value or a date that is not a real yyyy-mm-dd day is
   not an answer — null, never a guess. Same rule as findable-site's cleanContractEnd.
   Pure; reached from edge functions (findable-onboarding): explicit .ts on relative imports only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export type DesignChoice = 'keep' | 'improve';

export function readDesignChoice(v: unknown): DesignChoice | null {
  return v === 'keep' || v === 'improve' ? v : null;
}

/** A strict yyyy-mm-dd that is a real calendar day ("2026-02-30" is not), else null. */
export function readContractEnd(v: unknown): string | null {
  const t = typeof v === 'string' ? v.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const d = new Date(`${t}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== t ? null : t;
}

export const DESIGN_CHOICE_LABEL: Record<DesignChoice, string> = {
  keep: 'Keep the look of their current site',
  improve: 'Improve the design',
};

/** The lines every operator screen shows for these answers (Paid Clients, Website Build, the lead card) —
 *  ONE builder so the screens cannot word them differently. Only answers that exist are returned. */
export function simpleOnboardingLines(row: Record<string, unknown> | null | undefined): { label: string; value: string }[] {
  if (!row) return [];
  const out: { label: string; value: string }[] = [];
  const design = readDesignChoice(row.design_choice);
  if (design) out.push({ label: 'Design', value: DESIGN_CHOICE_LABEL[design] });
  const ends = contractEndWords(row.agency_contract_ends as string | null);
  if (ends) out.push({ label: 'Agency contract ends', value: ends });
  const ack = typeof row.access_ack_at === 'string' ? new Date(row.access_ack_at) : null;
  if (ack && !Number.isNaN(ack.getTime())) {
    out.push({ label: 'Access', value: `Client said they can get us access (${ack.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' })})` });
  }
  return out;
}

/** "17 March 2027" — a stored DAY, so formatted in UTC (a London-evening format would show the day before). */
export function contractEndWords(day: string | null | undefined): string | null {
  const t = readContractEnd(day);
  if (!t) return null;
  return new Date(`${t}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** A sales-held sign-up resumed from the client's page fills these only where EMPTY (findable-onboarding's
 *  light-touch fill) — facts about their site, never the plan, price or seller. */
export function simpleAnswerFills(a: Record<string, unknown>): [string, string | null][] {
  return [['design_choice', readDesignChoice(a.design_choice)], ['agency_contract_ends', readContractEnd(a.agency_contract_ends)]];
}
