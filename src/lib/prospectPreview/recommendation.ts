/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PROSPECT PREVIEW — what to SEND: the evidence card + homepage screenshots, or the card alone.

   ⛔ A RECOMMENDATION, NEVER A GATE. The homepage is always built, stored, viewable and
   downloadable; this only tells the operator whether it is strong enough to put in front of the
   owner. Nothing is sent from here or anywhere in Prospect Preview.

   ⛔ NO NUMERICAL QUALITY SCORE (Paul, 2026-09-26). Deterministic completeness checks on the REAL
   inputs (services, brand, photos, business content) plus one visual rule on the rendered page
   (how many substantial sections it actually carries). Each weakness is a sentence the operator
   can read; the decision is:
     - no reliable service content                    → CARD ONLY (the page cannot say what they do)
     - site down/unreadable AND thin business content → CARD ONLY
     - two or more other weaknesses                   → CARD ONLY (the page reads unfinished)
     - otherwise                                      → CARD + HOMEPAGE
   Real leads it was checked against: R.Coulson (card + homepage), JOLT (card only), E.E.S (the
   borderline case — whichever way the rule falls, the reasons say why).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import type { FindingSelection, ProspectConfig } from './types.ts';

export type OutreachSend = 'card_and_homepage' | 'card_only';

export const OUTREACH_SEND_LABELS: Record<OutreachSend, string> = {
  card_and_homepage: 'Card + homepage',
  card_only: 'Card only',
};

export interface OutreachRecommendation {
  send: OutreachSend;
  /** One plain sentence for the operator: why this recommendation. */
  why: string;
  /** Every weakness found, in reading order (empty on a strong page). */
  weaknesses: string[];
}

/** What makes a page look substantial, read from the RENDERED html. The template leaves a section
 *  out (or renders it bare) when it has nothing real to put in it, so this is the honest signal.
 *  About and Areas always render, so they count only with real content in them. */
const SUBSTANTIAL_SECTIONS: Array<[RegExp, string]> = [
  [/<section class="services"/, 'services'],
  [/<div class="hero-photo">/, 'hero photo'],
  [/<section class="gallery"/, 'gallery'],
  [/<div class="trust"/, 'trust bar'],
  [/<section class="about" id="about">/, 'about photo'],
  [/<p class="lead">/, 'their own description'],
  [/class="area-list"><span class="home">[\s\S]*?<\/span><span>/, 'several areas'],
];
/** Fewer substantial sections than this = the page visibly feels unfinished. */
export const MIN_SUBSTANTIAL_SECTIONS = 4;

export function outreachRecommendation(i: { config: ProspectConfig; selection: FindingSelection; homepageHtml: string }): OutreachRecommendation {
  const { config, selection, homepageHtml } = i;
  const weaknesses: string[] = [];

  const services = config.services;
  const described = services.filter((s) => !!s.description).length;
  const noServices = services.length === 0;
  const thinServices = !noServices && services.length < 3 && described === 0;
  if (noServices) weaknesses.push('Homepage preview is missing reliable service content.');
  else if (thinServices) weaknesses.push(`Only ${services.length} service${services.length === 1 ? '' : 's'} found, with no description from their own site.`);

  const hasLogo = !!config.brand.logoUrl;
  const hasColour = !!config.brand.primary;
  if (!hasLogo && !hasColour) weaknesses.push('No usable logo or brand colours — the page would not look like their business.');

  if (config.brand.photos.length === 0) weaknesses.push('No genuine photos of their work.');

  const hasProof = config.proof.credentials.length > 0 || !!config.proof.yearsTrading || !!config.proof.rating || !!config.proof.summary;
  if (!hasProof) weaknesses.push('No credentials, years trading, rating or description of the business to show.');

  const present = SUBSTANTIAL_SECTIONS.filter(([re]) => re.test(homepageHtml)).map(([, n]) => n);
  const sparse = present.length < MIN_SUBSTANTIAL_SECTIONS;
  if (sparse) weaknesses.push(`The rendered page has only ${present.length} substantial section${present.length === 1 ? '' : 's'} (${present.join(', ') || 'none'}) — it would look unfinished.`);

  const siteDown = !!selection.primary && /^rule:site_down/.test(selection.primary.id);
  const unread = !selection.primary && !!selection.fallbackReason?.startsWith('The current site could not be read');
  const thinBusiness = noServices || thinServices || !hasProof;

  if (noServices) {
    return { send: 'card_only', why: 'Homepage preview is missing reliable service content.', weaknesses };
  }
  if ((siteDown || unread) && thinBusiness) {
    return {
      send: 'card_only',
      why: `Current website is ${siteDown ? 'unavailable' : 'unreadable'} and there is insufficient business content for a strong replacement homepage.`,
      weaknesses,
    };
  }
  if (weaknesses.length >= 2) {
    return { send: 'card_only', why: `The homepage is thin on real inputs: ${weaknesses.slice(0, 2).map((w) => w.replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase())).join('; ')}.`, weaknesses };
  }
  return {
    send: 'card_and_homepage',
    why: weaknesses.length ? `Strong enough to send, with one gap: ${weaknesses[0].replace(/^./, (c) => c.toLowerCase())}` : 'The homepage is built from their real services, branding and photos.',
    weaknesses,
  };
}
