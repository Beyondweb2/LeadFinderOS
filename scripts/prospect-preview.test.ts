/* PROSPECT PREVIEW — the generator, end to end on fixtures (test data only; no DB, no network,
   no WhatsApp). Cases A–J are the brief's. */

import { generatePreview, buildCardHtml, planPreview } from '../src/lib/prospectPreview/generate.ts';
import { copyImages, sniffImage, hotlinkedImages, resolveStoredAssets, STORED_ASSET_BASE, type CopiedImage } from '../src/lib/prospectPreview/assets.ts';
import { withShotCap, pngDimensions, shotWithinCap, SHOTS } from '../src/lib/prospectPreview/shots.ts';
import { pickOrdinaryAudit, siteDownFinding } from '../src/lib/prospectPreview/gather.ts';
import type { FactsInput } from '../src/lib/prospectPreview/facts.ts';
import { buildProspectConfig, areasFromText, cleanServices, yearsTradingClaims, sentencesOf } from '../src/lib/prospectPreview/facts.ts';
import { selectFindings, pickHeadline, previewEligibility, cardLine, engineGap } from '../src/lib/prospectPreview/findings.ts';
import { outreachRecommendation } from '../src/lib/prospectPreview/recommendation.ts';
import { copyProblems, suggestedMessage, buildCardCopy } from '../src/lib/prospectPreview/copy.ts';
import { extractPageFacts } from '../src/lib/warmLeadResearch.ts';
import { scanContamination } from '../src/lib/prospectPreview/contamination.ts';
import { selectTemplate, PROSPECT_TEMPLATES } from '../src/lib/prospectPreview/templates/index.ts';
import { fingerprint, planGenerate, previewFreshness, PROSPECT_PREVIEW_GENERATOR_VERSION, type FingerprintParts } from '../src/lib/prospectPreview/freshness.ts';
import { readBrand, stylesheetsToRead, svgLogoColours } from '../src/lib/prospectPreview/brand.ts';
import { paletteFrom, contrast, parseColor } from '../src/lib/prospectPreview/color.ts';
import { tradePackFor } from '../src/lib/prospectPreview/trades.ts';
import { eesFacts, eesHeadline, eesResearch, keylineFacts, keylineHeadline, FINDING_CRAWLER_BLOCKED, FINDING_NO_SERVICE_PAGES } from './prospect-preview-fixtures.ts';
import type { ProspectTemplate } from '../src/lib/prospectPreview/types.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const visible = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

/** What the drivers do: copy exactly the images the template will show (here every copy
 *  "succeeds", stored under a fake preview folder). */
const copiedAll = (facts: FactsInput): CopiedImage[] => {
  const p = planPreview(facts);
  return p.ok ? p.imagesToCopy.map((i) => ({ role: i.role, source: i.source, stored: `L/fp/src/${i.role}-${i.index}.jpg` })) : [];
};
const gen = (over: Partial<Parameters<typeof generatePreview>[0]> = {}) => {
  const facts = over.facts ?? eesFacts();
  return generatePreview({ facts, headline: eesHeadline(), research: eesResearch('strong'), year: 2026, images: copiedAll(facts), ...over });
};

/* ── A. strong technical issue ── */
{
  const g = gen();
  ok(g.ok, 'A: EES fixture generates');
  if (g.ok) {
    const p = g.preview;
    ok(p.selection.primary?.line === 'AI search crawlers are blocked', 'A: primary finding = crawler block');
    ok(p.selection.secondary.length === 2, 'A: two secondary findings');
    ok(!p.selection.secondary.some((s) => /meta description/i.test(s.line)), 'A: a missing meta description never makes the card');
    ok(p.card.competitors.join('|') === 'Addlestone Electricians|Pennington’s Electrical|Helsdown Electrical Contractors Ltd', 'A: card names the three audit competitors, in order');
    ok(p.card.notNamedLine === 'ChatGPT didn’t name E.E.S Electrical.', 'A: card names the ENGINE that did not name the prospect');
    ok(p.card.recommendedLabel === 'ChatGPT recommended', 'A: the recommended list is labelled with the engine, not "AI"');
    ok(/may be contributing/.test(p.card.bridgeLine), 'A: link between result and issues is hedged');
    ok(copyProblems([p.card.bridgeLine, p.card.rebuiltLine, ...p.card.issues].join(' ')).length === 0, 'A: card copy passes the claim check');
    const card = buildCardHtml(p, null);
    ok(card.ok && visible(card.ok ? card.html : '').includes('Helsdown Electrical Contractors Ltd'), 'A: rendered card carries the competitors');
    const home = visible(p.homepageHtml);
    ok(!/Addlestone Electricians|Pennington|Helsdown/.test(home), 'A: the HOMEPAGE never names a competitor');
    ok(!/we asked ai|visibility gap|audit/i.test(home), 'A: the homepage carries no sales/audit explanation');
    ok(/<h1>Electrical services in <em>Addlestone<\/em>/.test(p.homepageHtml), 'A: one H1 naming service + town');
    ok((p.homepageHtml.match(/<h1/g) ?? []).length === 1, 'A: exactly one H1');
    ok(p.homepageHtml.includes('noindex, nofollow'), 'A: homepage is noindex');
    ok(/"@type":"Electrician"/.test(p.homepageHtml) && /"telephone":"01632 960123"/.test(p.homepageHtml), 'A: LocalBusiness JSON-LD with their phone');
    ok(home.includes('NICEIC') && home.includes('Established 2009'), 'A: credentials + years stated on their site are shown');
    ok(home.includes('We replace old fuse boxes with modern consumer units'), 'A: a service card uses their own sentence');
    const descs = [...p.homepageHtml.matchAll(/<article class="svc">[\s\S]*?<p>([^<]*)<\/p>/g)].map((m) => m[1]);
    ok(new Set(descs).size === descs.length, 'A: no two service cards share a description');
    ok(!/Woking|Staines|Egham|Hersham/.test(home), 'A: towns that exist only as generated URLs are NOT shown as areas');
    ok(home.includes('Weybridge') && home.includes('Ottershaw'), 'A: towns their text names ARE shown');
    ok(!/24\/7|fully insured|guarantee|£/i.test(home), 'A: no invented claims or prices on the homepage');
    ok(/mocked up what i'd actually replace it with/.test(p.message) && !/£|price|comprehensive/i.test(p.message), 'A: message is the human opener, no price');
  }
}

/* ── B. weak / content issue only ── */
{
  const g = gen({ research: eesResearch('content') });
  ok(g.ok && g.preview.selection.primary?.line === 'Core services have no pages of their own', 'B: a content finding leads when there is no technical one');
  ok(g.ok && !g.preview.selection.fallback, 'B: not the fallback');
}

/* ── C. no meaningful technical issue ── */
{
  const g = gen({ research: eesResearch('clean') });
  ok(g.ok && g.preview.selection.fallback && g.preview.card.issues.length === 0, 'C: clean site → no issues listed (nothing invented)');
  ok(g.ok && /technically accessible, but ChatGPT still named other businesses/.test(g.preview.card.bridgeLine), 'C: truthful no-issue hook');
  ok(g.ok && !/found a few issues/.test(g.preview.message), 'C: message does not claim issues were found');
  const none = gen({ research: null });
  ok(none.ok && none.preview.selection.fallback && none.preview.card.issues.length === 0, 'C: unreadable site → no claim about the site');
}

/* ── D. missing logo ── */
{
  const g = gen({ facts: eesFacts({ logo: false }) });
  ok(g.ok && g.preview.homepageHtml.includes('class="wordmark"') && !g.preview.homepageHtml.includes('ees-logo.svg'), 'D: no logo → text wordmark, no image');
  ok(g.ok && g.preview.notes.some((n) => /No logo found/.test(n)), 'D: missing logo flagged to the operator');
  const withLogo = gen();
  ok(withLogo.ok && withLogo.preview.homepageHtml.includes(`${STORED_ASSET_BASE}L/fp/src/logo-0.jpg`) && !withLogo.preview.homepageHtml.includes('ees-logo.svg'), 'D: a found logo is used — from our stored copy');
}

/* ── E. missing photos ── */
{
  const g = gen();
  ok(g.ok && !/<img[^>]+(stock|photo)/.test(g.preview.homepageHtml) && !g.preview.homepageHtml.includes('class="hero-photo"'), 'E: no photos → no photo frames, no stock');
  ok(g.ok && g.preview.homepageHtml.includes('hero-card'), 'E: hero uses the services card instead');
  ok(g.ok && g.preview.notes.some((n) => /No genuine business photos/.test(n)), 'E: missing photos flagged');
  const withPhotos = gen({ facts: eesFacts({ photos: true }) });
  ok(withPhotos.ok && withPhotos.preview.homepageHtml.includes('class="hero-photo"'), 'E: genuine photos go in the hero');
}

/* ── F. conflicting source facts ── */
{
  const g = gen({ facts: eesFacts({ conflict: true }) });
  ok(g.ok, 'F: generates despite conflicts');
  if (g.ok) {
    const c = g.preview.config.conflicts.map((x) => x.field);
    ok(c.includes('years_trading') && c.includes('phone'), 'F: years-trading and phone conflicts flagged');
    const home = visible(g.preview.homepageHtml);
    ok(!home.includes('Established 2009') && !home.includes('25 years'), 'F: neither conflicting years claim is shown');
    ok(!home.includes('07700 900456') && home.includes('01632 960123'), 'F: lead-record phone used, the other only flagged');
  }
  const r = buildProspectConfig({ ...eesFacts(), siteInfo: { ...eesFacts().siteInfo!, address: 'Unit 1, KT15 2AA' }, lead: { ...eesFacts().lead, address: '9 High St, GU21 5AB' } });
  ok(r.ok && !r.config.business.address && r.config.conflicts.some((x) => x.field === 'address'), 'F: different postcodes → no address, conflict flagged');
}

/* ── G. template unavailable ── */
{
  const g = gen({ registry: [] });
  ok(!g.ok && g.stage === 'selecting_template', 'G: no template → fails at selecting_template');
  const approved: ProspectTemplate = { ...PROSPECT_TEMPLATES[0], id: 'findable-electrician', status: 'approved', trades: ['electrician'] };
  const pick = selectTemplate('electrician', [...PROSPECT_TEMPLATES, approved]);
  ok(pick.ok && pick.template.id === 'findable-electrician', 'G: an approved trade template beats the demo for its trade');
  const other = selectTemplate('plumber', [approved], { allowDemo: false });
  ok(!other.ok, 'G: an electrician template is never borrowed for a plumber');
}

/* ── H + I. staleness and regeneration ── */
{
  const parts: FingerprintParts = { leadId: 'L', website: 'https://www.ees.example/', auditId: 'A', runId: 'R', crawlAt: '2026-09-20T00:00:00Z', researchAt: null, template: 'findable-local-trade@1.0.0', generator: PROSPECT_PREVIEW_GENERATOR_VERSION };
  const stored = { status: 'ready', fingerprint_parts: parts };
  ok(planGenerate(stored, parts, false).action === 'reuse', 'H: same inputs → reuse, no rebuild');
  ok(previewFreshness(stored, { ...parts, website: 'ees.example' }).state === 'current', 'H: www / scheme / slash differences are the same site');
  const moved = planGenerate(stored, { ...parts, crawlAt: '2026-09-24T00:00:00Z', auditId: 'B' }, false);
  ok(moved.action === 'reuse' && moved.stale && moved.changed.includes('crawlAt') && moved.changed.includes('auditId'), 'H: new crawl / audit → marked stale, NOT rebuilt');
  ok(planGenerate(stored, { ...parts, template: 'findable-local-trade@2.0.0' }, false).action === 'reuse', 'H: template bump marks stale (reuse until Regenerate)');
  const r = planGenerate(stored, parts, true);
  ok(r.action === 'build' && r.reason === 'regenerate', 'I: Regenerate always rebuilds');
  ok(planGenerate(null, parts, false).action === 'build', 'I: nothing stored → build');
  ok(planGenerate({ status: 'failed', fingerprint_parts: parts }, parts, false).action === 'build', 'I: a failed preview is rebuilt on the next click');
  ok(fingerprint(parts) === fingerprint({ ...parts }) && fingerprint(parts) !== fingerprint({ ...parts, runId: 'R2' }), 'I: fingerprint is stable and input-sensitive');
}

/* ── J. another client's data never leaks ── */
{
  const a = gen();
  const b = generatePreview({ facts: keylineFacts(), headline: keylineHeadline(), research: eesResearch('content'), year: 2026 });
  ok(a.ok && b.ok, 'J: both prospects generate');
  if (a.ok && b.ok) {
    const bt = visible(b.preview.homepageHtml);
    ok(!/E\.E\.S|ees-electrical|960123|Addlestone|NICEIC/.test(bt), 'J: prospect B carries nothing of prospect A');
    ok(scanContamination(b.preview.homepageHtml, b.preview.config).length === 0, 'J: B scans clean');
    ok(scanContamination(b.preview.homepageHtml, b.preview.config, ['E.E.S Electrical', '01632 960123']).length === 0, 'J: B scans clean against A’s values');
  }
  // A leak is REFUSED: another prospect's phone smuggled into a service name.
  const poisoned = eesFacts();
  poisoned.siteInfo!.services = [...poisoned.siteInfo!.services!, 'Call 01632 960777 today'];
  const p = gen({ facts: poisoned });
  ok(!p.ok && p.stage === 'building' && !!p.contamination?.some((h) => h.rule === 'foreign_contact'), 'J: a foreign phone number refuses the preview');
  const mcl = eesFacts();
  mcl.siteInfo!.services = [...mcl.siteInfo!.services!, 'MC Locksmiths Partnership'];
  const m = gen({ facts: mcl });
  ok(!m.ok && !!m.contamination?.some((h) => h.rule === 'other_client'), 'J: a Website Build seed value (MC Locksmiths) refuses the preview');
  const host = eesFacts();
  host.brand!.photos = ['https://cdn.other-client.example/van.jpg'];
  ok(gen({ facts: host }).ok, 'J: a photo host is the prospect’s own asset list (allowed)');
  // …but a photo on a host the config does not hold is refused.
  const cfg = buildProspectConfig(eesFacts());
  ok(cfg.ok && scanContamination('<img src="https://cdn.somebody-else.example/x.jpg">', cfg.config).length === 1, 'J: an unknown host is refused');
  // A prospect genuinely in Canterbury may say Canterbury.
  const cant = buildProspectConfig({ ...eesFacts(), audit: { trade: 'Electricians', town: 'Canterbury' } });
  ok(cant.ok && scanContamination('<p>Electrician in Canterbury</p>', cant.config).length === 0, 'J: a seed town that is genuinely the prospect’s is allowed');
  ok(cfg.ok && scanContamination('<p>Serving Canterbury</p>', cfg.config).length === 1, 'J: …and refused for anyone else');
}

/* ── claim wording ── */
ok(copyProblems('AI recommended your competitors because your website blocks OAI-SearchBot.').length > 0, 'claims: causal "because your website" refused');
ok(copyProblems('This will make AI recommend you.').length > 0, 'claims: "will make AI recommend" refused');
ok(copyProblems('Guaranteed first page.').length > 0, 'claims: guarantee refused');
ok(copyProblems('Only £99 to start').length > 0, 'claims: price refused');
ok(copyProblems('These issues may be contributing to the visibility gap.').length === 0, 'claims: hedged line allowed');
ok(suggestedMessage(eesHeadline(), selectFindings(eesResearch('strong')), false).includes('no website'), 'message: no-website variant');

/* ── headline + eligibility ── */
{
  const data = { businessName: 'X', businessType: 'electricians', named: 0, total: 6, pct: 0, perEngine: [], competitors: [], generatedAtLabel: '',
    gutPunch: { question: 'electrician in Addlestone', engineLabel: 'ChatGPT', rivals: ['A', 'B', 'junk'], businesses: ['A', 'B'] },
    questionBreakdown: [{ question: 'electrician in Addlestone', namedYou: false, rivals: ['A', 'B'] }] };
  const h = pickHeadline(data as never, { auditId: 'a', runId: 'r', trade: 'Electricians', town: 'Addlestone' });
  ok(!!h && h.competitors.join() === 'A,B' && h.engines[0] === 'ChatGPT', 'headline: the report’s lead example, junk-filtered firms');
  ok(pickHeadline({ ...data, namesWithheld: true } as never, { auditId: 'a', runId: null, trade: null, town: null }) === null, 'headline: withheld names → no card');
  ok(pickHeadline({ ...data, gutPunch: null } as never, { auditId: 'a', runId: null, trade: null, town: null }) === null, 'headline: no damning example → no card');
  const base = { headline: h, auditComplete: true, hasWebsite: true, hasPhoneOrEmail: true, hasTown: true };
  ok(previewEligibility(base).eligible, 'eligible: poor audit, competitors, website');
  ok(!previewEligibility({ ...base, headline: { ...h!, namedDatapoints: 4, totalDatapoints: 6 } }).eligible, 'ineligible: named in most answers');
  ok(!previewEligibility({ ...base, auditComplete: false }).eligible, 'ineligible: no completed audit');
  ok(!previewEligibility({ ...base, hasWebsite: false, hasPhoneOrEmail: false }).eligible, 'ineligible: nothing truthful to build from');
}

/* ── phone rule (Paul, 2026-09-26) ── */
{
  const same = buildProspectConfig(eesFacts());
  ok(same.ok && same.config.conflicts.every((c) => c.field !== 'phone'), 'phone: agreeing numbers → used normally, no conflict');
  const diff = buildProspectConfig({ ...eesFacts(), fixture: false, contactPhone: '447700900111' });
  ok(diff.ok, 'phone: mismatch still builds');
  if (diff.ok) {
    const c = diff.config;
    ok(c.business.phone?.value === '07700 900111' && c.business.phone.source === 'outreach_contact', 'phone: CTA uses the number we are messaging, labelled outreach-only');
    ok(c.business.websitePhone?.value === '01632 960123' && c.business.websitePhone.source === 'existing_site', 'phone: the website number stays recorded as its own fact');
    ok(c.conflicts.some((x) => x.field === 'phone' && x.note.startsWith('Phone mismatch: LeadFinder/contact number is 07700 900111; current website shows 01632 960123.')), 'phone: operator note in the agreed wording');
    ok(c.requiresResolution.some((r) => /Phone mismatch/.test(r)), 'phone: a paid build would have to resolve it');
  }
  const g = gen({ facts: { ...eesFacts(), contactPhone: '07700 900111' } });
  ok(g.ok && !visible(g.preview.homepageHtml).includes('01632 960123') && g.preview.card.issues.every((l) => !/phone|number/i.test(l)), 'phone: page shows one number; the card is not about the mismatch');
  ok(g.ok && g.preview.notes.some((n) => /Phone mismatch/.test(n)), 'phone: mismatch surfaced in the operator notes');
}

/* ── images are copied, never hotlinked ── */
{
  const facts = eesFacts({ photos: true });
  const p = planPreview(facts);
  ok(p.ok && p.imagesToCopy.length === 4 && p.imagesToCopy[0].role === 'logo', 'images: only the logo + the photos the template shows are listed');
  const many = eesFacts({ photos: true });
  many.brand!.photos = Array.from({ length: 30 }, (_, i) => `https://ees.example/p${i}.jpg`);
  const pm = planPreview(many);
  ok(pm.ok && pm.imagesToCopy.filter((x) => x.role === 'photo').length === 8, 'images: never more photos than the template budget (never the media library)');
  const none = generatePreview({ facts, headline: eesHeadline(), research: eesResearch('strong'), year: 2026 });
  ok(none.ok && hotlinkedImages(none.preview.homepageHtml).length === 0 && !/127\.0\.0\.1|stock-0/.test(none.preview.homepageHtml), 'images: nothing copied → nothing shown (no hotlink, no stock)');
  ok(none.ok && none.preview.notes.some((n) => /could not be copied/.test(n)), 'images: an uncopied logo is flagged');
  const partial = copiedAll(facts).map((c, i) => (i === 2 ? { ...c, stored: null, failed: 'could not be fetched' } : c));
  const gp = generatePreview({ facts, headline: eesHeadline(), research: eesResearch('strong'), year: 2026, images: partial });
  ok(gp.ok && gp.preview.config.brand.photos.length === 2 && gp.preview.notes.some((n) => /1 selected photo/.test(n)), 'images: a failed fetch omits that photo gracefully');
  ok(gp.ok && hotlinkedImages(gp.preview.homepageHtml).length === 0, 'images: every <img> is our stored copy');
  ok(hotlinkedImages('<img src="https://their-site.example/van.jpg">').length === 1 && hotlinkedImages('<div style="background:url(https://x.example/a.jpg)">').length === 1, 'images: hotlink detector catches img and CSS url()');
  ok(resolveStoredAssets(`<img src="${STORED_ASSET_BASE}L/fp/src/photo-0.jpg">`, (path) => 'https://signed.example/' + path) === '<img src="https://signed.example/L/fp/src/photo-0.jpg">', 'images: placeholder origin swapped for a signed URL at render time');
  const jpg = new Uint8Array(20000); jpg.set([0xff, 0xd8, 0xff]);
  ok(sniffImage(jpg, 'image/jpeg', 'photo').ok, 'sniff: a JPEG passes');
  ok(!sniffImage(jpg, 'text/html', 'photo').ok, 'sniff: an HTML response is refused even with JPEG bytes');
  ok(!sniffImage(new TextEncoder().encode('<html>'.padEnd(20000)), 'image/png', 'photo').ok, 'sniff: non-image bytes refused whatever the header says');
  ok(!sniffImage(new Uint8Array(7_000_000).fill(0xff), 'image/jpeg', 'photo').ok, 'sniff: oversize refused');
  ok(sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'image/svg+xml', 'logo').ok, 'sniff: a clean SVG logo passes');
  ok(!sniffImage(new TextEncoder().encode('<svg onload="alert(1)"></svg>'), 'image/svg+xml', 'logo').ok, 'sniff: an SVG with script is refused');
  ok(!sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'.padEnd(20000)), 'image/svg+xml', 'photo').ok, 'sniff: SVG is a logo format only');
  const stored: string[] = [];
  const copied = await copyImages([
    { role: 'photo', source: 'https://a.example/1.jpg', index: 0 }, { role: 'photo', source: 'https://a.example/2.jpg', index: 1 }, { role: 'photo', source: 'https://a.example/3.jpg', index: 2 },
  ], 'L/fp', {
    fetchBytes: async (u) => (u.endsWith('1.jpg') ? { bytes: jpg, contentType: 'image/jpeg' } : u.endsWith('2.jpg') ? null : { bytes: new TextEncoder().encode('<html>'), contentType: 'text/html' }),
    store: async (path) => { stored.push(path); },
  });
  ok(copied[0].stored === 'L/fp/src/photo-0.jpg' && copied[1].stored === null && copied[2].stored === null && stored.length === 1, 'copy: good image stored; failed fetch and non-image omitted');
  ok(copied[0].source === 'https://a.example/1.jpg' && !!copied[1].failed && !!copied[2].failed, 'copy: provenance kept (source → stored, or why not)');
}

/* ── screenshot cap ── */
{
  const full = SHOTS.find((s) => s.asset === 'desktop_full')!;
  const hero = SHOTS.find((s) => s.asset === 'desktop_hero')!;
  const mobile = SHOTS.find((s) => s.asset === 'mobile_full')!;
  ok(SHOTS.every((s) => s.maxCssHeight > 0 && (s.fullPage ? s.maxCssHeight >= s.height : s.maxCssHeight === s.height)), 'cap: every shot has a height limit');
  const capped = withShotCap('<html><body><p>x</p></body></html>', full);
  ok(capped.includes('var cap=6000') && capped.includes('"#faq"') && capped.indexOf('<script>') < capped.indexOf('</body>'), 'cap: full-page documents carry the cap + section shedding');
  ok(withShotCap('<html><body></body></html>', hero) === '<html><body></body></html>', 'cap: first-screen shots are untouched');
  const png = (w: number, h: number) => {
    const b = new Uint8Array(33); b.set([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
    b.set([(w >>> 24) & 255, (w >>> 16) & 255, (w >>> 8) & 255, w & 255], 16); b.set([(h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255], 20); return b;
  };
  ok(JSON.stringify(pngDimensions(png(1440, 4107))) === '{"width":1440,"height":4107}', 'cap: PNG size read from the header');
  ok(shotWithinCap(png(1440, 4107), full).ok && !shotWithinCap(png(1440, 6100), full).ok, 'cap: a too-tall full-page shot is refused');
  ok(shotWithinCap(png(1440, 900), hero).ok && !shotWithinCap(png(1440, 1200), hero).ok, 'cap: first-screen shots are exactly one screen');
  ok(shotWithinCap(png(780, 16000), mobile).ok && !shotWithinCap(png(780, 16100), mobile).ok, 'cap: mobile cap = CSS height × device scale');
}

/* ── audit choice ── */
{
  const pick = pickOrdinaryAudit([
    { id: 'm', created_at: '2026-09-25', audit_purpose: 'measurement', ai_audit_runs: [{ status: 'complete', run_number: 1 }] },
    { id: 'b', created_at: '2026-09-24', audit_purpose: 'baseline', ai_audit_runs: [{ status: 'complete', run_number: 1 }] },
    { id: 'r', created_at: '2026-09-23', audit_purpose: 'audit', ai_audit_runs: [{ status: 'running', run_number: 1 }] },
    { id: 'h', created_at: '2026-09-20', audit_purpose: null, ai_audit_runs: [{ status: 'capped', run_number: 1 }] },
  ]);
  ok(pick?.audit.id === 'h', 'audit: newest ORDINARY audit with a settled run (never a measurement or baseline)');
}

/* ── what the real-lead validation taught (2026-09-26) ── */
{
  // WordPress core palette + a theme default are not a brand.
  const wp = '<style id="global-styles-inline-css">:root{--wp--preset--color--vivid-red:#cf2e2e;--wp--preset--color--vivid-green-cyan:#00d084}</style><style>a{color:#13aff0}a:hover{color:#13aff0}.x{color:#13aff0}</style>';
  const b = readBrand(`<html><head>${wp}</head><body></body></html>`, 'https://x.example/', 'X');
  ok(b.primary === null, 'real: WordPress default palette and the OceanWP default are not read as brand colours');
  const own = readBrand(`<html><head>${wp}</head><body></body></html>`, 'https://x.example/', 'X', '.btn{background:#1b4f7a}.h{color:#1b4f7a}.f{border-color:#1b4f7a}');
  ok(own.primary === '#1b4f7a', 'real: a colour their OWN theme stylesheet uses is read');
  ok(JSON.stringify(stylesheetsToRead('<link rel="stylesheet" href="/wp-content/themes/x/style.css"><link rel="stylesheet" href="/wp-includes/css/dist/block-library/style.min.css"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?x">', 'https://www.x.example/')) === '["https://www.x.example/wp-content/themes/x/style.css"]', 'real: only their own theme stylesheet is fetched');
  const svg = svgLogoColours('<svg><path fill="#1b4f7a"/><path fill="#1b4f7a"/><path fill="#e8612c"/><path fill="#7fc3ea"/></svg>');
  ok(svg.primary === '#1b4f7a' && svg.accent === '#e8612c', 'real: an SVG logo gives the brand pair (deep colour + most distinct hue)');
  const withSvg = generatePreview({ facts: eesFacts(), headline: eesHeadline(), research: eesResearch('strong'), year: 2026,
    images: copiedAll(eesFacts()).map((c) => (c.role === 'logo' ? { ...c, logoColours: { primary: '#1b4f7a', accent: '#e8612c' } } : c)) });
  ok(withSvg.ok && withSvg.preview.config.brand.primary?.value === '#1b4f7a' && withSvg.preview.config.brand.primary.quote === 'the colours in their logo', 'real: logo colours outrank CSS colours');
  // Stock, clip-art, WP site icons and hover twins are not genuine business photos.
  const ph = readBrand('<main><img src="/wp-content/uploads/AdobeStock_205.jpeg" width="900"><img src="/wp-content/uploads/cropped-caution-svgrepo-com.png" width="512"><img src="/u/Boiler-installation-img.png" width="600"><img src="/u/Boiler-installation-Rollover.png" width="600"><img src="/u/518391851_1296_n.jpg" width="800"></main>', 'https://x.example/', 'X');
  ok(ph.photos.length === 2 && ph.photos.some((p) => p.endsWith('Boiler-installation-img.png')) && ph.photos.some((p) => p.endsWith('518391851_1296_n.jpg')), 'real: stock, clip-art and rollover duplicates excluded; genuine photos kept');
  // Menu pages that are not services, and boilerplate that is not a description.
  ok(cleanServices(['Heating', 'Plumbing', 'Bathrooms', 'Finance', 'Thankyou', 'R Coulson Plumbing', 'Complaint Procedure'], 'plumber', ['Scunthorpe'], 'R.Coulson Plumbing & Heating Ltd').join('|') === 'Heating|Plumbing|Bathrooms', 'real: Finance / Thankyou / Complaint Procedure / their own name are not services');
  const rc = buildProspectConfig({ ...eesFacts(), lead: { ...eesFacts().lead, business_name: 'R.Coulson Plumbing & Heating Ltd' }, pages: [{ url: 'https://rc.example/', ok: true, metaDescription: null,
    text: 'R.Coulson Plumbing & Heating Ltd works limited introduce customers to TradeHelp Ltd and do not receive a fee for the introduction. R. Coulson Plumbing & Heating Ltd have provided over 23 years of heating and plumbing services to homes and businesses across Scunthorpe.' }] });
  ok(rc.ok && /23 years of heating and plumbing/.test(rc.config.proof.summary?.value ?? '') && !/TradeHelp/.test(rc.config.proof.summary?.value ?? ''), 'real: a finance disclaimer is never the About text');
  // A site that is down is the finding; nothing older is said.
  const downPage = extractPageFacts('Not found: www.jolt.example', 'http://www.jolt.example/', 'https://www.jolt.example/', 404, false);
  const f404 = siteDownFinding('http://www.jolt.example/', downPage);
  ok(!!f404 && f404.strength === 5 && cardLine(f404) === 'Your website is showing a “Not found” error', 'real: a 404 homepage is a strength-5 finding');
  ok(siteDownFinding('http://x.example/', extractPageFacts('', 'http://x.example/', 'http://x.example/', 403, false)) === null, 'real: a 403 (could be bot-blocking) is NOT called down');
  const unreadSel = selectFindings({ status: 'failed', technicallyClean: false, strongestFindings: [FINDING_CRAWLER_BLOCKED, { ...FINDING_NO_SERVICE_PAGES }] });
  ok(unreadSel.primary?.id === FINDING_CRAWLER_BLOCKED.id && unreadSel.secondary.length === 0, 'real: site unreadable today → only the crawl’s measured findings survive');
  const noneSel = selectFindings({ status: 'failed', technicallyClean: false, strongestFindings: [] });
  const msg = suggestedMessage(eesHeadline(), noneSel, true);
  ok(!/accessible|issue|doesn't make/.test(msg), 'real: nothing is claimed about a site we could not read');
  const card = buildCardCopy(eesHeadline(), noneSel, 'X', true);
  ok(!/clearer|technically accessible/.test(card.bridgeLine), 'real: the card compares nothing it did not read');
  ok(/found an issue/.test(suggestedMessage(eesHeadline(), { primary: selectFindings(eesResearch('strong')).primary, secondary: [], fallback: false, fallbackReason: null }, true)), 'real: one issue is "an issue", not "a few"');
  // Named by one engine, missed by the other: a genuine gap (E.E.S Electrical).
  const half = { ...eesHeadline(), namedDatapoints: 1, totalDatapoints: 2, prospectNamed: true, engines: ['Gemini'] };
  ok(previewEligibility({ headline: half, auditComplete: true, hasWebsite: true, hasPhoneOrEmail: true, hasTown: true }).eligible, 'real: named 1 of 2 still qualifies');
  ok(buildCardCopy(half, selectFindings(eesResearch('strong')), 'E.E.S Electrical Services', true).notNamedLine === 'Gemini didn’t name E.E.S Electrical Services.', 'real: …and the card names the engine that missed them');
}

/* ── partial engine gap (Paul, 2026-09-26) ── */
{
  const h = eesHeadline();
  const el = (perEngine: Array<{ label: string; named: number; total: number }>) =>
    previewEligibility({ headline: { ...h, perEngine }, auditComplete: true, hasWebsite: true, hasPhoneOrEmail: true, hasTown: true });
  ok(el([{ label: 'ChatGPT', named: 3, total: 3 }, { label: 'Gemini', named: 0, total: 3 }]).eligible, 'gap: ChatGPT 3/3, Gemini 0/3 qualifies');
  // Overall 4 of 6 — the old overall-share rule refused this; per engine Gemini still missed them 2 of 3.
  ok(el([{ label: 'ChatGPT', named: 3, total: 3 }, { label: 'Gemini', named: 1, total: 3 }]).eligible, 'gap: ChatGPT 3/3, Gemini 1/3 qualifies (4 of 6 overall)');
  ok(!el([{ label: 'ChatGPT', named: 3, total: 3 }, { label: 'Gemini', named: 2, total: 3 }]).eligible, 'gap: named on most answers on EVERY engine → no preview');
  ok(!el([{ label: 'ChatGPT', named: 3, total: 3 }, { label: 'Gemini', named: 3, total: 3 }]).eligible, 'gap: named everywhere → no preview');
  const partial = el([{ label: 'ChatGPT', named: 3, total: 3 }, { label: 'Gemini', named: 0, total: 3 }]);
  ok(partial.eligible && partial.notes.some((n) => /Engine-specific gap: ChatGPT named them in 3 of 3; Gemini named them in 0 of 3/.test(n)), 'gap: the operator note states the measured split');
  ok(engineGap({ ...h, perEngine: [{ label: 'ChatGPT', named: 0, total: 3 }, { label: 'Gemini', named: 0, total: 3 }] }).kind === 'all', 'gap: missed on every engine = all');
  ok(engineGap({ ...h, perEngine: undefined, namedDatapoints: 5, totalDatapoints: 6 }).kind === 'none', 'gap: no per-engine rows → overall share decides');
  ok(engineGap({ ...h, perEngine: [{ label: 'ChatGPT', named: 0, total: 0 }], namedDatapoints: 0, totalDatapoints: 6 }).kind === 'all', 'gap: an engine that never answered is ignored');
  const gem = { ...h, engines: ['Gemini'], prospectNamed: true };
  for (const kind of ['strong', 'clean'] as const) {
    const c = buildCardCopy(gem, selectFindings(eesResearch(kind)), 'E.E.S Electrical Services', true);
    const words = [c.notNamedLine, c.recommendedLabel, c.bridgeLine].join(' ');
    ok(!/AI (?:is|doesn|didn|named|recommended|still)/.test(words) && /Gemini/.test(c.notNamedLine), `gap: ${kind} card never says "AI" missed them — it names Gemini`);
  }
  const unread = buildCardCopy(gem, selectFindings(null), 'X', true);
  ok(/^Gemini named other businesses/.test(unread.bridgeLine) && !/consistently/.test(unread.bridgeLine), 'gap: fallback wording names the engine and drops "consistently"');
}

/* ── card-only recommendation (Paul, 2026-09-26) ── */
{
  // Strong: services with their own descriptions, logo + colours, photos, proof.
  const strong = gen({ facts: eesFacts({ photos: true }) });
  ok(strong.ok && strong.preview.recommendation.send === 'card_and_homepage', 'rec: real services + brand + photos → card + homepage');
  // JOLT shape: site down, no services, no brand, no photos.
  const joltFacts: FactsInput = { ...eesFacts({ logo: false }), siteInfo: { email: null, phone: null, address: null, openingHours: null, services: [], towns: [] },
    pages: [{ url: 'https://www.ees-electrical.example/', ok: false, text: 'Not found', metaDescription: null, title: 'Not found' }],
    brand: { logoUrl: null, logoWarning: null, primary: null, accent: null, colourSource: 'fixture', photos: [] } };
  const down = selectFindings({ status: 'complete', technicallyClean: false, strongestFindings: [{ ...FINDING_CRAWLER_BLOCKED, id: 'rule:site_down_not_found', kind: 'other', strength: 5 }] });
  const jp = planPreview(joltFacts);
  ok(jp.ok, 'rec: the JOLT shape still plans (the homepage is still built)');
  if (jp.ok) {
    const html = jp.template.render(jp.config, { year: 2026 });
    const r = outreachRecommendation({ config: jp.config, selection: down, homepageHtml: html });
    ok(r.send === 'card_only', 'rec: site down + no business content → card only');
    ok(r.weaknesses.length >= 2 && !/error|fail/i.test(r.why), 'rec: reasons listed, worded as guidance not an error');
  }
  // No services but otherwise fine → card only with the service sentence.
  const noSvc = gen({ facts: { ...eesFacts({ photos: true }), siteInfo: { ...eesFacts().siteInfo!, services: [] }, pages: [{ url: 'https://www.ees-electrical.example/', ok: true, text: 'E.E.S Electrical is based in Addlestone. Call 01632 960123.', metaDescription: null, title: 'Home' }] } });
  ok(noSvc.ok && noSvc.preview.recommendation.send === 'card_only' && noSvc.preview.recommendation.why === 'Homepage preview is missing reliable service content.', 'rec: no reliable services → card only, and says why');
  // Not a gate: the homepage is still produced on a card-only recommendation.
  ok(noSvc.ok && noSvc.preview.homepageHtml.length > 1000, 'rec: card-only never withholds the homepage');
}

/* ── facts helpers ── */
ok(sentencesOf('E.E.S Electrical is based here. We do rewires.').length === 2, 'facts: "E.E.S" is not a sentence break');
ok(areasFromText('Areas we cover: Addlestone, Weybridge, New Haw and Walton-on-Thames.').join('|') === 'Addlestone|Weybridge|New Haw|Walton-on-Thames', 'facts: areas read from an "areas we cover" sentence');
ok(cleanServices(['Home', 'Rewiring', 'Electrician in Woking', 'Rewiring', 'Contact Us', 'EICR Testing | E.E.S'], 'electrician', ['Woking']).join('|') === 'Rewiring|EICR Testing', 'facts: nav noise, doorway titles and duplicates removed');
ok(yearsTradingClaims('Established in 2009. Over 15 years’ experience.', 2026).length === 2, 'facts: two years claims detected (→ conflict)');
ok(tradePackFor('Electricians').key === 'electrician' && tradePackFor('roofing contractors').key === 'roofer' && tradePackFor('dog groomers').key === 'generic', 'trades: pack by stored trade, generic fallback');
ok(cardLine(FINDING_CRAWLER_BLOCKED) === 'AI search crawlers are blocked', 'findings: card line for a crawler block');

/* ── brand reading ── */
{
  const html = `<html><head><meta name="theme-color" content="#0b5fcf"><style>:root{--e-global-color-accent:#facc15}</style></head><body>
<header><a href="/"><img class="site-logo" src="/wp-content/uploads/ees-logo.png" alt="E.E.S Electrical" width="220"></a>
<img src="/img/niceic-logo.png" alt="NICEIC approved"></header>
<main><img src="/wp-content/uploads/van-1024x683.jpg" width="1024" height="683"><img src="/wp-content/uploads/van-300x200.jpg" width="300" height="200">
<img src="/icons/phone.png" width="24"><img src="/wp-content/uploads/board.webp" alt="consumer unit"></main></body></html>`;
  const b = readBrand(html, 'https://ees.example/', 'E.E.S Electrical');
  ok(b.logoUrl === 'https://ees.example/wp-content/uploads/ees-logo.png', 'brand: header logo found, partner badge ignored');
  ok(b.primary === '#0b5fcf' && b.accent === '#facc15', 'brand: theme-color + builder accent variable');
  ok(b.photos.length === 2 && b.photos[0].endsWith('van-1024x683.jpg') && !b.photos.some((p) => /icons|niceic|logo/.test(p)), 'brand: photos deduped by size variant, icons/badges/logo excluded');
  ok(readBrand('', 'https://x.example/', 'X').logoUrl === null, 'brand: empty page → nothing');
  const pal = paletteFrom('#fde047', null);
  ok(contrast(parseColor(pal.primary)!, parseColor(pal.primaryInk)!) >= 3, 'palette: a pale brand colour still gets readable button text');
  ok(!paletteFrom(null, null).fromBrand, 'palette: no brand → neutral, marked as not theirs');
}

console.log(`\n${f === 0 ? 'ALL PASS' : `${f} FAILURES`}`);
if (f) throw new Error(`${f} failures`);
