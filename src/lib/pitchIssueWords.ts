/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE PITCH'S ISSUE WORDS (Paul, 2026-10-23, lean first replies) — one short plain line per website issue, for the
   first-reply pitch's bullet list, the "site shared" reply and the voice-note script. Record: docs/reply-playbook.md §5e.

   ⛔ KEYED BY THE ISSUE ID, never by its title: the operator screens and the client report keep their own wording
      (websiteCheck.ts plainIssueTitle). An id with no line here is LEFT OUT of the pitch, never said in jargon
      (page code / schema, sitemaps, canonicals, FAQ mark-up, a second homepage copy).
   ⛔ A town keeps its capital ("Your site doesn't mention Sunbury", never "sunbury is not mentioned").
   ⛔ Never how an AI decides; "may" for what our check saw.
   Pure and edge-reachable: relative imports with .ts, no Deno, no DOM.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { FULL_TEXT_MARK } from './siteClaims.ts';

/** The issue fields the words read (websiteCheck.ts WebsiteIssue). */
export interface PitchIssueInput { id: string; title: string; saw?: string; examples?: string[] }

/** Pitch-time ids whose absence claim is quoted only when the check read every page to the end (siteClaims.ts). */
const NEEDS_FULL_TEXT: ReadonlySet<string> = new Set(['location_unclear', 'town_missing', 'ct_areas_not_stated']);
const readInFull = (i: Pick<PitchIssueInput, 'saw'>): boolean => String(i.saw ?? '').includes(FULL_TEXT_MARK);

/** Most issues a list carries (Paul, 2026-10-23: "up to four short, specific, real issues"). */
export const PITCH_MAX_LIST = 4;
/** A list is never cut below this by the length rule. */
export const PITCH_MIN_LIST = 2;
/** The length rule (Paul, 2026-10-23: "about 70 to 100 words is fine"; 2026-10-26: "it should list more" → 115): the lowest
 *  issue goes until the message fits. The "that's just a few of them" line (replyMove.pitchMoreLine) is not counted. */
export const PITCH_MAX_WORDS = 115;

/** Our check could not read the site (the site-shared reply says it when that is all the check found). */
export const UNREADABLE_PITCH_LINE = "My check couldn't read your website, and AI tools may struggle with it too";
const MAIN_PAGES_UNCLEAR = "Your main pages don't say clearly what you do";
const NOT_LINKED = "Some important pages aren't linked from anywhere on your site";
const HIDDEN_PAGES = 'Some of your pages are hidden from Google';
/** The Google listing has no link to the site (or a social / directory page in its place). Also the "site shared" reply's own line. */
export const GOOGLE_LISTING_NO_LINK = "Your Google listing doesn't link to your website";
const GOOGLE_LISTING_OTHER_SITE = 'Your Google listing links to a different website';
const PASS_RATE_NO_SOURCE = "Your site quotes a pass rate but doesn't say where it comes from";
const RATING_NO_SOURCE = "Your site shows a star rating but doesn't say where it comes from";

const FIXED: Record<string, string> = {
  robots_blocks_all: 'Your site tells AI tools not to read it',
  search_crawler_refused: UNREADABLE_PITCH_LINE,
  one_page_site: 'Your website is just one page',
  no_service_pages: "Your services don't have their own pages",
  service_page_gaps: "Your services don't have their own pages",
  services_on_one_page: 'Several of your services are squeezed onto one page',
  thin_key_pages: 'Your main pages say very little about what you do',
  ct_areas_not_stated: "Your site doesn't say which areas you cover",
  /* ⛔ LEFT OUT ON PURPOSE (2026-10-25, fix/finding-accuracy): ct_area_coverage (the site DOES say where it works), and the
     technical ids vs_key_page_basics / missing_h1 / missing_title / missing_description / duplicate_titles. "No H1 tag" is a
     true fact about the page code, not that the pages "don't say clearly what you do" (a Weebly truck-training site with no
     H1 says so in its first line). Only the heading check, which reads what the headings SAY, may use the line. */
  ct_vague_headings: MAIN_PAGES_UNCLEAR,
  vs_name_inconsistent: 'Your business name is written different ways across your site',
  no_https: "Your site isn't secure (no padlock)",
  noindex_home: 'Your homepage is hidden from Google',
  noindex_pages: HIDDEN_PAGES,
  noindex_important_page: HIDDEN_PAGES,
  broken_pages: 'Some links on your site are broken',
  ct_link_mismatch: 'Some links on your site go to the wrong place',
  vs_town_swapped_pages: 'Lots of your pages are the same text with only the town swapped',
  near_duplicate_pages: 'Lots of your pages are near enough the same',
  ct_accreditations_unnamed: "Your site mentions being accredited but doesn't say who by",
  vs_address_not_on_key_pages: "Your address isn't on your homepage",
  no_phone: "There's no phone number on your site",
  no_contact_details: "There's no phone number on your site",
  no_contact_route: "There's no clear way to contact you on your site",
  no_viewport: "Your site isn't set up for phones",
  slow_pages: 'Your pages are slow to load',
  internal_linking: "Your service pages aren't linked from your homepage or menu",
  sitemap_only_pages: NOT_LINKED,
  deep_pages: NOT_LINKED,
  ct_no_proof: 'There are no reviews or testimonials on your site',
  ct_conflicting_facts: "Your site gives different figures for how long you've been trading",
  ct_placeholder_content: 'Some pages still have sample text on them',
};

/** The town an issue's own title names ("Arundel QLD is not mentioned on the site", "Homepage does not mention Banbury"). */
function townIn(title: string): string | null {
  const m = /^(.+?) is not mentioned on the site$/i.exec(title) ?? /does not mention (.+)$/i.exec(title);
  const t = m?.[1]?.trim() ?? '';
  return t && /^[A-Z]/.test(t) ? t : null;
}
/** The name the homepage uses, from the check's own "saw" (title: "…"), only when it is short and says something. */
function siteNameIn(saw: string | undefined): string | null {
  const m = /\(title:\s*[“"]([^”"]+)[”"]\)/.exec(saw ?? '');
  const t = (m?.[1] ?? '').split(/\s+[|–—-]\s+/)[0].trim();
  return t && t.toLowerCase() !== 'none' && t.length <= 40 ? t : null;
}
/** An empty greeting the check quoted ("Welcome, !"). */
const EMPTY_GREETING = /[“"]((?:Welcome(?: back)?|Hi|Hello|Hey|Dear|Thanks|Thank you),\s*[!.?])[”"]/i;

/** The empty greeting an issue quotes ("Welcome, !"), or null — the website check's plain title says it too. */
export function emptyGreetingIn(i: Pick<PitchIssueInput, 'saw' | 'examples'>): string | null {
  return (i.examples ?? []).map((x) => EMPTY_GREETING.exec(x)?.[1]).find(Boolean) ?? EMPTY_GREETING.exec(i.saw ?? '')?.[1] ?? null;
}

/** One issue's pitch line, or null (left out of the pitch). */
export function pitchIssueLine(i: PitchIssueInput): string | null {
  const id = String(i.id ?? '');
  if (NEEDS_FULL_TEXT.has(id) && !readInFull(i)) return null;
  if (id === 'location_unclear' || id === 'town_missing') {
    const town = townIn(String(i.title ?? ''));
    if (!town) return null;
    return id === 'town_missing' ? `Your homepage doesn't mention ${town}` : `Your site doesn't mention ${town}`;
  }
  if (id === 'name_unclear') {
    /* Only "not found on the homepage" (the medium one): the Google listing's name is missing from it. */
    if (!/not found/i.test(i.title)) return null;
    const said = siteNameIn(i.saw);
    return `Your site doesn't use the name on your Google listing${said ? ` (it says ${said})` : ''}`;
  }
  if (id === 'ct_placeholder_content') {
    const g = emptyGreetingIn(i);
    if (g) return `A line on your site reads "${g}" where a name should be`;
  }
  if (id === 'ct_listing_no_link') return /different website/i.test(i.title) ? GOOGLE_LISTING_OTHER_SITE : GOOGLE_LISTING_NO_LINK;
  if (id === 'ct_unsourced_claims') return /pass rate/i.test(`${i.title} ${i.saw ?? ''}`) ? PASS_RATE_NO_SOURCE : RATING_NO_SOURCE;
  if (id.startsWith('robots_blocks_pages_')) return 'Parts of your site are closed off to AI tools';
  if (id.startsWith('robots_blocks_')) return 'Your site tells AI tools not to read it';
  return FIXED[id] ?? null;
}

/**
 * The pitch lines for a checked site, worst first: the serious issues' lines, the same line once, at most PITCH_MAX_LIST.
 * "No named owner" (a minor finding) is said only beside the address line, as one line.
 */
export function pitchIssueLines(serious: readonly PitchIssueInput[], minor: readonly PitchIssueInput[] = []): string[] {
  const noOwner = minor.some((i) => i.id === 'ct_no_people') || serious.some((i) => i.id === 'ct_no_people');
  const out: string[] = [];
  for (const i of serious) {
    let line = pitchIssueLine(i);
    if (!line) continue;
    if (i.id === 'vs_address_not_on_key_pages' && noOwner) line = "There's no address on your homepage, and no named owner";
    if (!out.includes(line)) out.push(line);
    if (out.length >= PITCH_MAX_LIST) break;
  }
  return out;
}

export const wordCount = (s: string): number => s.replace(/•/g, ' ').split(/\s+/).filter(Boolean).length;
