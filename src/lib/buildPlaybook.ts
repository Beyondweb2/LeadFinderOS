import { DIRECTORY_FACTS, factFor, type DirectoryFact } from '@/lib/directoryFacts';

/* ============================================================
   PLAYBOOK FOLD — deterministic, no language model.

   The internal playbook is a lookup, not a piece of writing: trade -> which sources the engines
   actually cite (evidence) joined to who is allowed to action each one (facts). A model here would
   add nothing except the ability to invent a directory that does not exist, which is the single
   worst failure mode for a checklist someone works through without re-reading.

   Every source carries its `audits` count all the way to the screen, because volume alone lies:
   Companies House had 32 citations from ONE audit, which read as a pattern until the breadth column
   was added. Sources below the evidence threshold are shown as thin, never as a confident list.
   ============================================================ */

/** A source needs this many DISTINCT audits before it is presented as evidenced. */
export const EVIDENCE_MIN_AUDITS = 5;
/** Below this it is not shown at all — one audit is an anecdote. */
export const THIN_MIN_AUDITS = 2;
/** A trade needs this many audits before we will offer a directory list for it at all. */
export const TRADE_MIN_AUDITS = 5;

export interface EvidenceRow { trade: string; host: string; citations: number; audits: number }

export interface PlaybookLead {
  id: string;
  business_name: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  google_maps_url: string | null;
  place_id: string | null;
  trade: string | null;
  town: string | null;
}

/** One row already recorded in client_listings, so a done task shows as done. */
export interface ListingRecord { host: string; done_at: string | null; verified_at: string | null; listing_url: string | null }

export type Section = 'do_now' | 'blocked' | 'no_website' | 'deprioritised';

export interface PlaybookStep {
  key: string;
  section: Section;
  label: string;
  host: string | null;
  signupUrl: string | null;
  urlVerified: boolean;
  /** Exact values to paste, in field order. `missing: true` = we do not hold it. */
  fields: Array<{ name: string; value: string; missing?: boolean }>;
  minutes: number;
  citations: number;
  audits: number;
  /** 'evidenced' | 'thin' — printed next to the source so thinness is never hidden. */
  strength: 'evidenced' | 'thin';
  blockedReason?: string;
  notes?: string;
  done: boolean;
  verified: boolean;
  listingUrl: string | null;
  /* ALREADY LISTED — set ONLY from a stored, successful directory check that FOUND this host.
     Never inferred. The step stops being work to do and becomes a verification instruction: open
     the URL and confirm the category and town match the questions being measured, because a
     listing filed under the wrong category is a real and different problem from no listing.
     Excluded from every counter — see operatorMinutes below and the header in playbookDoc.ts. */
  alreadyListed?: { url: string; title: string | null };
}

export interface Playbook {
  businessName: string;
  trade: string | null;
  town: string | null;
  tradeAudits: number;
  /** True when the trade itself is too thinly measured to offer a list. */
  tradeTooThin: boolean;
  hasWebsite: boolean;
  /** The blocking gap: no address means no directory signup can be completed. */
  missingAddress: boolean;
  steps: PlaybookStep[];
  operatorMinutes: number;
  /** Sources that are cited but deliberately never become tasks. */
  notListings: Array<{ label: string; citations: number; audits: number; why: string }>;
  /* WHO KEEPS GETTING NAMED. Most top-cited hosts are not directories at all: for plumbers,
     able-group.co.uk is cited in 58 of 58 audits and dyno.com in 50 — national operators' own
     sites. A client cannot be listed on a competitor's website, so these must never be tasks. They
     were previously DROPPED, which threw away the most useful intelligence in the data. */
  whoIsWinning: Array<{ host: string; citations: number; audits: number; kind: string }>;
}

/* EXPORTED 2026-07-30 so check-directory-listings can reuse it instead of making a THIRD copy.
   Logic unchanged — not one character inside the function. It is already duplicated in
   playbook-evidence/index.ts, which carries the warning that the two must stay identical or every
   trade silently folds to zero evidence; a third copy was not acceptable. */
export const norm = (t: string | null | undefined) => {
  const s = (t ?? '').toLowerCase();
  if (/plumb/.test(s)) return 'plumber';
  if (/accountant|accountancy|bookkeep/.test(s)) return 'accountant';
  if (/electric/.test(s)) return 'electrician';
  return s.trim();
};

/** Town comparison for `townOnly`. Punctuation and the trailing country word are noise: stored towns
 *  include values like "Bourne uk", and "Chiang Mai" must match "chiang mai". */
const townKey = (t: string | null | undefined) =>
  (t ?? '').toLowerCase().replace(/\b(uk|england|scotland|wales|united kingdom)\b/g, '').replace(/[^a-z]/g, '');

/** Rough minutes per step. Deliberately generous — an underestimate makes the hour a lie. */
const MINUTES: Record<string, number> = { 'yell.com': 10, '192.com': 5, 'cylex-uk.co.uk': 5, 'thomsonlocal.com': 5, 'yelp.com': 5 };

export function buildPlaybook(
  lead: PlaybookLead,
  evidence: EvidenceRow[],
  tradeAuditTotals: Record<string, number>,
  listings: ListingRecord[] = [],
  /* A stored directory check for this lead, if one has ever been run. Only an 'ok' check can
     suppress a task — foundHostMap enforces that, so a refused/errored/empty search can never hide
     real work. Absent → the fold behaves exactly as it always has and the document says the check
     has not been run, rather than implying a clean sweep. */
  directoryFound: Map<string, { url: string; title: string | null }> = new Map(),
): Playbook {
  const trade = norm(lead.trade);
  const tradeAudits = tradeAuditTotals[trade] ?? 0;
  const town = (lead.town ?? '').trim() || null;
  const hasWebsite = !!(lead.website ?? '').trim();
  const missingAddress = !(lead.address ?? '').trim();
  const rec = new Map(listings.map((l) => [l.host, l]));

  const forTrade = evidence
    .filter((e) => e.trade === trade && e.audits >= THIN_MIN_AUDITS)
    .sort((a, b) => b.citations - a.citations);

  const notListings: Playbook['notListings'] = [];
  const whoIsWinning: Playbook['whoIsWinning'] = [];
  const steps: PlaybookStep[] = [];
  /* Prompts replacing town-specific hosts this business cannot join. Collected separately so they
     land after the real directory tasks rather than interleaved by citation count. */
  const townPrompts: PlaybookStep[] = [];

  for (const e of forTrade) {
    const f: DirectoryFact | undefined = factFor(e.host);
    /* UNKNOWN HOST. Still never a task — we know nothing about it, so inventing one would be
       guessing. But it is almost always a competitor's own site, and those are the answer key to
       "who keeps getting named". Surfaced as intelligence rather than discarded. Treating unknown
       as intelligence also means a NEW competitor appears automatically, with no entry to write. */
    if (!f) { whoIsWinning.push({ host: e.host, citations: e.citations, audits: e.audits, kind: 'unclassified' }); continue; }
    /* Classified as something that cannot be joined. Same destination, better label. */
    if (f.kind && f.kind !== 'directory' && f.kind !== 'trade-body') {
      whoIsWinning.push({ host: e.host, citations: e.citations, audits: e.audits, kind: f.kind });
      continue;
    }
    if (f.notAListing) {
      notListings.push({ label: f.label, citations: e.citations, audits: e.audits, why: f.notes ?? 'Not a listing anyone can join.' });
      continue;
    }

    /* TOWN-SPECIFIC HOST IN THE WRONG TOWN. Evidence is per TRADE, so a town portal cited across 10
       plumber audits is offered to every plumber — including Macca-Gas in Kettering, who cannot list
       on Loughborough's directory. The fact knows the town; the citations never could.

       It becomes a PROMPT, not a task, and deliberately not a silent drop: the citation count is the
       evidence that town portals are worth chasing at all, and that finding survives only if the
       operator is told to go looking for the local equivalent. */
    if (f.townOnly && townKey(f.townOnly) !== townKey(town)) {
      townPrompts.push({
        key: `town-portal:${e.host}`, section: 'do_now',
        label: town ? `Check whether ${town} has an equivalent town portal` : 'Check whether this town has an equivalent town portal',
        host: null, signupUrl: null, urlVerified: true, fields: [], minutes: 10,
        citations: 0, audits: 0, strength: 'evidenced',
        notes: `${f.label} covers ${f.townOnly} only, so ${lead.business_name ?? 'this business'} cannot be listed on it — `
          + `but it is cited in ${e.audits} of ${tradeAudits} ${trade || 'measured'} audits, which is why this is worth 10 minutes. `
          + `Look for a ${town ?? 'client town'} equivalent: a <town>.org.uk or <town>.co.uk portal carrying a business directory. `
          + `If one exists and gets cited, it earns its own entry in directoryFacts.`,
        done: false, verified: false, listingUrl: null,
      });
      continue;
    }

    const r = rec.get(e.host);
    const strength: PlaybookStep['strength'] = e.audits >= EVIDENCE_MIN_AUDITS ? 'evidenced' : 'thin';
    const section: Section = f.actor === 'client-only' ? 'blocked' : 'do_now';

    /* The exact values to paste. Address is flagged rather than blank: a blank field reads as
       "nothing needed", and the whole task fails without it. */
    const fields = [
      { name: 'Business name', value: lead.business_name ?? '', missing: !lead.business_name },
      { name: 'Trade', value: lead.trade ?? '', missing: !lead.trade },
      { name: 'Town', value: town ?? '', missing: !town },
      { name: 'Phone', value: lead.phone ?? '', missing: !lead.phone },
      { name: 'Address', value: lead.address ?? 'NOT HELD — ask the client', missing: missingAddress },
      { name: 'Website', value: lead.website ?? 'none', missing: false },
    ];

    /* A stored check that FOUND this host turns the task into a verification instruction. Minutes
       and paste-values are dropped with it: this is no longer an hour's work, and printing a NAP
       table beside "already listed" invites the operator to create a duplicate. */
    const listed = directoryFound.get(e.host.toLowerCase());

    steps.push({
      key: `dir:${e.host}`, section, label: f.label, host: e.host,
      signupUrl: f.signupUrl || null, urlVerified: f.urlVerified,
      fields: !listed && section === 'do_now' ? fields : [],
      minutes: !listed && section === 'do_now' ? (MINUTES[e.host] ?? 10) : 0,
      citations: e.citations, audits: e.audits, strength,
      blockedReason: f.blockedReason, notes: f.notes,
      done: !!r?.done_at, verified: !!r?.verified_at, listingUrl: r?.listing_url ?? null,
      ...(listed ? { alreadyListed: { url: listed.url, title: listed.title } } : {}),
    });
  }

  steps.push(...townPrompts);

  // Fixed steps that are not directory-dependent.
  steps.unshift({
    key: 'read-baseline', section: 'do_now', label: 'Read the baseline and pick the gaps',
    host: null, signupUrl: null, urlVerified: true, fields: [], minutes: 5,
    citations: 0, audits: 0, strength: 'evidenced',
    notes: 'ABSENT and ONE ENGINE questions first — see /baseline/:auditId.',
    done: false, verified: false, listingUrl: null,
  });
  steps.push({
    key: 'client-pack', section: 'do_now', label: 'Send the client pack',
    host: null, signupUrl: null, urlVerified: true, fields: [], minutes: 10,
    citations: 0, audits: 0, strength: 'evidenced',
    notes: 'Covers what only they can do. Without this the blocked items never move.',
    done: false, verified: false, listingUrl: null,
  });

  if (!hasWebsite) {
    steps.push({
      key: 'no-website', section: 'no_website', label: 'No website — sell one',
      host: null, signupUrl: null, urlVerified: true, fields: [], minutes: 0,
      citations: 0, audits: 0, strength: 'evidenced',
      notes: 'Gemini builds answers from businesses’ own sites, so with no site it cannot name them at all. MK Plumbing is the proof: 0/10 on Gemini, 3/3 on ChatGPT via directories.',
      done: false, verified: false, listingUrl: null,
    });
  }

  steps.push({
    key: 'onpage', section: 'deprioritised', label: 'On-page schema / headings work',
    host: null, signupUrl: null, urlVerified: true, fields: [], minutes: 0,
    citations: 0, audits: 0, strength: 'evidenced',
    notes: 'Deliberately last. Measured on 20 sites Gemini names against 41 clients it ignores: LocalBusiness schema 35% vs 32% — no difference. Firms Gemini names have WORSE sites than ours. Do not spend the hour here.',
    done: false, verified: false, listingUrl: null,
  });

  /* COUNTED AFTER SUPPRESSION. An already-listed host is not work, so it must not add minutes —
     a header that says "3 tasks I can complete now" for a business whose only free listing already
     exists is inverted, and it goes in front of paying customers. */
  const operatorMinutes = steps
    .filter((s) => s.section === 'do_now' && !s.alreadyListed)
    .reduce((n, s) => n + s.minutes, 0);

  return {
    businessName: lead.business_name ?? 'this business',
    trade: lead.trade, town, tradeAudits,
    tradeTooThin: tradeAudits < TRADE_MIN_AUDITS,
    hasWebsite, missingAddress, steps, operatorMinutes, notListings,
    whoIsWinning: whoIsWinning.sort((a, b) => b.audits - a.audits || b.citations - a.citations),
  };
}

/* REMOVED 2026-07-30: buildClientDoc. It was written and NEVER RENDERED — dead code for its whole
   life — and it was dangerous dead code, because a future session could have wired it up in good
   faith. Two documents claiming to be "the client document" is the same trap the LLM playbook was,
   and Paul has already read the wrong document three times in one day.

   What it leaked, had it ever shipped:
     • THE METHOD. "We ask ChatGPT and Gemini the questions a real customer would type ... three times
       each, and record whether you get named and who gets named instead." That is the measurement
       handed over.
     • It dumped EVERY blocked host with no cap and no thin filter — eight of them for a plumber,
       three of those resting on 3 audits.
     • It asked for the address unconditionally, claiming "we do not have it on file" even for a
       client whose address we hold.

   WHAT WAS WORTH KEEPING WAS LIFTED, not discarded:
     • the a/an grammar helper           → aOrAn() in clientRequestDoc.ts
     • the {trade}/{town} substitution   → fill() in clientRequestSelect.ts
     • the "Being straight with you" wording, close to verbatim → the notes block of the client doc
   The replacement is clientRequestDoc.ts (renderer, cannot see the ranking) plus
   clientRequestSelect.ts (selection, the only side that can). */

/** Wording when the trade itself is too thinly measured. Must never print a confident list. */
export function thinTradeMessage(trade: string | null, audits: number): string {
  const t = (trade ?? 'this trade').toLowerCase();
  return `We do not have enough measured ${t}s to give you a directory list yet — we have ${audits} `
    + `audit${audits === 1 ? '' : 's'}. Based on the 58 plumbers we have measured, Checkatrade and Yell are `
    + `likely the right starting point, but that is an inference from a related trade, not something we have `
    + `measured for ${t}s. We are not going to print a confident list off ${audits}.`;
}

export const ALL_FACTS = DIRECTORY_FACTS;
