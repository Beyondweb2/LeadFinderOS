/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE FINDABLE BUILD STANDARD (2026-09-27) — what MCL Locksmiths and BS4 Electrical taught, as rules
   the build prompt prints and the Preview Ready gate checks.

   Both reference sites needed the SAME manual rescue passes after generation: the hero photo swapped
   for a genuine one, the mobile hero rebuilt so the photo sits BEHIND the copy, genuine Google reviews
   added (neither first build showed any), a real map added to the areas pages, a mailto "form" replaced
   by the site-enquiry backend, and repeated photos removed. Every one of those was a thing the
   generator could have required and did not. This module is that requirement.

     BUILD_STANDARD_LINES    the rules (image roles, hero + mobile hero, reviews, map, forms, rhythm,
                             evidence first, credentials, commercial credibility) — printed into the
                             Build Execution prompt next to QUALITY_STANDARD_LINES (websiteQuality.ts)
     StandardReport          what the build must REPORT about itself (quality.standard in the result)
     StandardEvidence        what LeadFinderOS already knows about the client (websiteBuildState.ts
                             derives it from the stored state — standardEvidence())
     standardProblems()      the gate: report × evidence → the reasons it is not Preview Ready

   ⛔ Absent is never "fine" (CLAUDE.md §4): an unreported item is a gate problem, and every rule is
      asserted on the value we WANT (=== 'map', === 'shown', === 'passed'), never on one we exclude.
   ⛔ Principles, not a clone: nothing here names MCL's or BS4's layout, colours or CSS. A trade variant
      decides the look; this decides what a finished Findable site must never lack.
   ⚠️ Leaf module (no imports) — websiteBuildState.ts (edge-reachable via paid-client-hub),
      buildExecution.ts and the page reach it. Never a backtick inside a template literal (§3).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/* ── image roles ──────────────────────────────────────────────────────────────────────────────── */

export const IMAGE_ROLES = ['hero', 'about', 'our_work', 'process', 'areas', 'service', 'credentials'] as const;
export type ImageRole = (typeof IMAGE_ROLES)[number];
/** Each section's image, in preference order. Genuine client material always beats stock. */
export const IMAGE_ROLE_RULES: Record<ImageRole, string> = {
  hero: 'the strongest genuine identity image — a finished premium job, the branded van, or the owner in branded workwear; landscape, subject clear at hero size and at the phone crop. Never mid-job clutter, never stock.',
  about: 'the owner / team / family-run image where one exists (a portrait gets a taller phone crop so face AND workwear show); else a genuine job photo not used above it.',
  our_work: 'the strongest real job photography — a substantial set (a featured job + supporting shots) that keeps the old site\'s gallery / project strength. Never three photos out of forty; never weak or redundant shots added to make up a number.',
  process: 'a real, relevant work image (the work in progress or the kit), not the hero again.',
  areas: 'THE MAP FIRST. The areas hub prefers a genuine map / location visual; without a suitable map, a genuine geographic / local-context image; a genuine job or project photo only where it genuinely shows the locality or nothing stronger exists. Every fallback from the map states why. Never an arbitrary, unrelated job photo — relevance decides, not a ban.',
  service: 'a genuine photo of THAT service where one exists; otherwise no photo rather than a mismatched one.',
  credentials: 'the genuine accreditation marks the client supplied or shows on its own site — never redrawn, never invented.',
};

/** The site-enquiry function every Findable client form posts to (fn site-enquiry; recipient from its
 *  CLIENT_SITES by the ?site= key, never from the page). */
export const SITE_ENQUIRY_ENDPOINT = 'https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/site-enquiry';

/* ── the words: printed into the Build Execution prompt (X5c) ─────────────────────────────────── */

export const BUILD_STANDARD_LINES: string[] = [
  'EVIDENCE BEFORE COPY. Build each section from what the client genuinely has, in this order: real customer',
  'reviews · real photography · real credentials · real projects · the real location · real pricing / guarantees',
  '(where supported) · real experience. Write copy only around evidence — never fill space with generic marketing',
  'lines ("we pride ourselves on delivering exceptional solutions"). Pattern: CUSTOMER QUESTION → DIRECT ANSWER →',
  'SUPPORTING DETAIL → EVIDENCE, in plain English specific to this business.',
  'IMAGE ROLES — choose each image for its section, never the same strong image lazily everywhere:',
  ...IMAGE_ROLES.map((r) => '  ' + r.toUpperCase().replace('_', ' ') + ': ' + IMAGE_ROLE_RULES[r]),
  '  Weigh resolution, aspect ratio, subject, crop at desktop AND phone, and approval (USE only). A photo appears',
  '  once per page; across the site, prefer an unused genuine photo to a repeat. PHOTOGRAPHIC STRENGTH, NOT A QUOTA:',
  '  use enough genuine photography to represent the business properly — every important image role covered, the',
  '  old site\'s meaningful gallery / project strength preserved, and a rebuild with plenty of good genuine photos',
  '  never feeling visually sparser than the source. Never force in weak or redundant images to use more. Report',
  '  quality.standard.photographyPreserved (with photographyNote) and every repeat in repeatedImages.',
  'HERO: genuine image + a headline naming the service and the place + immediate trust (the strongest real proof:',
  '  rating, accreditation, years) + one obvious call to action. Desktop and phone need not share one treatment.',
  'MOBILE HERO — ONE COHERENT FIRST SCREEN: on phones and tablets the hero photo is normally the hero BACKGROUND',
  '  behind the copy (deliberate phone focal point, a gradient strongest where the text sits, text readable, the',
  '  call button obvious) — not a detached photo block under the text. A different treatment is allowed only for',
  '  a stated reason (report quality.standard.mobileHeroReason). ⛔ A MAP is never a background: its labels are the',
  '  information; on the areas hub it sits directly under the copy inside the same hero field.',
  'REVIEWS — GENUINE, SOURCE-BACKED REVIEWS ARE SHOWN BY DEFAULT: two or three genuine excerpts with their real',
  '  attribution and a link to the source profile. THE CURRENT AGGREGATE RATING AND COUNT ARE SHOWN BY DEFAULT too,',
  '  where confidently sourced (the client\'s own, correctly identified public profile, read at build time), with a',
  '  snapshot label because the figure moves (e.g. "4.8 from 145 Google reviews, September 2026"; report ratingAsOf).',
  '  Hold the rating (rating "held" + ratingHeldReason) ONLY when sources conflict, the profile\'s identity is',
  '  uncertain, the figure cannot be confidently sourced, or there is another genuine evidence concern — never as a',
  '  routine approval step. Third-party proof in an editorial block, visible without dominating. ⛔ Never invent a',
  '  review, reviewer, rating, count or date; no automatic Review / AggregateRating schema; no fake star treatment',
  '  (stars only exactly as the real rating, never five decorative stars).',
  'MAP / LOCATION PROOF: the areas hub leads with a genuine map of the real region by default — if none was supplied, a static',
  '  capture of the real map at 2x its rendered size with the provider attribution visible. ⛔ Never drawn, never',
  '  pins, radius rings or polygons, never a boundary the business has not stated. On phones use a crop / zoom that',
  '  keeps the key town labels legible — never the desktop map scaled down until they cannot be read. The homepage',
  '  carries a concise base / areas proof; a town page exists only with genuinely distinct local information.',
  'FORMS: an enquiry form must genuinely submit. Use the Findable site-enquiry backend (see X5d), never a mailto /',
  '  text-plain post dressed as a form, never a fake success message. A working form on the old site is never',
  '  downgraded to phone-only or mailto. Phone, WhatsApp and email stay one tap away on every page.',
  'CREDENTIALS: genuine accreditations (e.g. a trade body, a safety scheme, qualifications, checks, cover) get real',
  '  visual weight near the top of the homepage and on the pages they matter to — never buried in body copy, never a',
  '  badge the client does not hold. Report quality.standard.credentialsProminent.',
  'COMMERCIAL CREDIBILITY: the site represents the real business. Where the client serves landlords, letting',
  '  agents, property managers, builders or commercial clients, the composition and wording show it (a customer-type',
  '  band, commercial proof) — not every trade is a one-person emergency call-out.',
  'SECTION RHYTHM: compose deliberately — dark and light bands, full-width photography, image / text splits,',
  '  editorial ruled lists, proof inside content, cards only where cards help. Never card grid → card grid →',
  '  card grid, never mechanical background alternation.',
  'MOBILE FIRST: compose for the phone, not desktop-but-narrower — hero, image crops, long headings, tap targets',
  '  (44px+), the map crop, reviews, the form and any sticky call / WhatsApp control, checked at 390 and 375.',
];

/* ── the report (quality.standard in the build result) ───────────────────────────────────────── */

export const HERO_IMAGE_KINDS = ['genuine', 'stock', 'none'] as const;
export const MOBILE_HERO_KINDS = ['integrated', 'stacked', 'no_photo'] as const;
/** map = the default · local_image = a genuine geographic / local-context image · job_photo = a genuine job photo that
 *  shows the locality · other = an image unrelated to the locality (always a problem on a needed areas hub). */
export const AREAS_VISUAL_KINDS = ['map', 'local_image', 'job_photo', 'other', 'none', 'no_areas_page'] as const;
export const REVIEWS_KINDS = ['shown', 'not_shown', 'none_available'] as const;
export const RATING_KINDS = ['shown', 'held', 'none_available'] as const;
export const FORM_KINDS = ['site_enquiry', 'existing_handler', 'mailto_form', 'none'] as const;
export const FORM_TEST_KINDS = ['passed', 'failed', 'not_run'] as const;

export interface StandardReport {
  heroImage: (typeof HERO_IMAGE_KINDS)[number] | '';
  mobileHero: (typeof MOBILE_HERO_KINDS)[number] | '';
  mobileHeroReason: string;
  areasVisual: (typeof AREAS_VISUAL_KINDS)[number] | '';
  /** Why the areas hub does not lead with the map (any fallback). Stored key kept from 2026-09-27. */
  mapUnavailableReason: string;
  reviews: (typeof REVIEWS_KINDS)[number] | '';
  /** The aggregate rating / count: shown by default when confidently sourced. */
  rating: (typeof RATING_KINDS)[number] | '';
  /** The snapshot label shown beside a displayed rating ("September 2026"). */
  ratingAsOf: string;
  /** Why the rating is held (conflict, identity, unsourced, another evidence concern). */
  ratingHeldReason: string;
  form: (typeof FORM_KINDS)[number] | '';
  /** The preview's TEST-mode submission (site-enquiry answers test mode on *.pages.dev). */
  formTest: (typeof FORM_TEST_KINDS)[number] | '';
  credentialsProminent: boolean | null;
  /** Distinct genuine photos used across the built site — reported for the record, never a quota. */
  photosUsed: number | null;
  /** The site represents the client's genuine photography properly: roles covered, the old gallery / project
   *  strength kept, not sparser than the source. Judged, not counted. */
  photographyPreserved: boolean | null;
  photographyNote: string;
  /** "photo → where it repeats" for every photo shown twice on a page or reused while unused ones exist. */
  repeatedImages: string[];
}
export const EMPTY_STANDARD: StandardReport = {
  heroImage: '', mobileHero: '', mobileHeroReason: '', areasVisual: '', mapUnavailableReason: '', reviews: '',
  rating: '', ratingAsOf: '', ratingHeldReason: '',
  form: '', formTest: '', credentialsProminent: null, photosUsed: null, photographyPreserved: null, photographyNote: '', repeatedImages: [],
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v)) ? v as Record<string, unknown> : {};
const str = (v: unknown, cap: number) => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim().slice(0, cap);
function oneOf<T extends string>(list: readonly T[], v: unknown): T | '' {
  const s = str(v, 40).toLowerCase();
  return (list as readonly string[]).includes(s) ? s as T : '';
}

/** One reader for the build result (camelCase) and the stored record (the same keys). */
export function readStandardReport(v: unknown): StandardReport {
  const o = obj(v);
  const n = Math.floor(Number(o.photosUsed));
  return {
    heroImage: oneOf(HERO_IMAGE_KINDS, o.heroImage),
    mobileHero: oneOf(MOBILE_HERO_KINDS, o.mobileHero),
    mobileHeroReason: str(o.mobileHeroReason, 400),
    areasVisual: oneOf(AREAS_VISUAL_KINDS, o.areasVisual),
    mapUnavailableReason: str(o.mapUnavailableReason, 400),
    reviews: oneOf(REVIEWS_KINDS, o.reviews),
    rating: oneOf(RATING_KINDS, o.rating),
    ratingAsOf: str(o.ratingAsOf, 60),
    ratingHeldReason: str(o.ratingHeldReason, 400),
    form: oneOf(FORM_KINDS, o.form),
    formTest: oneOf(FORM_TEST_KINDS, o.formTest),
    credentialsProminent: typeof o.credentialsProminent === 'boolean' ? o.credentialsProminent : null,
    photosUsed: o.photosUsed != null && o.photosUsed !== '' && Number.isFinite(n) && n >= 0 && n < 10000 ? n : null,
    photographyPreserved: typeof o.photographyPreserved === 'boolean' ? o.photographyPreserved : null,
    photographyNote: str(o.photographyNote, 400),
    repeatedImages: (Array.isArray(o.repeatedImages) ? o.repeatedImages : []).map((x) => str(x, 300)).filter(Boolean).slice(0, 40),
  };
}

export const STANDARD_RESULT_SCHEMA_LINE =
  '    "standard": { "heroImage": "genuine", "mobileHero": "integrated", "mobileHeroReason": "", "areasVisual": "map", "mapUnavailableReason": "", "reviews": "shown", "rating": "shown", "ratingAsOf": "", "ratingHeldReason": "", "form": "site_enquiry", "formTest": "passed", "credentialsProminent": true, "photosUsed": 0, "photographyPreserved": true, "photographyNote": "", "repeatedImages": [] }';
export const STANDARD_RESULT_RULES: string[] = [
  '- quality.standard (every build): heroImage genuine / stock / none · mobileHero integrated (photo behind the copy on',
  '  phones) / stacked (say why in mobileHeroReason) / no_photo · areasVisual map / local_image / job_photo (shows the',
  '  locality) / other (unrelated) / none / no_areas_page (any fallback from map needs mapUnavailableReason) · reviews',
  '  shown / not_shown / none_available · rating shown (with ratingAsOf, the snapshot label) / held (ratingHeldReason) /',
  '  none_available ·',
  '  form site_enquiry / existing_handler / mailto_form / none · formTest passed / failed / not_run (a real TEST-mode',
  '  submission from the preview) · credentialsProminent · photosUsed (distinct genuine photos, for the record) ·',
  '  photographyPreserved + photographyNote (roles covered, old gallery / project strength kept, not sparser than the',
  '  source) · repeatedImages ("file → pages / sections"). Report what you BUILT, not what was intended.',
];

/* ── what LeadFinderOS knows, and the gate ────────────────────────────────────────────────────── */

export interface StandardEvidence {
  /** Approved (USE) genuine photos in the asset inventory. */
  approvedPhotos: number;
  /** The client has public review evidence (a review strength kept, or a verified review profile). */
  hasReviewEvidence: boolean;
  /** The old site had a working enquiry form, and it was not removed with a reason. */
  hadWorkingForm: boolean;
  /** The areas hub is a needed intent (Quality standard → completeness). */
  areasHubNeeded: boolean;
  /** Verified accreditations / credentials exist. */
  hasCredentials: boolean;
  /** The old site's photography / gallery / project work is a kept strength. */
  hasPhotoStrength: boolean;
}

/** The Findable build standard's gate. Only a preview_ready result is judged (the caller decides). */
export function standardProblems(r: StandardReport, e: StandardEvidence): string[] {
  const out: string[] = [];
  const unreported: string[] = [];
  if (!r.heroImage) unreported.push('hero image');
  if (!r.mobileHero) unreported.push('mobile hero');
  if (!r.areasVisual) unreported.push('areas visual');
  if (!r.reviews) unreported.push('reviews');
  if (!r.form) unreported.push('form');
  if (unreported.length) out.push('Build standard not reported: ' + unreported.join(', ') + ' (quality.standard)');

  if (r.heroImage === 'stock') out.push('Hero uses a stock image — the hero must be the client\'s own genuine image');
  if (r.heroImage === 'none' && e.approvedPhotos > 0) out.push('Hero has no image although ' + e.approvedPhotos + ' genuine photo(s) are approved');
  if (r.mobileHero === 'stacked' && !r.mobileHeroReason) out.push('Mobile hero is a photo block under the text with no stated reason — on phones the photo belongs behind the copy (one first screen)');

  if (e.areasHubNeeded && r.areasVisual === 'other')
    out.push('Areas hub leads with an image unrelated to the locality — prefer the map, else a genuine local / geographic image');
  else if (e.areasHubNeeded && (r.areasVisual === 'local_image' || r.areasVisual === 'job_photo' || r.areasVisual === 'none') && !r.mapUnavailableReason)
    out.push('Areas hub does not lead with a map (' + r.areasVisual + ') and gives no reason — the map is the default; a fallback must say why');
  if (e.areasHubNeeded && r.areasVisual === 'no_areas_page') out.push('An areas hub is needed but the build reports none');

  if (e.hasReviewEvidence && r.reviews && r.reviews !== 'shown') out.push('Genuine reviews exist but are not shown on the site (' + r.reviews + ')');
  if (e.hasReviewEvidence && !r.rating) out.push('Review rating / count not reported (rating shown / held / none_available)');
  if (r.rating === 'shown' && !r.ratingAsOf) out.push('The rating is shown without a snapshot label (ratingAsOf) — the figure moves');
  if (r.rating === 'held' && !r.ratingHeldReason) out.push('The rating is held with no reason — hold only for a conflict, uncertain identity, an unsourced figure or another evidence concern');

  if (r.form === 'mailto_form') out.push('The enquiry form is a mailto / text-plain post, not a working form — use the site-enquiry backend');
  if (e.hadWorkingForm && r.form === 'none') out.push('The old site had a working enquiry form; the new one has none (a downgrade)');
  if ((r.form === 'site_enquiry' || r.form === 'existing_handler') && r.formTest !== 'passed')
    out.push('The enquiry form was not proven by a test-mode submission from the preview (formTest ' + (r.formTest || 'not reported') + ')');

  if (e.hasCredentials && r.credentialsProminent !== true) out.push('Verified credentials are not reported as visually prominent');

  if (e.approvedPhotos > 0 || e.hasPhotoStrength) {
    if (r.photographyPreserved === false) out.push('Photographic strength not preserved' + (r.photographyNote ? ': ' + r.photographyNote : ' — the rebuild looks sparser than the client\'s genuine photography supports'));
    else if (r.photographyPreserved !== true) out.push('Photographic strength not reported (photographyPreserved)');
  }
  if (r.repeatedImages.length) out.push('Repeated images: ' + r.repeatedImages.slice(0, 4).join('; '));
  return out;
}
