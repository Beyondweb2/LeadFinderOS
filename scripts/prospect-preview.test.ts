/* PROSPECT PREVIEW — the generator, end to end on fixtures (test data only; no DB, no network,
   no WhatsApp). Cases A–J are the brief's. */

import { generatePreview, buildCardHtml } from '../src/lib/prospectPreview/generate.ts';
import { buildProspectConfig, areasFromText, cleanServices, yearsTradingClaims, sentencesOf } from '../src/lib/prospectPreview/facts.ts';
import { selectFindings, pickHeadline, previewEligibility, cardLine } from '../src/lib/prospectPreview/findings.ts';
import { copyProblems, suggestedMessage } from '../src/lib/prospectPreview/copy.ts';
import { scanContamination } from '../src/lib/prospectPreview/contamination.ts';
import { selectTemplate, PROSPECT_TEMPLATES } from '../src/lib/prospectPreview/templates/index.ts';
import { fingerprint, planGenerate, previewFreshness, PROSPECT_PREVIEW_GENERATOR_VERSION, type FingerprintParts } from '../src/lib/prospectPreview/freshness.ts';
import { readBrand } from '../src/lib/prospectPreview/brand.ts';
import { paletteFrom, contrast, parseColor } from '../src/lib/prospectPreview/color.ts';
import { tradePackFor } from '../src/lib/prospectPreview/trades.ts';
import { eesFacts, eesHeadline, eesResearch, keylineFacts, keylineHeadline, FINDING_CRAWLER_BLOCKED } from './prospect-preview-fixtures.ts';
import type { ProspectTemplate } from '../src/lib/prospectPreview/types.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const visible = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

const gen = (over: Partial<Parameters<typeof generatePreview>[0]> = {}) =>
  generatePreview({ facts: eesFacts(), headline: eesHeadline(), research: eesResearch('strong'), year: 2026, ...over });

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
    ok(p.card.notNamedLine === 'E.E.S Electrical wasn’t named.', 'A: card says the prospect was not named');
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
  ok(g.ok && /technically accessible, but AI is still naming other businesses/.test(g.preview.card.bridgeLine), 'C: truthful no-issue hook');
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
  ok(withLogo.ok && withLogo.preview.homepageHtml.includes('ees-logo.svg'), 'D: a found logo is used as found');
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
