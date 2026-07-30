import { factFor, type DirectoryFact } from '@/lib/directoryFacts';
import type { QueueRow } from '@/lib/auditReport';

/* ============================================================
   THIS AUDIT'S OWN CITATIONS — what the engines actually read when asked about THIS business.

   Deliberately SEPARATE from the trade-level evidence in buildPlaybook, and neither replaces the
   other. The trade fold answers "what generally works for plumbers" from 58 audits; this answers
   "what was read for this client, in this town" from one. R.Foster's own audit cited Checkatrade four
   times and Yell twice on Kettering questions — that is a sharper instruction for that one client
   than any aggregate, and it is invisible in a per-trade average.

   Sample size is ONE audit, so this is never presented as evidence of what works. It is presented as
   what was read. The page must keep those two claims apart.

   NO LLM, no network: a pure fold over ai_audit_queue.result.
   ============================================================ */

/** Host from a citation URL. Mirrors playbook-evidence's hostOf EXACTLY — if that changes, change
 *  this with it, or the same URL keys differently in the two views and the page contradicts itself. */
export function hostOf(url: string): string {
  const raw = (url ?? '').trim();
  if (!raw) return '';
  return raw.replace(/^https?:\/\//i, '').split('/')[0].split('?')[0].toLowerCase().replace(/^www\./, '');
}

/** Path + query, lowercased — where a business's own listing slug would live. */
function pathOf(url: string): string {
  const raw = (url ?? '').trim().replace(/^https?:\/\//i, '');
  const slash = raw.indexOf('/');
  return slash === -1 ? '' : raw.slice(slash).toLowerCase();
}

/* Words that carry no identity — legal forms and filler. Dropped from the name slug entirely. */
const NAME_STOPWORDS = new Set([
  'ltd', 'limited', 'llp', 'plc', 'inc', 'co', 'company', 'the', 'and', 'services', 'service',
  'group', 'uk', 'gb', 'associates', 'solutions', 'systems',
]);

/* TRADE AND GENERIC WORDS. Kept in the slug (a real listing URL contains them) but they can never
   IDENTIFY a business on their own.
   MEASURED FALSE POSITIVES this exists to kill, found across all 108 audits on 2026-07-30:
     - "NJM Locksmiths" matched a Guardian article at /money/…/locksmith-scams… — five businesses
       "already listed on theguardian.com", all from the word locksmith.
     - "24 hour Emergency Plumber" and "Plumbing and Heating (Emergency Plumber and gasman)" matched
       able-group.co.uk and dyno.com service pages on plumbing + emergency + town.
     - "J Kilby Plumbing & Heating" matched cityplumbing.co.uk/branch-locator on plumbing + heating.
   Many businesses here are named after their trade and town, so two generic tokens is no evidence at
   all. This is the "acca matches Macca-Gas" trap in a different coat. */
const GENERIC_TRADE_WORDS = new Set([
  'plumbing', 'plumber', 'plumbers', 'heating', 'gas', 'gasman', 'boiler', 'boilers', 'drainage',
  'drains', 'locksmith', 'locksmiths', 'locks', 'lock', 'security', 'electrical', 'electrician',
  'electricians', 'accountant', 'accountants', 'accountancy', 'tax', 'emergency', 'hour', 'hours',
  'handyman', 'repairs', 'repair', 'installation', 'installations', 'maintenance', 'property',
  'cafe', 'bar', 'restaurant', 'salon', 'barber', 'barbers', 'engineer', 'engineers', 'specialists',
  'specialist', 'supplies', 'centre', 'center', 'local', 'best', 'near',
]);

/** Identity tokens from a business name: >=4 chars, not a stopword. "Macca-Gas Ltd" -> ["macca","gas"]
 *  becomes ["macca"] under the >=4 rule, so the joined-slug test below carries the short ones. */
function nameTokens(businessName: string): string[] {
  return (businessName ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !NAME_STOPWORDS.has(t));
}

/** The whole name as a slug with separators collapsed: "maccagas" from "Macca-Gas Ltd". */
function nameSlug(businessName: string): string {
  return (businessName ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !NAME_STOPWORDS.has(t))
    .join('');
}

/**
 * Does this URL look like THIS business's own listing page on that host?
 *
 * ⚠️ SUBSTRING MATCHING IS A KNOWN TRAP IN THIS REPO — "acca" matches "Macca-Gas" and "bing" matches
 * "plumbing". Three guards against a false positive:
 *   1. Only the PATH is searched, never the host, so `accaglobal.com` cannot match "Macca-Gas".
 *   2. Separators are stripped from the path before comparison, so `/macca-gas-ltd` and `/maccagas`
 *      both match, without needing a fuzzy test.
 *   3. A match needs EITHER the whole collapsed name slug, OR two tokens of which at least ONE is
 *      DISTINCTIVE — not a trade or generic word. Two generic words is not evidence: it is how five
 *      locksmiths came out "listed on theguardian.com" (see GENERIC_TRADE_WORDS).
 * The matched URL is always surfaced so a human can overrule it. This function suggests; it never
 * concludes.
 */
export function looksLikeOwnListing(url: string, businessName: string): boolean {
  const slug = nameSlug(businessName);
  if (slug.length < 5) return false; // too generic to test safely
  const path = pathOf(url);
  if (!path) return false;
  const collapsed = path.replace(/[^a-z0-9]/g, '');
  // Strongest signal: the whole name, separators ignored, appears in the path.
  if (collapsed.includes(slug)) return true;
  const toks = nameTokens(businessName);
  const present = toks.filter((t) => collapsed.includes(t));
  if (present.length < 2) return false;
  // At least one matched token must actually identify this business rather than its trade.
  return present.some((t) => !GENERIC_TRADE_WORDS.has(t));
}

export interface OwnCitationHost {
  host: string;
  /** Every citation of this host across questions x engines. Volume within one audit. */
  mentions: number;
  /** How many DISTINCT questions cited it — breadth within the audit. */
  questions: number;
  /** Which engines cited it. ChatGPT reads directories, Gemini reads own sites: the split matters. */
  engines: string[];
  /** What the host IS, from directoryFacts. 'unclassified' when we hold no fact for it. */
  kind: string;
  label: string;
  /** True when this host can actually become a task — a joinable directory or trade body. */
  actionable: boolean;
  /** A URL on this host that looks like the business's OWN page there. Suggestive, not proof. */
  ownListingUrl: string | null;
  /** A couple of real URLs so the operator can click through and check. */
  sampleUrls: string[];
}

export interface OwnCitations {
  hosts: OwnCitationHost[];
  /** Total citation URLs seen across the audit. */
  totalCitations: number;
  /** Questions that produced at least one citation. */
  questionsWithCitations: number;
  /** Questions examined. */
  questionsCounted: number;
  engines: string[];
  /** Hosts where the business's own listing page appears to be cited AND the host is a joinable
   *  directory — the free "already listed" signal, and the only version worth showing.
   *  Own-site matches are excluded because "listed on your own website" is not a listing, and
   *  editorial matches are excluded because they were measured to be false positives. */
  alreadyListedOn: OwnCitationHost[];
  /** Every own-page match including non-joinable hosts. Kept for diagnostics, not for the screen. */
  ownPageMatchesAllHosts: OwnCitationHost[];
}

export function buildOwnCitations(rows: QueueRow[], businessName: string): OwnCitations {
  const byHost = new Map<string, {
    mentions: number; questions: Set<string>; engines: Set<string>; urls: string[]; own: string | null;
  }>();
  const allEngines = new Set<string>();
  let totalCitations = 0;
  let questionsWithCitations = 0;

  for (const row of rows) {
    const result = row.result;
    if (!result) continue;
    let rowHadCitation = false;
    for (const [engine, er] of Object.entries(result)) {
      const cites = er?.citations;
      if (!Array.isArray(cites)) continue;
      allEngines.add(engine);
      for (const c of cites) {
        const host = hostOf(c?.url ?? '');
        if (!host) continue;
        totalCitations += 1;
        rowHadCitation = true;
        let e = byHost.get(host);
        if (!e) { e = { mentions: 0, questions: new Set(), engines: new Set(), urls: [], own: null }; byHost.set(host, e); }
        e.mentions += 1;
        e.questions.add(row.question ?? row.id);
        e.engines.add(engine);
        if (e.urls.length < 3 && c.url && !e.urls.includes(c.url)) e.urls.push(c.url);
        if (!e.own && c.url && looksLikeOwnListing(c.url, businessName)) e.own = c.url;
      }
    }
    if (rowHadCitation) questionsWithCitations += 1;
  }

  const hosts: OwnCitationHost[] = [...byHost.entries()].map(([host, e]) => {
    const f: DirectoryFact | undefined = factFor(host);
    /* Same rule as buildPlaybook: only 'directory' and 'trade-body' can ever be work, and an entry
       with no `kind` predates that field and is a directory. notAListing overrides everything. */
    const kind = f ? (f.kind ?? 'directory') : 'unclassified';
    const actionable = !!f && !f.notAListing && (kind === 'directory' || kind === 'trade-body');
    return {
      host,
      mentions: e.mentions,
      questions: e.questions.size,
      engines: [...e.engines].sort(),
      kind,
      label: f?.label ?? host,
      actionable,
      ownListingUrl: e.own,
      sampleUrls: e.urls,
    };
  })
    // Ranked by how often it appeared across this audit's questions and engines: breadth first
    // (a host in 3 of 3 questions beats one cited 5 times in a single answer), then volume.
    .sort((a, b) => b.questions - a.questions || b.mentions - a.mentions || a.host.localeCompare(b.host));

  return {
    hosts,
    totalCitations,
    questionsWithCitations,
    questionsCounted: rows.length,
    engines: [...allEngines].sort(),
    alreadyListedOn: hosts.filter((h) => h.ownListingUrl && h.actionable),
    ownPageMatchesAllHosts: hosts.filter((h) => h.ownListingUrl),
  };
}

/** The caveat that must appear wherever "already listed" is shown. A citation proves a listing
 *  exists; its ABSENCE proves nothing at all — the engine simply may not have cited it. */
export const ABSENCE_CAVEAT =
  'A cited listing page proves they are on that directory. The reverse is not true: a directory missing '
  + 'from this list may still hold a listing that simply was not cited. This is a free signal, not an audit '
  + 'of their listings.';
