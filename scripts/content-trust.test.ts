/* ════════════════════════════════════════════════════════════════════════════════════════════════
   CONTENT & TRUST CHECKS (src/lib/contentTrust.ts, 2026-10-11).

   Pins: each check fires on the pattern a person found by hand on electelectrical.com (11 Oct 2026),
   each false positive found while building it stays fixed (a director's own career is not the company's
   age; a dropdown "#" is not a dead link; an <a> with no href is not a link; a WhatsApp chat widget is not
   a reviews widget; a "Service" markup node is not the business; a NICEIC logo image is a named scheme),
   the Findable AI Visibility Master Standard's wording rules, and the wiring: the report's top-five card,
   the Inbox audit window, the call script, and old rows rendering exactly as before.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import {
  buildContentTrust, pageObservations, reportContentIssues, usableContentTrust, CONTENT_TRUST_KINDS, CONTENT_TRUST_VERSION,
  type ContentTrust, type ContentTrustKind, type PageObs,
} from '../src/lib/contentTrust.ts';
import { auditFromStoredCrawl } from '../src/lib/siteAudit.ts';
import { selectFindings } from '../src/lib/coldCallPlaybook.ts';
import { OVERVIEW_NO_NAMES_TEXT } from '../src/lib/aiOverview.ts';

let failures = 0;
function ok(cond: unknown, label: string) { if (!cond) failures++; console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`); }

const HOME = 'https://www.example-electrical.co.uk/';
const page = (path: string, body: string, head = '<meta name="viewport" content="width=device-width">') =>
  `<html><head><title>Example</title>${head}</head><body>${body}</body></html>`;
const obs = (path: string, body: string, head?: string) => pageObservations(page(path, body, head), new URL(path, HOME).href, HOME);
const kinds = (ct: ContentTrust) => ct.issues.map((i) => i.kind);
const issue = (ct: ContentTrust, k: ContentTrustKind) => ct.issues.find((i) => i.kind === k);
const build = (pages: PageObs[], extra: Partial<Parameters<typeof buildContentTrust>[0]> = {}) => buildContentTrust({
  pages, servedUrl: HOME, knownUrls: pages.map((p) => p.url), robotsTxt: 'User-agent: *\nAllow: /', sitemapsRead: 1,
  lead: { name: 'Example Electrical Ltd', town: 'Sheffield', trade: 'Electricians' }, partial: true, ...extra,
});

/* ── A. THE BENCHMARK PATTERNS (electelectrical.com, hand-checked 2026-10-11) ─────────────────────── */
const ELECT_HOME = obs('/', `
  <nav><a href="/commercial-industrial-electrical-contractors">Example C&amp;I</a><a href="/commercial-ev-charging">Example EV</a>
  <a href="/solar-pv-installation">Example PV</a><a href="/example-home-installation">Example Home</a></nav>
  <h1>The power behind your project</h1>
  <p>More than 20 years’ experience. Commercial &amp; industrial specialists. Accredited and compliant. 25+ years experience electrical contractors.</p>
  <p>We are based in Sheffield and work across South Yorkshire. Clear communication, accountable delivery and technical capability, from conversation to completion.</p>
  <a href="/commercial-ev-charging">EXPLORE ELECTRICAL →</a><a href="/solar-pv-installation">EXPLORE EV →</a><a href="/solar-pv-installation">EXPLORE PV →</a>
  <a href="#" class="project-card">Project 1</a><a href="#" class="project-card">Project 2</a><a href="#" class="project-card">Project 3</a>
  <a href="https://www.vauxhall.co.uk/"><img src="https://cdn.example.com/abc123def4567890abcdef12_vauxhall.svg" alt="The Paak logo"></a>
  <a href="https://www.kia.com/uk/"><img src="https://cdn.example.com/abc123def4567890abcdef13_kia.svg" alt="Ephicient logo"></a>
  <a href="https://www.ford.co.uk/"><img src="https://cdn.example.com/abc123def4567890abcdef14_ford.svg" alt="Ephicient logo"></a>
  <img src="https://cdn.example.com/6ac8aaa7fcf5fe9721b1d9b9_ChatGPT%20Image%209%20Oct%202026%2C%2009_46_19.avif" alt="">
  <img src="/team.jpg" alt=""><img src="/van.jpg" alt=""><img src="/job1.jpg" alt=""><img src="/job2.jpg" alt=""><img src="/job3.jpg" alt="">
  <a href="/post/one">September 9, 2026 Fleet charging</a><a href="/post/two">September 9, 2026 Workplace charging</a>
  <a href="/post/three">September 9, 2026 Planning works</a><a href="/post/four">September 9, 2026 Choosing a contractor</a>
  <p>Rob Taylor, Director. Rob has spent 20 years working across commercial projects. Jason has worked in the trade for 24 years.</p>
  <a href="mailto:info@example-electrical.co.uk">07590 409 416</a>
  <p>${'Our team brings proven capability to every commercial and industrial electrical project we take on. '.repeat(20)}</p>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Example Electrical","url":"/","telephone":"07590 409 416","address":{"@type":"PostalAddress","postalCode":"S9 1FZ"}}</script>
  <p>14 Julian Road, Sheffield, S9 1FZ. 07590 409 416</p>`);
const ELECT_CI = obs('/commercial-industrial-electrical-contractors', `<h1>Electrical Contractors</h1><p>An Approved Electrician with experience across the trade.</p>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Service","name":"Commercial Solar PV Systems"}</script>`);
const ELECT_EV = obs('/commercial-ev-charging', '<h1>Commercial EV Charging</h1><p>Charge points for depots and workplaces.</p>');
const ELECT_PV = obs('/solar-pv-installation', '<h1>Commercial Solar PV Installation</h1><p>Solar for commercial roofs.</p>');
const ELECT_HOMEPAGE = obs('/example-home-installation', '<h1>Electrical design &amp; installation for homes</h1><p>For homeowners.</p>');
const elect = build([ELECT_HOME, ELECT_CI, ELECT_EV, ELECT_PV, ELECT_HOMEPAGE]);
{
  const k = kinds(elect);
  ok(k.includes('vague_headings') && issue(elect, 'vague_headings')!.evidence.some((e) => /The power behind your project/.test(e)) && issue(elect, 'vague_headings')!.evidence.some((e) => /Electrical Contractors/.test(e)), 'A: vague H1s — homepage "The power behind your project" and service page "Electrical Contractors"');
  ok(!issue(elect, 'vague_headings')!.evidence.some((e) => /EV Charging|Solar PV/.test(e)), 'A: a specific H1 ("Commercial EV Charging") is not vague');
  ok(k.includes('accreditations_unnamed') && issue(elect, 'accreditations_unnamed')!.evidence.some((e) => /Accredited/.test(e)) && issue(elect, 'accreditations_unnamed')!.evidence.some((e) => /Approved Electrician/.test(e)), 'A: "Accredited" and "Approved Electrician" with no scheme named');
  ok(k.includes('placeholder_content') && issue(elect, 'placeholder_content')!.severity === 'high' && issue(elect, 'placeholder_content')!.evidence.length === 3, 'A: "Project 1/2/3" linking to "#" are placeholder blocks (High)');
  ok(k.includes('no_proof') && issue(elect, 'no_proof')!.title.startsWith('We couldn’t find') && issue(elect, 'no_proof')!.absence, 'A: no reviews / testimonials / case studies → "We couldn’t find…"');
  ok(k.includes('area_coverage') && /Sheffield/.test(issue(elect, 'area_coverage')!.evidence.join(' ')), 'A: only Sheffield / South Yorkshire named and no area pages');
  const cf = issue(elect, 'conflicting_facts');
  ok(cf && /20/.test(cf.evidence.join(' ')) && /25/.test(cf.evidence.join(' ')) && /20 years in one place and 25/.test(cf.spoken), 'A: "More than 20 years" vs "25+ years" is a conflict');
  ok(!cf!.evidence.some((e) => /24/.test(e)), 'A: a director’s own career ("has worked in the trade for 24 years") is never the company’s age');
  ok(k.includes('missing_entity_facts'), 'A: no founding year or company number');
  ok(k.includes('logo_alt_mismatch') && issue(elect, 'logo_alt_mismatch')!.evidence.some((e) => /The Paak logo.*vauxhall/.test(e)), 'A: "The Paak logo" on a Vauxhall logo linking to vauxhall.co.uk');
  ok(k.includes('image_alt'), 'A: most images have empty alt text');
  ok(k.includes('ai_images') && /ChatGPT Image/.test(issue(elect, 'ai_images')!.evidence.join(' ')), 'A: a "ChatGPT Image" file name suggests an AI-generated picture');
  const lm = issue(elect, 'link_mismatch')!;
  ok(lm && lm.evidence.some((e) => /EXPLORE ELECTRICAL.*\/commercial-ev-charging/.test(e)) && lm.evidence.some((e) => /EXPLORE EV.*\/solar-pv-installation/.test(e)), 'A: "Explore Electrical" → EV charging and "Explore EV" → solar are caught');
  ok(!lm.evidence.some((e) => /EXPLORE PV|Example (EV|PV|Home|C&I)/.test(e)), 'A: correct links and a brand prefix ("Example EV") are never flagged');
  ok(lm.evidence.some((e) => /phone number “07590 409 416” is linked as an email/.test(e)), 'A: a phone number linked as mailto: is caught');
  const dates = issue(elect, 'identical_dates');
  ok(dates && /4 posts dated 9 September 2026/.test(dates.evidence[0]), 'A: all four posts carry the same date');
  ok(k.includes('mixed_audience'), 'A: one page for home customers inside a commercial-first site');
  ok(k.includes('generic_copy'), 'A: the homepage reads as generic copy');
  ok(!k.includes('schema_mismatch') && k.includes('schema_incomplete') && elect.verified.some((v) => /structured data read/.test(v)), 'A: the markup was READ (not "could not verify"); a "Service" node is not the business; "url": "/" is incomplete');
  ok(elect.issues.every((i, n) => n === 0 || ({ high: 0, medium: 1, low: 2 })[elect.issues[n - 1].severity] <= ({ high: 0, medium: 1, low: 2 })[i.severity]), 'A: issues are ordered worst first');
}

/* ── B. FALSE POSITIVES STAY FIXED ───────────────────────────────────────────────────────────────── */
{
  const menu = obs('/', `<h1>Blocked Drains Wirral</h1>
    <a href="#" class="dropdown-toggle">Drainage</a><ul><li><a href="/drain-jetting">Drain Jetting</a></li></ul>
    <a>Blocked Drains Birkenhead</a><a href="/blocked-drains-wirral/birkenhead">Blocked Drains Birkenhead</a>
    <div class="elfsight-app-58e98424" data-elfsight-app-lazy></div>
    <img src="/images/niceic-approved-contractor.png" alt="">
    <p>Checkatrade reviews: “would highly recommend”. Established in 2009. Company number 12345678.</p>`);
  const ct = build([menu]);
  ok(!kinds(ct).includes('dead_links'), 'B: a dropdown parent ("#" + submenu) is not a dead link');
  ok(!kinds(ct).includes('link_mismatch'), 'B: an <a> with no href is not a link');
  ok(menu.creds.includes('NICEIC') && !kinds(ct).includes('no_accreditations') && !kinds(ct).includes('accreditations_unnamed'), 'B: a NICEIC logo IMAGE counts as a named scheme');
  ok(!kinds(ct).includes('missing_entity_facts') && ct.verified.some((v) => /Company number/.test(v)), 'B: a stated company number is recognised');
  const chat = obs('/', '<h1>Plumber in Leeds</h1><div class="whats-app-embed"><!-- Elfsight WhatsApp Chat --><div class="elfsight-app-1234"></div></div>');
  ok(chat.reviews.length === 0, 'B: a WhatsApp chat widget is not a reviews widget');
  const places = obs('/', '<p>Specialists in Electric Vehicle Charging and in Commercial work, based in Leeds.</p>');
  ok(places.places.includes('Leeds') && !places.places.some((p) => /Electric|Commercial/.test(p)), 'B: "Electric Vehicle Charging" is never read as a place');
  const work = build([obs('/', '<h1>EV charging in Leeds</h1><a href="/commercial-ev-charging">Commercial Workplaces</a>'), obs('/how-we-work', '<h1>How we work</h1>')], { knownUrls: [HOME + 'commercial-ev-charging', HOME + 'how-we-work'] });
  ok(!kinds(work).includes('link_mismatch'), 'B: a label sharing any word with its destination is fine ("Commercial Workplaces" → /commercial-ev-charging)');
  const areaSite = build([obs('/', '<h1>Drain unblocking in Wirral</h1><p>We cover Wallasey and Birkenhead.</p>')], { knownUrls: [HOME + 'blocked-drains-wirral/birkenhead'] });
  ok(!kinds(areaSite).includes('area_coverage'), 'B: a site WITH area pages gets no area advice (never "add more town pages")');
  const hub = build([obs('/', '<h1>Drain unblocking in Wirral</h1>'), obs('/services', '<h1>Our Services</h1>')]);
  ok(!kinds(hub).includes('vague_headings'), 'B: a hub page ("/services" → "Our Services") is an index, not a vague heading (RPD NW, live 2026-10-11)');
  const longPage = build([obs('/drain-jetting', `<h1>Drain jetting in Wirral</h1><p>Peace of mind, state of the art kit and value for money. ${'We jet drains clear of fat, scale and roots for homes and businesses. '.repeat(110)}</p>`)]);
  ok(!kinds(longPage).includes('generic_copy'), 'B: three stock phrases in a 1,400-word page is not "generic copy" (they must be dense)');
}

/* ── C. MASTER STANDARD WORDING RULES ────────────────────────────────────────────────────────────── */
{
  const all = [...elect.issues];
  ok(all.filter((i) => i.absence).every((i) => /^We couldn’t find/.test(i.title)), 'C: every absence is said "We couldn’t find…"');
  const words = all.flatMap((i) => [i.title, i.why, i.needs, i.spoken]).join('\n');
  ok(!/you (don['’]t|do not) have/i.test(words), 'C: never "You don’t have…"');
  const src = readFileSync(new URL('../src/lib/contentTrust.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok(!/llms\.txt/i.test(src), 'C: llms.txt is never mentioned in any issue');
  ok(!/\b(guarantee|will (rank|be recommended|be cited|be named)|rank (higher|first)|top of (google|chatgpt|the results))\b/i.test(src), 'C: no promise of rankings, citations or recommendations');
  ok(!/AI (reads|doesn’t run|does not run|decides|will)\b/.test(src), 'C: never a claim about how an AI decides');
  ok(/only where it is genuinely true and useful/.test(issue(elect, 'area_coverage')!.why) && /never a new office location or a town-swap page/.test(issue(elect, 'area_coverage')!.needs), 'C: area advice says "only where genuinely true and useful", never town-swap pages or invented offices');
  ok(/Never change dates to look fresh/.test(issue(elect, 'identical_dates')!.needs), 'C: never "change the dates to look fresh"');
  ok(/Never a scheme you are not in/.test(issue(elect, 'accreditations_unnamed')!.needs) && /never written for you/.test(issue(elect, 'no_proof')!.needs), 'C: never suggests inventing accreditations or reviews');
  ok(all.every((i) => i.title && i.why && i.needs && i.spoken && i.evidence.length && ['A', 'B', 'C'].includes(i.evidenceClass) && ['high', 'medium', 'low'].includes(i.severity)), 'C: every issue carries title, why, severity, evidence class, evidence, needs and a spoken line');
  ok(Object.values(CONTENT_TRUST_KINDS).every((k) => ['A', 'B', 'C'].includes(k.evidenceClass)), 'C: every kind has a Master Standard evidence class');
}

/* ── D. STORAGE, OLD ROWS, THE INBOX AUDIT WINDOW ────────────────────────────────────────────────── */
{
  ok(usableContentTrust(elect) === elect && usableContentTrust({ ...elect, version: CONTENT_TRUST_VERSION - 1 }) === null && usableContentTrust(undefined) === null, 'D: only the current version is believed');
  const signals = { homeUrl: HOME, fetchFailed: false, searchBlocked: [], readableAs: 'OAI-SearchBot', clientRendered: null, missingH1: false, noJsonLd: false, duplicates: null, thinPages: 0, pagesChecked: 5 };
  const oldRow = { url: HOME, mode: 'standard', result: { url: HOME, signals } };
  const newRow = { ...oldRow, result: { ...oldRow.result, contentTrust: elect } };
  const before = auditFromStoredCrawl(oldRow)!;
  const after = auditFromStoredCrawl(newRow)!;
  ok(!before.findings.some((f) => f.id.startsWith('ct_')), 'D: an old row (no contentTrust) gives exactly the audit it gave before');
  ok(elect.issues.every((i) => after.findings.some((f) => f.id === `ct_${i.kind}`)), 'D: the Inbox audit window shows ALL content & trust issues');
  const ph = after.findings.find((f) => f.id === 'ct_placeholder_content')!;
  ok(ph.evidenceClass === 'B' && /Real projects/.test(ph.needs ?? '') && ph.severity === 'high', 'D: each carries its evidence class and what the business would supply');
  ok(after.findings.every((f, n) => n === 0 || ({ high: 0, medium: 1, low: 2, good: 3 })[after.findings[n - 1].severity] <= ({ high: 0, medium: 1, low: 2, good: 3 })[f.severity]), 'D: the merged audit stays worst first');
  const rep = reportContentIssues(elect);
  ok(rep.length === elect.issues.length && rep[0].kind === 'placeholder_content' && rep.every((r) => 'evidence' in r && !('needs' in r)), 'D: the report view carries the words and one evidence line only');
}

/* ── E. THE CALL SCRIPT USES THE TOP ISSUES AS HOOKS ─────────────────────────────────────────────── */
{
  const signals = { homeUrl: HOME, fetchFailed: false, searchBlocked: [], readableAs: 'OAI-SearchBot', clientRendered: null, missingH1: false, noJsonLd: false, duplicates: null, thinPages: 0, pagesChecked: 5 };
  const now = Date.now();
  const out = selectFindings({
    lead: { website: HOME } as never, runCrawls: [],
    leadCrawl: { result: { version: 2, signals, contentTrust: elect } as never, createdAtMs: now - 60_000 },
    nowMs: now,
  });
  ok(out.status === 'findings' && out.findings.length >= 2 && out.findings.length <= 3, 'E: a crawl with only content issues still gives the call 2–3 website points');
  ok(out.findings[0].kind === 'placeholder_content' && !!out.findings[0].spoken, 'E: the strongest issue leads, with its own spoken line');
  ok(new Set(out.findings.map((f) => f.kind)).size === out.findings.length && !out.findings.some((f) => elect.issues.find((i) => i.kind === f.kind)?.severity === 'low'), 'E: one per theme, never a low one');
  const stale = selectFindings({ lead: { website: HOME } as never, runCrawls: [], leadCrawl: { result: { version: 2, signals, contentTrust: elect } as never, createdAtMs: now - 40 * 86_400_000 }, nowMs: now });
  ok(stale.findings.length === 0, 'E: a stale crawl’s content issues are never said');
}

/* ── F. THE OVERVIEW WORDS ───────────────────────────────────────────────────────────────────────── */
ok(!/no businesses named/i.test(OVERVIEW_NO_NAMES_TEXT) && /could not be read/.test(OVERVIEW_NO_NAMES_TEXT), 'F: a shown overview with no extracted names says names could not be read — never "no businesses named"');

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
