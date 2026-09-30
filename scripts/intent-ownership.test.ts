/* INTENT OWNERSHIP (src/lib/intentOwnership.ts, Paul 2026-09-30) — the ONE rule for "which page owns
   this intent?", used by the Website Build's Site Intent Map, the page generator's Q&A pages and its
   page-plan queue.
     A. matching: word stems, acronyms, soft words — never a substring of a word
     B. Q&A headings: the question is the TARGET INTENT, never the title / H1 / slug
     C. ownership: supported? → owned? (improve it) → competing? → only then a new page
     D. owned pages from the Website Build plan and the page queue
     E. the generator and the build use it (source checks: one rule, not copies)
     F. the price rule: only approved prices on a built site (the gate) */

import { readFileSync } from 'node:fs';
import { findNamed, mentions, ownedFromQueue, ownedFromWebsiteBuild, ownershipFor, qaHeadings, type OwnedPage } from '../src/lib/intentOwnership.ts';
import { auditSite } from './site-quality-gate.mjs';

let failures = 0;
function ok(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; }

const SERVICES = ['House rewiring', 'EICR landlord certificates', 'Consumer unit upgrades', 'EV charger installation'];
const TOWNS = ['Bristol', 'Bath', 'Keynsham'];
const H = (question: string, extra: Partial<Parameters<typeof qaHeadings>[0]> = {}) => qaHeadings({ question, services: SERVICES, towns: TOWNS, homeTown: 'Bristol', businessName: 'BS4 Electrical', businessType: 'Electrician', ...extra });

/* ── A ── */
{
  ok(mentions('who does rewiring in Bristol', 'House rewiring'), 'A: "rewiring" names the service "House rewiring" (a soft word left out)');
  ok(mentions('how long does a consumer unit upgrade take', 'Consumer unit upgrades'), 'A: singular / plural stems match');
  ok(mentions('how much is an EICR in Bath', 'EICR landlord certificates'), 'A: an acronym in the service name is distinctive on its own');
  ok(!mentions('Kentish Town electrician', 'Kent') && !mentions('bathroom fitting', 'Bath'), 'A: never a substring of another word (Kent / Kentish, Bath / bathroom)');
  ok(findNamed('electrician in Bath or Keynsham', TOWNS) !== '' && findNamed('electrician in Swindon', TOWNS) === '', 'A: findNamed returns only a genuine name');
}

/* ── B ── */
{
  const h = H('who does rewiring in Bristol');
  ok(h.h1 === 'House Rewiring in Bristol' && h.title === 'House Rewiring Bristol | BS4 Electrical', 'B: Paul\'s example — "who does rewiring in Bristol" → H1 "House Rewiring in Bristol", title "House Rewiring Bristol | BS4 Electrical"');
  ok(h.slug === 'house-rewiring-in-bristol' && h.service === 'House rewiring' && h.town === 'Bristol' && h.basis === 'service', 'B: the slug and the matched genuine service / place come with it');
  const qs = ['who does rewiring in Bristol', 'Can I get an EV charger installed in Keynsham?', 'What is a fuse board?', 'best electrician near me', 'How much does an EICR cost in Bath?'];
  for (const q of qs) { const x = H(q); ok(x.h1.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() !== q.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() && x.title.length <= 60 && !/\?/.test(x.h1 + x.title), 'B: never the question verbatim, never a "?", title ≤ 60 — "' + q + '" → "' + x.h1 + '"'); }
  ok(H('What is a fuse board?').basis === 'topic' && H('What is a fuse board?').h1 === 'Fuse board' && /check it reads naturally/.test(H('What is a fuse board?').note), 'B: no genuine service named → the question\'s topic, flagged for a look');
  ok(H('best electrician near me').basis === 'trade' && H('best electrician near me').h1 === 'Electrician', 'B: a generic trade question → the trade, never "best … near me"');
  ok(!/Solar/i.test(H('who installs solar panels in Bristol').h1.replace(/solar panels/i, '')) && H('who installs solar panels in Bristol').service === '', 'B: an unapproved service is never promoted to a genuine one');
  const long = qaHeadings({ question: 'who does rewiring in Bristol', services: SERVICES, towns: TOWNS, homeTown: 'Bristol', businessName: 'A Very Long Electrical Contractors Name Limited Bristol' });
  ok(long.title === 'House Rewiring Bristol', 'B: the business name is dropped before the service or place is cut');
}

/* ── C ── */
const OWNED: OwnedPage[] = [
  { page: '/rewiring-services/', label: 'Rewiring Services', kind: 'service', service: 'House rewiring', source: 'website build plan' },
  { page: '/areas/bath/', label: 'Bath', kind: 'location', town: 'Bath', source: 'website build plan' },
  { page: '/', label: 'Home', kind: 'home', source: 'website build plan' },
];
const CTX = { services: SERVICES, towns: TOWNS, homeTown: 'Bristol' };
{
  const home = ownershipFor({ service: 'House rewiring', town: 'Bristol' }, OWNED, CTX);
  ok(home.decision === 'improve_existing' && home.owner?.page === '/rewiring-services/' && /improve that page/.test(home.reasons[0]), 'C: rewiring in the HOME town is owned by the rewiring page — improve it, no second page');
  const bath = ownershipFor({ service: 'House rewiring', town: 'Bath' }, OWNED, CTX);
  ok(bath.decision === 'new_page' && bath.competing.map((c) => c.page).join() === '/rewiring-services/,/areas/bath/' && /cannibalises/.test(bath.reasons.join(' ')), 'C: rewiring in Bath may be a new page, but names the two pages it sits next to and the cannibalisation risk');
  ok(ownershipFor({ town: 'Bath' }, OWNED, CTX).owner?.page === '/areas/bath/', 'C: a place-only intent is owned by that place\'s page');
  ok(ownershipFor({ question: 'best electrician', generic: true }, OWNED, CTX).owner?.page === '/', 'C: a generic trade intent is owned by the home page');
  ok(ownershipFor({ service: 'Solar panels' }, OWNED, CTX).decision === 'unsupported' && ownershipFor({ town: 'Swindon' }, OWNED, CTX).decision === 'unsupported', 'C: an unapproved service or place is UNSUPPORTED — no page for it');
  ok(ownershipFor({ question: 'what is a fuse board' }, OWNED, CTX).decision === 'new_page', 'C: a general question with no owner may be a new page');
  const byQ = ownershipFor({ question: 'What is a fuse board?' }, [...OWNED, { page: 'fuse-board', label: 'Fuse boards explained', kind: 'qa', question: 'what is a fuse board', source: 'page queue' }], CTX);
  ok(byQ.decision === 'improve_existing' && byQ.owner?.page === 'fuse-board', 'C: the same question already planned → owned by that planned page');
  ok(ownershipFor({ service: 'House rewiring', town: 'Bristol' }, [], CTX).decision === 'new_page', 'C: nothing owns it → a new page');
}

/* ── D ── */
{
  const wb = { pages: [
    { family: 'homepage', path: '/', title: 'Home', action: 'keep' },
    { family: 'service', path: '/rewiring/', title: 'House rewiring', action: 'create' },
    { family: 'location', path: '/areas/bath/', title: 'Electrician in Bath', action: 'create' },
    { family: 'service', path: '/old/', title: 'Old', action: 'remove' },
    { family: 'service', path: '/maybe/', title: 'Maybe', action: 'undecided' },
  ] };
  const o = ownedFromWebsiteBuild(wb);
  ok(o.length === 3 && o[1].service === 'House rewiring' && o[2].town === 'Bath' && o.every((x) => x.source === 'website build plan'), 'D: the Website Build plan: keep / create rows only, the town read from "Electrician in Bath"');
  ok(ownedFromWebsiteBuild(null).length === 0 && ownedFromWebsiteBuild({}).length === 0, 'D: no plan → no owned pages (never a guess)');
  const q = ownedFromQueue([{ slug: 'rewire-bath', job: 'Rewiring in Bath', primary_question: 'who rewires houses in Bath', status: 'planned' }, { slug: 'x', primary_question: 'y', status: 'removed' }], { services: SERVICES, towns: TOWNS });
  ok(q.length === 1 && q[0].service === 'House rewiring' && q[0].town === 'Bath' && q[0].kind === 'qa', 'D: queue rows: removed / merged skipped; service and place read from the question');
}

/* ── E ── */
{
  const gen = readFileSync(new URL('../supabase/functions/page-generator/index.ts', import.meta.url), 'utf8');
  ok(!/h1:\s*question\b/.test(gen) && (gen.match(/h1:\s*heads\.h1/g) ?? []).length === 2, 'E: both Q&A modes take the H1 from qaHeadings — never h1: question');
  ok(!/title\s*=\s*question\.length/.test(gen) && !/const (a)?[sS]lug = question\./.test(gen) && !/answers "\$\{question\}"/.test(gen), 'E: no title, slug or meta fallback is built from the question text');
  ok(/error: "intent_owned"/.test(gen) && gen.indexOf('error: "intent_owned"') < gen.indexOf('if (qaMode === "advice")'), 'E: the ownership refusal comes BEFORE any AI call (nothing spent)');
  ok(/ownedFromWebsiteBuild/.test(gen) && /p\.status = "held"/.test(gen), 'E: plan_build holds a planned page the client\'s site already owns');
  const gate = readFileSync(new URL('../src/lib/siteGate.ts', import.meta.url), 'utf8');
  ok(/from '\.\/intentOwnership\.ts'/.test(gate) && !/function mentions\(/.test(gate), 'E: the Site Intent Map imports the same rule — no second copy of the matcher');
  const lib = readFileSync(new URL('../src/lib/intentOwnership.ts', import.meta.url), 'utf8');
  ok(!/from '@\//.test(lib) && !/from '\.\.?\/[^']+(?<!\.ts)'/.test(lib), 'E: edge-safe (no @/, explicit .ts)');
  const ui = readFileSync(new URL('../src/pages/PageGenerator.tsx', import.meta.url), 'utf8');
  ok(/intent_owned/.test(ui), 'E: the page shows the "already owned" answer');
}

/* ── F: the gate's price rule ── */
{
  const page = (body: string) => '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>Rewiring in Bristol | X</title><meta name="description" content="House rewiring in Bristol from a local electrician, with a fixed quote first."><link rel="canonical" href="https://x.co.uk/"></head><body><main><h1>Rewiring</h1>' + body + '</main></body></html>';
  const site = (body: string) => ({ mode: 'dist', pages: new Map([['/', page(body)]]), files: new Set<string>(), sizes: new Map(), sitemaps: new Map(), robots: '', headers: '', redirects: '', llms: false, live: null });
  const lvl = (body: string, prices?: string[]) => (auditSite(site(body), { domain: 'x.co.uk', expect: { businessName: 'X', ...(prices ? { prices } : {}) } }).checks.find((c: { id: string }) => c.id === 'prices')?.level);
  ok(lvl('<p>Call-outs from £90.</p>', []) === 'fail', 'F: a price on the site with NO approved prices fails (a price carried from the old site)');
  ok(lvl('<p>Call-outs from £90.</p>', ['Call-out £90']) === 'pass', 'F: an approved price passes');
  ok(lvl('<p>Call-outs from £90 and £120 after 5pm.</p>', ['£90']) === 'fail', 'F: one approved, one not → fails');
  ok(lvl('<p>£5m public liability insurance.</p>', []) === 'pass', 'F: "£5m" insurance cover is not a price');
  ok(lvl('<p>£1,200 full rewire.</p>', ['£1200']) === 'pass', 'F: thousands separators are normalised');
  ok(lvl('<p>From £90.</p>') === 'skip', 'F: no prices list → SKIP, never pass');
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
