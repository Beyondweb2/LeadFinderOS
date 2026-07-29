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

const norm = (t: string | null | undefined) => {
  const s = (t ?? '').toLowerCase();
  if (/plumb/.test(s)) return 'plumber';
  if (/accountant|accountancy|bookkeep/.test(s)) return 'accountant';
  if (/electric/.test(s)) return 'electrician';
  return s.trim();
};

/** Rough minutes per step. Deliberately generous — an underestimate makes the hour a lie. */
const MINUTES: Record<string, number> = { 'yell.com': 10, '192.com': 5, 'cylex-uk.co.uk': 5, 'thomsonlocal.com': 5, 'yelp.com': 5 };

export function buildPlaybook(
  lead: PlaybookLead,
  evidence: EvidenceRow[],
  tradeAuditTotals: Record<string, number>,
  listings: ListingRecord[] = [],
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

    steps.push({
      key: `dir:${e.host}`, section, label: f.label, host: e.host,
      signupUrl: f.signupUrl || null, urlVerified: f.urlVerified,
      fields: section === 'do_now' ? fields : [],
      minutes: section === 'do_now' ? (MINUTES[e.host] ?? 10) : 0,
      citations: e.citations, audits: e.audits, strength,
      blockedReason: f.blockedReason, notes: f.notes,
      done: !!r?.done_at, verified: !!r?.verified_at, listingUrl: r?.listing_url ?? null,
    });
  }

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

  const operatorMinutes = steps.filter((s) => s.section === 'do_now').reduce((n, s) => n + s.minutes, 0);

  return {
    businessName: lead.business_name ?? 'this business',
    trade: lead.trade, town, tradeAudits,
    tradeTooThin: tradeAudits < TRADE_MIN_AUDITS,
    hasWebsite, missingAddress, steps, operatorMinutes, notListings,
    whoIsWinning: whoIsWinning.sort((a, b) => b.audits - a.audits || b.citations - a.citations),
  };
}

/** The client document. A template with values substituted — no model, so it cannot drift into a promise. */
export function buildClientDoc(pb: Playbook): { heading: string; sections: Array<{ title: string; body: string[] }> } {
  const trade = (pb.trade ?? 'business').toLowerCase();
  // "a accountant" reads as carelessness in a document a client pays for.
  const aTrade = /^[aeiou]/.test(trade) ? `an ${trade}` : `a ${trade}`;
  const town = pb.town ?? 'your area';
  const fill = (s: string) => s.replace(/\{trade\}/g, trade).replace(/\{town\}/g, town);

  const doing: string[] = [
    `We measure where you currently stand. We ask ChatGPT and Gemini the questions a real customer would type when looking for ${aTrade} in ${town}, three times each, and record whether you get named and who gets named instead.`,
    'We do the listings we are able to do on your behalf, and we make sure the details match everywhere — same business name, same trade wording, same phone, same area.',
    'We tell you exactly which things only you can do, and why they matter, so you can decide.',
    'We measure again after eight weeks, on the same questions, so the comparison is like for like.',
  ];
  if (!pb.hasWebsite) {
    doing.push('You do not currently have a website. That matters more than it sounds: Gemini builds its answers largely from businesses’ own websites, so without one it has nothing of yours to read. We can talk about that separately.');
  }

  const need: string[] = [
    'Your full business address. Every directory asks for it and we do not have it on file.',
    'Access to your Google Business Profile, if you want us to work on it.',
    ...(pb.hasWebsite ? ['Access to your website, if you want us to change anything on it. This is the lowest priority of the three — see below.'] : []),
  ];

  const onlyYou = pb.steps
    .filter((s) => s.section === 'blocked' && s.host)
    .map((s) => {
      const f = factFor(s.host as string);
      const para = f?.clientParagraph ? fill(f.clientParagraph) : `${s.label} can only be actioned by you. ${s.blockedReason ?? ''}`;
      return `### ${s.label}\n${para}`;
    });

  /* Stated plainly and last, because it is the part that keeps this honest: nothing here is a
     promise about outcomes. No client has completed a full eight-week cycle yet. */
  const limits = [
    'What we are not going to tell you: that this guarantees you will be named. No client has completed a full eight-week cycle with us yet, so we have no results to point at, and we would rather say that than imply otherwise.',
    'What we can tell you is what we measured, what we did, and what changed when we measured again.',
  ];

  return {
    heading: `${pb.businessName} — what happens next`,
    sections: [
      { title: 'What we are doing', body: doing },
      { title: 'What we need from you', body: need },
      { title: 'What only you can do, and why it matters', body: onlyYou.length ? onlyYou : ['Nothing on your list right now requires anything only you can do.'] },
      { title: 'Being straight with you', body: limits },
    ],
  };
}

/** Wording when the trade itself is too thinly measured. Must never print a confident list. */
export function thinTradeMessage(trade: string | null, audits: number): string {
  const t = (trade ?? 'this trade').toLowerCase();
  return `We do not have enough measured ${t}s to give you a directory list yet — we have ${audits} `
    + `audit${audits === 1 ? '' : 's'}. Based on the 58 plumbers we have measured, Checkatrade and Yell are `
    + `likely the right starting point, but that is an inference from a related trade, not something we have `
    + `measured for ${t}s. We are not going to print a confident list off ${audits}.`;
}

export const ALL_FACTS = DIRECTORY_FACTS;
