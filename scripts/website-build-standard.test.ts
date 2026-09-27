/* THE FINDABLE BUILD STANDARD (websiteBuildStandard.ts, 2026-09-27) — what MCL Locksmiths and BS4
   Electrical had to be corrected for by hand, as rules the prompt prints and the gate checks.
     A. the report reader (allowlist, absent = not reported)
     B. each rule, asserted on the value we want
     C. the evidence is DERIVED from the stored state
     D. the ONE Preview Ready gate carries it
     E. the map is a core asset slot (every route), and a map file is suggested for it
     F. REGRESSION — BS4 and MCL as first generated fail for the reasons Paul had to fix; as they
        stand today (2026-09-27) they pass. No site is regenerated: the reports are what each build
        was / is, from its own git history.
     G. the words: principles, not a clone; one copy of the rule */

import { readFileSync } from 'node:fs';
import {
  BUILD_STANDARD_LINES, EMPTY_STANDARD, IMAGE_ROLE_RULES, IMAGE_ROLES, MIN_PHOTO_USE_SHARE, PHOTO_USE_RULE_FROM,
  readStandardReport, standardProblems, type StandardEvidence, type StandardReport,
} from '../src/lib/websiteBuildStandard.ts';
import { buildExecutionStatus, parseWebsiteBuild, previewReadyProblems, standardEvidence } from '../src/lib/websiteBuildState.ts';
import { CORE_ASSET_SLOTS, MCL_TEMPLATE } from '../src/lib/websiteTemplates.ts';
import { mapAssets } from '../src/lib/templateMapping.ts';
import { isHighRiskFact } from '../src/lib/recon.ts';

let failures = 0;
function ok(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; }
const has = (list: string[], re: RegExp) => list.some((x) => re.test(x));

const NONE: StandardEvidence = { approvedPhotos: 0, hasReviewEvidence: false, hadWorkingForm: false, areasHubNeeded: false, hasCredentials: false };
const GOOD: StandardReport = readStandardReport({ heroImage: 'genuine', mobileHero: 'integrated', areasVisual: 'map', reviews: 'shown', form: 'site_enquiry', formTest: 'passed', credentialsProminent: true, photosUsed: 12, repeatedImages: [] });

/* ── A. the reader ── */
{
  const r = readStandardReport({ heroImage: 'GENUINE', mobileHero: 'sideways', photosUsed: '7', repeatedImages: ['a', '', 3], credentialsProminent: 'yes' });
  ok(r.heroImage === 'genuine' && r.mobileHero === '' && r.photosUsed === 7 && r.repeatedImages.join() === 'a,3' && r.credentialsProminent === null, 'A: tokens are an allowlist; an unknown value reads as not reported, never as a pass');
  ok(JSON.stringify(readStandardReport(undefined)) === JSON.stringify(EMPTY_STANDARD), 'A: nothing → the empty report');
  ok(has(standardProblems(EMPTY_STANDARD, NONE), /Build standard not reported: hero image, mobile hero, areas visual, reviews, form/), 'A: an unreported standard is a gate problem naming every missing item');
  ok(standardProblems(GOOD, NONE).length === 0, 'A: a complete, good report with no special evidence → no problems');
}

/* ── B. the rules ── */
{
  const ev = { ...NONE, areasHubNeeded: true };
  ok(has(standardProblems({ ...GOOD, areasVisual: 'other' }, ev), /Areas hub does not lead with a map/), 'B: areas hub needed + a job photo as its visual → problem (Areas → MAP)');
  ok(standardProblems({ ...GOOD, areasVisual: 'local_image', mapUnavailableReason: 'no map of a single estate is meaningful' }, ev).length === 0, 'B: …unless the build states why no map can be used');
  ok(has(standardProblems({ ...GOOD, areasVisual: 'no_areas_page' }, ev), /areas hub is needed but the build reports none/) && standardProblems({ ...GOOD, areasVisual: 'no_areas_page' }, ev).length === 1, 'B: a needed areas hub that was not built → one problem, not two');
  ok(standardProblems({ ...GOOD, areasVisual: 'none' }, NONE).length === 0, 'B: no areas hub needed → the map rule does not apply');

  ok(has(standardProblems({ ...GOOD, reviews: 'not_shown' }, { ...NONE, hasReviewEvidence: true }), /Genuine reviews exist but are not shown/), 'B: review evidence + reviews not shown → problem (reviews by default)');
  ok(has(standardProblems({ ...GOOD, reviews: 'none_available' }, { ...NONE, hasReviewEvidence: true }), /not shown on the site \(none_available\)/), 'B: …"none available" contradicting the evidence is not an escape');
  ok(standardProblems({ ...GOOD, reviews: 'none_available' }, NONE).length === 0, 'B: no review evidence → nothing invented, nothing required');

  ok(has(standardProblems({ ...GOOD, form: 'mailto_form', formTest: '' }, NONE), /mailto \/ text-plain post, not a working form/), 'B: a mailto form is never a working form, old form or not');
  ok(has(standardProblems({ ...GOOD, form: 'none', formTest: '' }, { ...NONE, hadWorkingForm: true }), /old site had a working enquiry form; the new one has none/), 'B: a working old-site form dropped → downgrade');
  ok(standardProblems({ ...GOOD, form: 'none', formTest: '' }, NONE).length === 0, 'B: no form, when the old site had none (phone / WhatsApp only) → allowed');
  ok(has(standardProblems({ ...GOOD, formTest: 'not_run' }, NONE), /not proven by a test-mode submission/) && has(standardProblems({ ...GOOD, formTest: '' }, NONE), /formTest not reported/), 'B: a real form must be PROVEN on the preview (test mode)');

  ok(has(standardProblems({ ...GOOD, mobileHero: 'stacked' }, NONE), /photo block under the text with no stated reason/), 'B: a stacked mobile hero with no reason → problem (one first screen)');
  ok(standardProblems({ ...GOOD, mobileHero: 'stacked', mobileHeroReason: 'a menu board needs to be read whole' }, NONE).length === 0, 'B: …a stated reason is allowed — not one hardcoded hero design');
  ok(has(standardProblems({ ...GOOD, heroImage: 'stock' }, NONE), /stock image/), 'B: a stock hero → problem');
  ok(has(standardProblems({ ...GOOD, heroImage: 'none' }, { ...NONE, approvedPhotos: 3 }), /no image although 3 genuine photo/) && standardProblems({ ...GOOD, heroImage: 'none', mobileHero: 'no_photo' }, NONE).length === 0, 'B: no hero image only when there is no genuine photo');

  const lots = { ...NONE, approvedPhotos: 40 };
  ok(has(standardProblems({ ...GOOD, photosUsed: 3 }, lots), /Only 3 of 40 approved genuine photos are used \(at least 20\)/), 'B: 40 genuine photos → never three (the share rule)');
  ok(standardProblems({ ...GOOD, photosUsed: 20 }, lots).length === 0 && standardProblems({ ...GOOD, photosUsed: 2 }, { ...NONE, approvedPhotos: PHOTO_USE_RULE_FROM - 1 }).length === 0, 'B: at the share, or a small set → fine');
  ok(has(standardProblems({ ...GOOD, photosUsed: null }, lots), /Genuine photos used not reported/), 'B: photosUsed not reported with a large set → problem');
  ok(has(standardProblems({ ...GOOD, repeatedImages: ['portrait.jpg → / hero and / about'] }, NONE), /Repeated images: portrait\.jpg/), 'B: a reported repeat → problem');
  ok(has(standardProblems({ ...GOOD, credentialsProminent: false }, { ...NONE, hasCredentials: true }), /credentials are not reported as visually prominent/) && has(standardProblems({ ...GOOD, credentialsProminent: null }, { ...NONE, hasCredentials: true }), /not reported as visually prominent/), 'B: verified credentials must be prominent (null is not true)');
}

/* ── C. evidence from the stored state ── */
{
  const s = parseWebsiteBuild({
    version: 2, route: 'bespoke',
    facts: [
      { key: 'review_profiles', label: 'Review profiles', value: 'Google Business Profile', status: 'verified', source: 'Paul' },
      { key: 'accreditations', label: 'Accreditations', value: 'NICEIC approved contractor', status: 'detected', source: 'recon' },
    ],
    quality: { strengths_reviewed: true, strengths: [{ category: 'contact_form', label: 'Enquiry form that submits', disposition: 'remove', reason: 'replaced by phone-only at the client\'s request' }], intents: { areas_hub: { need: 'needed', page: '/areas/' } } },
    manifest: { assets: [
      { source_url: 'https://x.co.uk/a.jpg', type: 'photo', approval: 'approved' }, { source_url: 'https://x.co.uk/b.jpg', type: 'photo', approval: 'pending' },
      { source_url: 'https://x.co.uk/logo.png', type: 'logo', approval: 'approved' },
    ] },
  });
  const e = standardEvidence(s);
  ok(e.approvedPhotos === 1, 'C: only APPROVED photos count (REVIEW, logos do not)');
  ok(e.hasReviewEvidence === true, 'C: a verified review profile is review evidence');
  ok(e.hasCredentials === false, 'C: a credential still awaiting approval is not verified evidence');
  ok(e.hadWorkingForm === false, 'C: a form strength removed WITH a reason is not a downgrade');
  ok(e.areasHubNeeded === true, 'C: the areas-hub decision comes from content completeness');
  const s2 = parseWebsiteBuild({ version: 2, quality: { strengths: [{ category: 'reviews', label: 'Google reviews widget: 138 reviews', disposition: '' }, { category: 'contact_form', label: 'Wix form', disposition: '' }] } });
  ok(standardEvidence(s2).hasReviewEvidence && standardEvidence(s2).hadWorkingForm, 'C: an UNDECIDED review / form strength is still evidence (absent decision ≠ no evidence)');
}

/* ── D. the ONE gate ── */
{
  const TECH_OK = {
    result_imported_at: '2026-09-27T12:00:00Z', result_status: 'preview_ready', preview_url: 'https://preview.x.pages.dev', noindex_confirmed: true,
    qa: { buildPassed: true, seedContaminationPassed: true, linksPassed: true, responsivePassed: true, schemaPassed: true },
    pages: ['/', '/services/', '/areas/', '/contact/'],
  };
  const quality = { strengths_reviewed: true, strengths: [{ category: 'reviews', label: 'Google reviews', disposition: 'preserve', where: 'section on /' }], intents: Object.fromEntries(['services_hub', 'service_pages', 'areas_hub', 'location_pages', 'faq_hub', 'quotes_pricing', 'about', 'our_work', 'contact', 'customer_types', 'urgent_services'].map((k) => [k, k === 'areas_hub' ? { need: 'needed', page: '/areas/' } : { need: 'not_needed', note: 'n/a' }])) };
  const withStd = (standard: Record<string, unknown>) => parseWebsiteBuild({ version: 2, route: 'bespoke', quality, build_execution: { ...TECH_OK, standard } });
  const good = withStd({ ...GOOD, photosUsed: 0 });
  ok(previewReadyProblems(good, false).length === 0 && buildExecutionStatus(good, true, false) === 'preview_ready', 'D: technical + quality + build standard → PREVIEW READY');
  const noReviews = withStd({ ...GOOD, reviews: 'not_shown' });
  ok(buildExecutionStatus(noReviews, true, false) === 'needs_attention' && has(previewReadyProblems(noReviews, false), /Genuine reviews exist/), 'D: a kept review strength + reviews left off → NEEDS ATTENTION, whatever Claude claimed');
  const photoAreas = withStd({ ...GOOD, areasVisual: 'other' });
  ok(has(previewReadyProblems(photoAreas, false), /Areas hub does not lead with a map/), 'D: the Areas-map rule reaches the gate');
  const page = readFileSync(new URL('../src/pages/WebsiteBuild.tsx', import.meta.url), 'utf8');
  ok(/standardProblems\(std, standardEvidence\(state\)\)/.test(page) && page.includes('Build standard (reported with the build)'), 'D: the Quality panel shows the reported standard and its problems');
}

/* ── E. the map slot ── */
{
  ok(CORE_ASSET_SLOTS.some((x) => x.id === 'map'), 'E: the map is a CORE asset slot — a bespoke / faithful build gets it (BS4 was bespoke and had none)');
  ok(MCL_TEMPLATE.assetSlots.filter((x) => x.id === 'map').length === 1, 'E: the template has exactly one map slot (not a duplicate)');
  const s = parseWebsiteBuild({ version: 2, route: 'bespoke', manifest: { assets: [
    { source_url: 'https://x.co.uk/img/bristol-bath-satellite-map.png', type: 'other', purpose: 'coverage map', approval: 'approved', suggested_filename: 'bristol-bath-satellite-map.png' },
    { source_url: 'https://x.co.uk/img/job-ev-wallbox.jpg', type: 'photo', purpose: 'EV charger job', approval: 'approved' },
  ] } });
  const mapSlot = mapAssets(CORE_ASSET_SLOTS, s).find((x) => x.slot.id === 'map')!;
  ok(mapSlot.suggestions[0]?.source_url.endsWith('satellite-map.png') === true, 'E: a map file is the first suggestion for the map slot, ahead of a job photo');
}

/* ── F. REGRESSION: the two reference builds ── */
{
  /* BS4 Electrical (bespoke). What LeadFinderOS held: 14 approved genuine photos, the old Wix site's
     Google reviews widget (138 reviews) and its working enquiry form as strengths, an areas hub needed,
     NICEIC verified. */
  const bs4: StandardEvidence = { approvedPhotos: 14, hasReviewEvidence: true, hadWorkingForm: true, areasHubNeeded: true, hasCredentials: true };
  /* As first generated (26d09fb → 03dc962): photo block under the text on phones, no reviews, a
     mailto / text-plain "form", no /areas/ hub, credentials held back, the owner portrait twice. */
  const bs4First = readStandardReport({ heroImage: 'genuine', mobileHero: 'stacked', areasVisual: 'no_areas_page', reviews: 'not_shown', form: 'mailto_form', formTest: 'not_run', credentialsProminent: false, photosUsed: 12, repeatedImages: ['electrician-portrait.jpg → / hero and /about/'] });
  const p1 = standardProblems(bs4First, bs4);
  ok(has(p1, /Mobile hero is a photo block/) && has(p1, /areas hub is needed but the build reports none/) && has(p1, /Genuine reviews exist/) && has(p1, /mailto/) && has(p1, /credentials are not reported as visually prominent/) && has(p1, /Repeated images/), 'F: BS4 as first generated fails on every correction Paul had to make (mobile hero, areas, reviews, form, credentials, repeats)');
  /* Today (preview 9d4ac83): conservatory hero behind the copy on phones, the Bristol–Bath map leads
     /areas/, genuine Google excerpts, the site-enquiry form proven in test mode, NICEIC on the first screen. */
  const bs4Now = readStandardReport({ heroImage: 'genuine', mobileHero: 'integrated', areasVisual: 'map', reviews: 'shown', form: 'site_enquiry', formTest: 'passed', credentialsProminent: true, photosUsed: 14, repeatedImages: [] });
  ok(standardProblems(bs4Now, bs4).length === 0, 'F: BS4 today passes the build standard');
  ok(has(standardProblems({ ...bs4Now, areasVisual: 'other' }, bs4), /Areas hub does not lead with a map/), 'F: BS4 /areas/ as it was this morning (the EV-charger photo) would now be caught');
  ok(isHighRiskFact('availability', ['24/7 emergency call-outs']) && isHighRiskFact('opening_hours', ['Open 24/7']), 'F: BS4\'s unsupported 24/7 still needs Paul, whatever field it sits in (the source-site fact rule)');

  /* MCL Locksmiths (template rebuild). Genuine van photos, Google reviews (214), a coverage map,
     phone / WhatsApp only (the old site's "forms" were mailto compose — not a working form),
     City & Guilds + DBS verified. */
  const mcl: StandardEvidence = { approvedPhotos: 13, hasReviewEvidence: true, hadWorkingForm: false, areasHubNeeded: true, hasCredentials: true };
  /* As first built (452d536): van photo as a block under the text on phones, no reviews shown, the
     ring diagram (not a map) on the areas page. */
  const mclFirst = readStandardReport({ heroImage: 'genuine', mobileHero: 'stacked', areasVisual: 'other', reviews: 'not_shown', form: 'none', formTest: '', credentialsProminent: true, photosUsed: 9, repeatedImages: [] });
  const p2 = standardProblems(mclFirst, mcl);
  ok(has(p2, /Mobile hero/) && has(p2, /Areas hub does not lead with a map/) && has(p2, /Genuine reviews exist/) && !has(p2, /form/i), 'F: MCL as first built fails on mobile hero, areas map and reviews — and NOT on the form (it never had a working one)');
  const mclNow = readStandardReport({ heroImage: 'genuine', mobileHero: 'integrated', areasVisual: 'map', reviews: 'shown', form: 'none', formTest: '', credentialsProminent: true, photosUsed: 9, repeatedImages: [] });
  ok(standardProblems(mclNow, mcl).length === 0, 'F: MCL today passes the build standard');
}

/* ── G. the words ── */
{
  const w = BUILD_STANDARD_LINES.join(' ');
  ok(IMAGE_ROLES.every((r) => w.includes(r.toUpperCase().replace('_', ' ') + ': ' + IMAGE_ROLE_RULES[r])), 'G: every image role is printed with its rule');
  ok(/AREAS: THE MAP/.test(w) && /never drawn, never\s+pins, radius rings or polygons/i.test(w.replace(/\s+/g, ' ')) && /labels legible/.test(w), 'G: the map rule — map first, never fabricated, legible on phones');
  ok(/Never invent a review, reviewer, rating, count or date/.test(w) && /never review \/ rating schema/.test(w), 'G: reviews by default, never invented, no review schema');
  ok(w.includes(Math.round(MIN_PHOTO_USE_SHARE * 100) + '%') && w.includes(PHOTO_USE_RULE_FROM + '+'), 'G: the photo share is printed from its constants (never a number in prose)');
  ok(!/MC ?Locksmiths|BS4|Morgan|Canterbury|Bristol|Knowle/i.test(w), 'G: principles, not a clone — no reference client is named in the rules');
  const src = readFileSync(new URL('../src/lib/websiteBuildStandard.ts', import.meta.url), 'utf8');
  ok(!/^import /m.test(src), 'G: websiteBuildStandard.ts is a leaf (edge-reachable through websiteBuildState)');
  const exec = readFileSync(new URL('../src/lib/buildExecution.ts', import.meta.url), 'utf8');
  ok((exec.match(/function standardProblems|export function standardProblems/g) ?? []).length === 0 && (readFileSync(new URL('../src/lib/websiteBuildState.ts', import.meta.url), 'utf8').match(/standardProblems\(/g) ?? []).length === 1, 'G: one copy of the rule — the gate calls it once, nothing re-implements it');
}

if (failures) { console.log(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll passed.');
