/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHAT WE ALREADY KNOW, FOR THE CLIENT'S POST-PAYMENT FORM (2026-10-02, docs/paid-client-automation.md)

   The paid details form asks only for what is missing: it arrives with the services and towns we
   already hold, each labelled by where it came from, for the client to CONFIRM (untick / add) rather
   than retype. Read by findable-onboarding `q2_prefill` (paid rows only — the onboarding id is the
   capability).
   ⛔ ONE SOURCE PER LIST, NEVER MERGED (clientFacts.ts rule): the client's own earlier answer, else what
   the salesperson recorded, else what the crawl found on their website. A merge would hand back a
   service the client removed.
   ⛔ A CRAWLER GUESS IS LABELLED AS ONE ('website'). It becomes a confirmed fact only when the client
   submits it — the form shows the label, the client decides.
   Pure. ⚠️ Edge-reachable: relative imports with an explicit .ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { effectiveQuestionnaireServices } from './questionnaireComplete.ts';

export type KnownSource = 'you' | 'sales' | 'website';
export interface KnownList { items: string[]; source: KnownSource }
export interface ClientKnown { services: KnownList | null; areas: KnownList | null }

const clean = (v: unknown): string[] => {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of v) {
    const t = typeof x === 'string' ? x.trim() : x && typeof x === 'object' && typeof (x as { name?: unknown }).name === 'string' ? String((x as { name: string }).name).trim() : '';
    if (!t || t.length > 120 || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase()); out.push(t);
  }
  return out.slice(0, 30);
};
const splitList = (v: unknown) => clean(typeof v === 'string' ? v.split(/[,\n]/) : []);

export function clientKnown(i: {
  onboarding: { services?: string | null; services_list?: unknown; areas_list?: unknown; areas_wanted?: string | null } | null;
  lead: { services_included?: unknown; service_areas?: unknown } | null;
  /** lead_crawl_checks.result.siteInfo — `services` / `towns` found on the client's own site. */
  crawlSiteInfo: { services?: unknown; towns?: unknown } | null;
}): ClientKnown {
  const pick = (lists: [string[], KnownSource][]): KnownList | null => {
    for (const [items, source] of lists) if (items.length) return { items, source };
    return null;
  };
  return {
    services: pick([
      [clean(effectiveQuestionnaireServices(i.onboarding ?? undefined)), 'you'],
      [clean(i.lead?.services_included), 'sales'],
      [clean(i.crawlSiteInfo?.services), 'website'],
    ]),
    areas: pick([
      [clean(i.onboarding?.areas_list).length ? clean(i.onboarding?.areas_list) : splitList(i.onboarding?.areas_wanted), 'you'],
      [clean(i.lead?.service_areas), 'sales'],
      [clean(i.crawlSiteInfo?.towns), 'website'],
    ]),
  };
}

/** The words the client reads above a pre-filled list. */
export const KNOWN_SOURCE_LINE: Record<KnownSource, string> = {
  you: "What you told us — change anything that's wrong.",
  sales: 'What you told us on the phone — untick anything that is wrong and add anything missing.',
  website: 'We found these on your website — untick any you do not offer and add anything missing.',
};
