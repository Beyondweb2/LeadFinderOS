/* ════════════════════════════════════════════════════════════════════════════════════════════════
   INTENT OWNERSHIP — the ONE rule for "which page owns this intent?" (Paul, 2026-09-30)

   Used by every place that plans or proposes a page: the Website Build's Site Intent Map
   (siteGate.ts, X6b), the page generator's Q&A pages and its page-plan queue. Before a new page is
   proposed it asks, in this order:
     1. is the service / place genuinely supported? (the client's approved services and towns)
     2. does an existing page already own this intent?   → improve THAT page, never a second one
     3. would a new page compete with (cannibalise) one?  → name the competitors
   and only then allows a new page.

     ownershipFor()   the decision + the owner / competitors + the reasons, in plain words
     qaHeadings()     a natural title / H1 / slug for a question-led page: the question is the TARGET
                      INTENT, never the heading — built from the genuine service, place and business
     findNamed()      which of a list of genuine names a text mentions (word stems, never a substring)

   ⛔ A question is never copied into a title, H1 or slug (the site quality gate fails a verbatim one).
   ⛔ Never invents a service or a place: headings use only the names in the approved lists.
   ⚠️ Edge-reachable (page-generator): relative imports with .ts only, no @/. Pure.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/* ── matching ─────────────────────────────────────────────────────────────────────────────────── */

const stem = (w: string) => w.length <= 3 ? w : w.replace(/(ies)$/, 'y').replace(/(ing|ed)$/, '').replace(/(es|s)$/, '').replace(/e$/, '');
export const intentTokens = (s: string): string[] => (s.toLowerCase().replace(/&/g, ' and ').match(/[a-z0-9]+/g) ?? []).map(stem);
const STOP = new Set(['and', 'the', 'a', 'of', 'for', 'in', 'to', 'on', 'at', 'service', 'servic', 'local']);
/** Words a question may leave out and still mean the same service ("rewiring" = "house rewiring"). */
const SOFT = new Set(['house', 'home', 'domestic', 'residential', 'general', 'full', 'new', 'professional', 'expert', 'specialist', 'installation', 'install', 'repair', 'replacement'].map((w) => stem(w)));

/** Does `text` mention `name`? Every meaningful word of the name in order, or all present, or all but
 *  soft words present. Word stems — "Kent" is never found in "Kentish". */
export function mentions(text: string, name: string): boolean {
  const t = intentTokens(text), n = intentTokens(name).filter((w) => !STOP.has(w));
  if (!n.length) return false;
  for (let k = 0; k + n.length <= t.length; k++) if (n.every((w, j) => t[k + j] === w)) return true;
  /* an acronym in the name (EICR, PAT, CCTV) is distinctive on its own */
  const acr = (name.match(/\b[A-Z]{2,6}\b/g) ?? []).map((a) => stem(a.toLowerCase()));
  if (acr.some((a) => t.includes(a))) return true;
  const hard = n.filter((w) => !SOFT.has(w));
  return hard.length > 0 && hard.every((w) => t.includes(w)) && (n.length > 1 || hard.length === n.length);
}
/** The first (longest) of `names` that `text` mentions, or ''. */
export function findNamed(text: string, names: readonly string[]): string {
  return [...names].filter(Boolean).sort((a, b) => b.length - a.length).find((n) => mentions(text, n)) ?? '';
}
const sameName = (a?: string, b?: string) => !!a && !!b && (mentions(a, b) || mentions(b, a));
const normQ = (q: string) => intentTokens(q).join(' ');

/* ── ownership ────────────────────────────────────────────────────────────────────────────────── */

export type OwnedKind = 'home' | 'service' | 'location' | 'service_location' | 'qa' | 'content';
/** A page that exists (built, planned or live) and the intent it owns. */
export interface OwnedPage {
  /** The URL path or slug — how Paul finds it. */
  page: string;
  /** Its title / H1 / plan label, in words. */
  label: string;
  kind: OwnedKind;
  service?: string;
  town?: string;
  /** For a question-led page: the question it was made for. */
  question?: string;
  /** Where we know it from: "website build plan", "page queue", "live site"… */
  source: string;
}
export interface ProposedIntent {
  service?: string; town?: string; question?: string;
  /** A generic trade question ("best electrician near me"): owned by the home page, or the town's page. */
  generic?: boolean;
}
export interface OwnershipContext { services: readonly string[]; towns: readonly string[]; homeTown?: string }
export type OwnershipDecision = 'improve_existing' | 'new_page' | 'unsupported';
export interface Ownership {
  decision: OwnershipDecision;
  owner: OwnedPage | null;
  /** Pages a new page would sit next to — link them, and make the new page genuinely different. */
  competing: OwnedPage[];
  reasons: string[];
}

/**
 * The decision for one proposed intent against the pages that already exist. Pure.
 * ⛔ Positive matches only: an intent is "owned" when a page's recorded service / place (or, failing
 *    those, its title) says so — never guessed from a partial word.
 */
export function ownershipFor(intent: ProposedIntent, owned: readonly OwnedPage[], ctx: OwnershipContext): Ownership {
  const { service, town, question } = intent;
  const reasons: string[] = [];
  /* 1. genuinely supported? */
  if (service && !ctx.services.some((s) => sameName(s, service))) return { decision: 'unsupported', owner: null, competing: [], reasons: ['"' + service + '" is not one of the client\'s approved services — no page for it until it is.'] };
  if (town && !ctx.towns.some((t) => sameName(t, town)) && !sameName(ctx.homeTown, town)) return { decision: 'unsupported', owner: null, competing: [], reasons: ['"' + town + '" is not an approved service area — no page for it until it is.'] };
  const isHome = !!town && sameName(ctx.homeTown, town);
  const svcOf = (p: OwnedPage) => p.service || (p.kind === 'service' || p.kind === 'service_location' ? p.label : '');
  const townOf = (p: OwnedPage) => p.town || (p.kind === 'location' ? p.label : '');

  /* 2. an existing owner */
  const byQuestion = question ? owned.find((p) => p.question && normQ(p.question) === normQ(question)) : undefined;
  const exact = owned.find((p) => {
    if (service && town) {
      if (sameName(svcOf(p), service) && sameName(townOf(p), town)) return true;
      /* a service page with no town of its own covers the home town */
      if (isHome && sameName(svcOf(p), service) && !townOf(p) && p.kind === 'service') return true;
      return mentions(p.label, service) && mentions(p.label, town);
    }
    if (service) return sameName(svcOf(p), service) && (!townOf(p) || sameName(townOf(p), ctx.homeTown));
    if (town) return (p.kind === 'location' && sameName(townOf(p), town)) || (isHome && p.kind === 'home');
    return !!intent.generic && p.kind === 'home';
  });
  const owner = exact ?? byQuestion ?? null;
  if (owner) {
    reasons.push((owner.label || owner.page) + ' (' + owner.page + ', ' + owner.source + ') already owns ' + describe(intent) + ' — improve that page instead of adding another.');
    return { decision: 'improve_existing', owner, competing: [], reasons };
  }

  /* 3. who a new page would sit next to */
  const competing = owned.filter((p) =>
    (service && sameName(svcOf(p), service)) || (town && sameName(townOf(p), town) && p.kind !== 'home'));
  for (const c of competing) reasons.push('It sits next to ' + (c.label || c.page) + ' (' + c.page + '): link the two, and give the new page genuinely different content (' + (town && !isHome ? 'real local work, access, travel' : 'a different question answered') + ') or it cannibalises it.');
  if (!service && !town && !competing.length) reasons.push('A general question: a new page is fine only if it genuinely helps the client\'s customers; link it from the most relevant service page.');
  return { decision: 'new_page', owner: null, competing, reasons };
}
const describe = (i: ProposedIntent) => i.service && i.town ? i.service + ' in ' + i.town : i.service || i.town || (i.question ? 'this question' : 'this intent');

/* ── headings for a question-led page ─────────────────────────────────────────────────────────── */

const SMALL = new Set(['in', 'and', 'of', 'for', 'to', 'the', 'a', 'an', 'on', 'at', 'or', 'with', '&']);
/** "house rewiring" → "House Rewiring"; keeps acronyms (EICR) and the client's own capitals. */
export function headingCase(s: string): string {
  return s.trim().split(/\s+/).map((w, n) => (n > 0 && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}
/** Leading words that make a sentence a question, dropped to leave its topic. */
const ASKING = /^(who|what|whats|what's|where|when|why|how|which|can|could|do|does|did|is|are|was|should|would|will|much|many|long|often|best|good|recommended|top|cheapest|the|a|an|i|my|me|we|our|you|your|someone|somebody|anyone|there|get|find|need|to|near|me)\b\s*/i;
function topicOf(question: string): string {
  let t = question.replace(/[?!.]+$/g, '').replace(/\bnear me\b/gi, '').replace(/\s+/g, ' ').trim();
  for (let k = 0; k < 8 && ASKING.test(t); k++) t = t.replace(ASKING, '');
  return t.trim();
}

export interface QaHeadings { title: string; h1: string; slug: string; service: string; town: string; basis: 'service' | 'topic' | 'trade'; note: string }

/**
 * A natural title / H1 / slug for a page answering `question` (the target intent), from the GENUINE
 * service and place it names and the business name — never the question itself.
 *   who does rewiring in Bristol → H1 "House Rewiring in Bristol", title "House Rewiring Bristol | ABC Electrical"
 * No service named → the question's topic (asking words dropped), checked to differ from the question.
 */
export function qaHeadings(p: { question: string; services: readonly string[]; towns: readonly string[]; homeTown?: string; businessName: string; businessType?: string }): QaHeadings {
  const service = findNamed(p.question, p.services);
  const town = findNamed(p.question, [...p.towns, ...(p.homeTown ? [p.homeTown] : [])]);
  let h1: string, basis: QaHeadings['basis'], note = '';
  if (service) {
    h1 = headingCase(service) + (town ? ' in ' + headingCase(town) : '');
    basis = 'service';
  } else {
    const topic = topicOf(p.question);
    if (intentTokens(topic).length >= 2) { h1 = topic.charAt(0).toUpperCase() + topic.slice(1); basis = 'topic'; note = 'No approved service is named in the question — the heading is its topic; check it reads naturally.'; }
    else { h1 = headingCase((p.businessType || 'Our services').trim()) + (town ? ' in ' + headingCase(town) : ''); basis = 'trade'; note = 'The question names no service or clear topic — the heading uses the trade; check it does not compete with the home page.'; }
  }
  /* ⛔ never the question verbatim */
  if (normQ(h1) === normQ(p.question)) h1 = headingCase(topicOf(p.question) || h1);
  const brand = p.businessName.trim();
  const core = service ? headingCase(service) + (town ? ' ' + headingCase(town) : '') : h1;
  const title = fitTitle(core, brand);
  const slug = h1.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
  return { title, h1, slug, service, town, basis, note };
}
/** "Core | Brand" within 60 characters; the brand is dropped before the core is cut. */
function fitTitle(core: string, brand: string): string {
  const full = brand ? core + ' | ' + brand : core;
  if (full.length <= 60) return full;
  if (core.length <= 60) return core;
  let t = '';
  for (const w of core.split(/\s+/)) { if ((t + ' ' + w).trim().length > 60) break; t = (t + ' ' + w).trim(); }
  return t || core.slice(0, 60);
}

/* ── where owned pages come from ──────────────────────────────────────────────────────────────── */

/** "Electrician in Bath" / "Bath | ABC" → "Bath". */
export function bareTownOf(title: string): string {
  const m = title.match(/\bin\s+(.+)$/i);
  return (m ? m[1] : title).replace(/\s*[|–—-].*$/, '').trim();
}
/** The Website Build page plan (outreach_leads.website_build.pages: keep / create rows) as owned pages. */
export function ownedFromWebsiteBuild(websiteBuild: unknown): OwnedPage[] {
  const pages = (websiteBuild && typeof websiteBuild === 'object' && Array.isArray((websiteBuild as { pages?: unknown }).pages)) ? (websiteBuild as { pages: unknown[] }).pages : [];
  const out: OwnedPage[] = [];
  for (const raw of pages) {
    if (!raw || typeof raw !== 'object') continue;
    const p = raw as { family?: string; path?: string; title?: string; action?: string };
    if (p.action !== 'keep' && p.action !== 'create') continue;
    const page = String(p.path ?? '').trim(), label = String(p.title ?? '').trim();
    if (!page) continue;
    const kind: OwnedKind = p.family === 'homepage' ? 'home' : p.family === 'service' ? 'service' : p.family === 'location' ? 'location' : 'content';
    out.push({ page, label: label || page, kind, ...(kind === 'service' ? { service: label } : {}), ...(kind === 'location' ? { town: bareTownOf(label) } : {}), source: 'website build plan' });
  }
  return out;
}
/** Page-queue rows (client_pages) as owned pages: their primary question, and the service / place it names. */
export function ownedFromQueue(rows: ReadonlyArray<{ id?: string; slug?: string | null; job?: string | null; primary_question?: string | null; service?: string | null; town?: string | null; status?: string | null }>, lists: { services: readonly string[]; towns: readonly string[] }): OwnedPage[] {
  return rows.filter((r) => r && !['removed', 'merged', 'archived'].includes(String(r.status ?? ''))).map((r) => {
    const q = String(r.primary_question ?? '').trim();
    const service = String(r.service ?? '').trim() || findNamed(q, lists.services);
    const town = String(r.town ?? '').trim() || findNamed(q, lists.towns);
    return { page: String(r.slug ?? r.id ?? '').trim() || '(planned page)', label: String(r.job ?? '').trim() || q, kind: 'qa' as const, ...(service ? { service } : {}), ...(town ? { town } : {}), ...(q ? { question: q } : {}), source: 'page queue' };
  });
}
