/* ════════════════════════════════════════════════════════════════════════════════════════════════
   Cold Call Playbook v1 (2026-09-23) — the assembly, and the promise that opening it spends nothing.

   Pinned here:
     1. The AI-first opening names REAL competitors when the stored answer has them, and names
        nobody when it does not — never a placeholder.
     2. Website findings come from siteFindings.ts (strongest first, with proof); a clean site says
        so honestly instead of padding.
     3. A junk / map-card / missing excerpt is not quoted.
     4. WhatsApp history makes it a FOLLOW-UP (no "never spoken" intro); none makes it a COLD call.
     5. No usable report → no link, said plainly.
     6. STRUCTURAL: the data hook and the panel contain no write, no invoke, no rpc — so opening the
        playbook cannot start an audit, a crawl, an Apify run, a model call or a send.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import {
  buildColdCallPlaybook,
  type PlaybookInput,
  type PlaybookMessage,
  type PlaybookReport,
} from '../src/lib/coldCallPlaybook.ts';
import { resolveSiteFindingsDetailed } from '../src/lib/siteFindings.ts';
import { CRAWL_CHECK_VERSION, type CrawlSignals } from '../src/lib/crawlCheck.ts';
import { SITE_EVIDENCE_VERSION, type SiteEvidence } from '../src/lib/siteEvidence.ts';
import { FINDABLE_MINIMUM_TERM_MONTHS, FINDABLE_OFFER_SUMMARY } from '../src/lib/findableOffer.ts';

let f = 0;
const ok = (cond: unknown, msg: string) => {
  if (cond) console.log('  ✓ ' + msg);
  else { f++; console.log('  ✗ ' + msg); }
};

const NOW = Date.parse('2026-09-23T10:00:00Z');
const DAY = 86_400_000;

const CLEAN: CrawlSignals = {
  homeUrl: 'https://acmelocks.co.uk/', fetchFailed: false, searchBlocked: [], readableAs: 'OAI-SearchBot',
  clientRendered: { flagged: false, visibleChars: 4000, htmlBytes: 30000, appShell: false },
  missingH1: true, noJsonLd: true, duplicates: null, thinPages: 0,
};
const THIN: CrawlSignals = {
  ...CLEAN, thinPages: 1, thinPageUrls: ['https://acmelocks.co.uk/'],
  checkedPages: [{ url: 'https://acmelocks.co.uk/', kind: 'other', words: 82, hasH1: true, readable: true }],
};
const SITEMAP_EVIDENCE: SiteEvidence = {
  version: SITE_EVIDENCE_VERSION,
  findings: [{
    kind: 'sitemap_wrong_domain', severity: 5, certainty: 'observed', tier: 'A', pageUrl: null,
    evidence: { observed: ['https://old-acme-site.com/services'], source: 'https://acmelocks.co.uk/sitemap.xml', subject: 'acmelocks.co.uk', counted: { matched: 34, of: 40 } },
    summary: 'sitemap lists another domain',
  }],
};

const crawl = (signals: CrawlSignals, ageDays = 1, evidence: SiteEvidence | null = null) => ({
  result: { version: CRAWL_CHECK_VERSION, signals, ...(evidence ? { evidence, evidenceVersion: SITE_EVIDENCE_VERSION } : {}) },
  createdAtMs: NOW - ageDays * DAY,
});

const REAL_EXCERPT = 'Several local locksmith services operate in Royal Tunbridge Wells and cater to both commercial and domestic clients. Many offer 24/7 emergency response and free quotes for lock changes.';

const gapReport = (namedInstead: string[], answerExcerpt = REAL_EXCERPT): PlaybookReport => ({
  hook: {
    questionsTested: 2,
    gap: { question: 'locksmith for businesses in Tunbridge Wells UK', engineLabel: 'Gemini', namedInstead, answerExcerpt },
    tested: [],
  },
});

const base = (over: Partial<PlaybookInput> = {}): PlaybookInput => ({
  lead: { id: 'lead-1', business_name: 'Acme Locksmiths Tunbridge Wells', phone: '07700 900123', website: 'https://acmelocks.co.uk', category: 'Locksmith', derived_town: 'Tunbridge Wells', status: 'contacted' },
  reportAudit: { id: 'aud-1', short_code: 'jgwsvw', created_at: new Date(NOW - 1 * DAY).toISOString(), business_name: 'Acme Locksmiths Tunbridge Wells', business_type: 'Locksmiths', location_text: 'Tunbridge Wells' },
  report: gapReport(['LockRite Locksmiths Tunbridge Wells', 'LockFit Tunbridge Wells', 'TN Locksmith', 'S.J. Osborne & Son']),
  runCrawls: [],
  leadCrawl: crawl(THIN),
  messages: [],
  nowMs: NOW,
  ...over,
});

const allText = (p: ReturnType<typeof buildColdCallPlaybook>): string => JSON.stringify(p);

console.log('── 1. NOT NAMED + REAL COMPETITORS ──');
{
  const p = buildColdCallPlaybook(base());
  const opening = p.opening.join(' ');
  ok(p.mode === 'cold', 'no messages → NEW COLD CALL');
  ok(/^Hi, is that /.test(p.opening[0]), 'opens by checking who picked up');
  ok(opening.includes('LockRite Locksmiths Tunbridge Wells') && opening.includes('LockFit Tunbridge Wells') && opening.includes('TN Locksmith'),
    'the opening names the first three REAL competitors from the stored answer');
  ok(!opening.includes('S.J. Osborne'), 'and only three — the fourth stays in the evidence box');
  ok(p.evidence.competitors.length === 4, 'the evidence box lists them all (up to the cap)');
  ok(/didn't come up in that answer/.test(opening), 'says the business did not come up — the AI result leads');
  ok(!/build (you )?(a )?websites?/i.test(opening), 'the opening does NOT lead with "I build websites"');
  ok(p.evidence.question === 'locksmith for businesses in Tunbridge Wells UK' && p.evidence.engine === 'Gemini' && p.evidence.named === false,
    'the exact question, the engine and the result are shown');
  ok(p.reportUrl === 'https://findable.live/r/jgwsvw', 'the short report link is the one offered');
  ok(p.context.auditDate === '22 Sep 2026', 'the AI result carries its date');
}
{
  const p = buildColdCallPlaybook(base({ report: gapReport(['Acme Locksmiths', 'LockFit Tunbridge Wells']) }));
  ok(!p.evidence.competitors.some((n) => /^acme/i.test(n)), 'the business is never listed as its own competitor');
}

console.log('── 2. NOT NAMED + NO COMPETITORS ──');
{
  const p = buildColdCallPlaybook(base({ report: gapReport([]) }));
  const opening = p.opening.join(' ');
  ok(!/mentioned/i.test(opening), 'no "it mentioned …" when there are no names');
  ok(/didn't come up in the answer it gave/.test(opening), 'a safe line that needs no names');
  ok(p.evidence.competitors.length === 0 && /do not name any/.test(p.evidence.competitorsNote ?? ''), 'the evidence box says not to name anyone');
  ok(!/local firms|other businesses like|competitors such as/i.test(allText(p)), 'no generic stand-in for real names');
}

console.log('── 3. STRONG WEBSITE EVIDENCE ──');
{
  const p = buildColdCallPlaybook(base({ leadCrawl: crawl(THIN, 1, SITEMAP_EVIDENCE) }));
  ok(p.findings[0]?.kind === 'sitemap_wrong_domain', 'the sitemap-on-another-domain finding leads (the strongest, checkable one)');
  ok(p.findings[0].proof.some((l) => l.includes('https://old-acme-site.com/services')), 'its proof is the VERBATIM offending URL');
  ok(p.findings[0].proof.some((l) => l.includes('34 of 40')), 'with the count behind it');
  ok(p.findings.length <= 3, 'never more than three findings');
  ok(p.explain.some((l) => /The main thing I noticed on your site is your sitemap/.test(l)), 'the verbal explanation starts from the strongest finding');
  ok(p.explain.some((l) => /could be contributing/.test(l)), 'and is hedged — "could be contributing"');
  /* The findings the playbook shows are the ones the WhatsApp {{6}} would carry — one loop, one rule. */
  const wa = resolveSiteFindingsDetailed(true, [], crawl(THIN, 1, SITEMAP_EVIDENCE));
  ok(!!wa && wa.kinds.every((k, i) => p.findings[i]?.kind === k), 'same findings, same order as the WhatsApp site findings');
}
{
  const p = buildColdCallPlaybook(base());
  ok(p.findings.length === 1 && p.findings[0].kind === 'thin_pages', 'one strong issue → exactly one finding shown');
  ok(p.findings[0].proof.some((l) => /82 words/.test(l)), 'the thin page proof carries its stored word count');
  ok(p.findings[0].explanation === 'Your homepage is really light on detail.' && !/service page/.test(allText(p)),
    'a thin HOMEPAGE is called the homepage, never "one of the service pages"');
}
{
  const svc: CrawlSignals = { ...CLEAN, thinPages: 1, thinPageUrls: ['https://acmelocks.co.uk/lock-changes/'] };
  const p = buildColdCallPlaybook(base({ leadCrawl: crawl(svc) }));
  ok(/^One of the service pages is really light on detail/.test(p.findings[0]?.explanation ?? ''), 'a thin SERVICE page keeps the shared wording');
}

console.log('── 4. NO STRONG WEBSITE EVIDENCE ──');
{
  const p = buildColdCallPlaybook(base({ leadCrawl: crawl(CLEAN) }));
  ok(p.findings.length === 0, 'missing H1 / no structured data are NOT padded in as findings');
  ok(/no strong website issues/i.test(p.findingsNote ?? ''), 'it says so honestly');
}
{
  const p = buildColdCallPlaybook(base({ leadCrawl: crawl(THIN, 45) }));
  ok(p.findings.length === 0 && /more than 30 days old/.test(p.findingsNote ?? '') && p.context.crawlStale, 'a stale crawl is flagged and not used');
}
{
  const p = buildColdCallPlaybook(base({ leadCrawl: null }));
  ok(p.findings.length === 0 && /not been crawled/.test(p.findingsNote ?? ''), 'no crawl → says so, and that opening never runs one');
}
{
  const p = buildColdCallPlaybook(base({ lead: { ...base().lead, website: null } }));
  ok(p.findings.length === 0 && /No website on file/.test(p.findingsNote ?? ''), 'no website → no findings, and the right conversation');
}

console.log('── 5. MISSING / UNUSABLE EXCERPT ──');
{
  const p = buildColdCallPlaybook(base());
  ok(!!p.evidence.excerpt && p.evidence.excerpt.startsWith('Several local locksmith'), 'a real prose answer is quoted');
}
{
  const p = buildColdCallPlaybook(base({ report: gapReport(['LockFit Tunbridge Wells'], '') }));
  ok(p.evidence.excerpt === null && /No answer text/.test(p.evidence.excerptNote ?? ''), 'missing excerpt → none quoted, and said so');
}
{
  const map = '![](https://maps.gstatic.com/tactile/pane/default_geocode-1x.png) The Royal Locksmiths 5.0 stars rating Closes 10 PM';
  const p = buildColdCallPlaybook(base({ report: gapReport(['LockFit Tunbridge Wells'], map) }));
  ok(p.evidence.excerpt === null && /map card/.test(p.evidence.excerptNote ?? ''), 'a Gemini map card is not presented as a quote');
}

console.log('── 6. WHATSAPP HISTORY = FOLLOW-UP ──');
{
  const messages: PlaybookMessage[] = [
    { id: 'm1', created_at: '2026-09-19T16:00:07Z', direction: 'outbound', body: '[initial_contact]', template_name: 'initial_contact', status: 'read', message_type: 'template' },
    { id: 'm2', created_at: '2026-09-23T00:22:29Z', direction: 'inbound', body: 'Sorry mate I lost my phone', template_name: null, status: 'received', message_type: 'text' },
  ];
  const p = buildColdCallPlaybook(base({ messages }));
  const opening = p.opening.join(' ');
  ok(p.mode === 'follow_up', 'existing history → FOLLOW-UP');
  ok(/I messaged you on WhatsApp on 19 Sep 2026/.test(opening), 'the opening refers to the earlier message');
  ok(!/I was looking at/.test(opening), 'and does NOT introduce the pitch as though they have never spoken');
  ok(p.followUp?.lastInbound?.text === 'Sorry mate I lost my phone', 'their last reply is surfaced');
  ok(!!p.followUp?.lastOutbound?.text && !/^\[initial_contact\]$/.test(p.followUp.lastOutbound.text), 'what was said is rendered as words, not a template slug');
  ok(/replied last/.test(p.followUp?.continuation ?? ''), 'a sensible continuation point');
  ok(p.followUp?.reportSentAt === null, 'no report link was sent — and it says so rather than implying one');
  ok(p.followUp!.sentCount === 1 && p.followUp!.receivedCount === 1, 'counts, not a transcript dump');
}
{
  const messages: PlaybookMessage[] = [
    { id: 'm1', created_at: '2026-09-19T16:00:00Z', direction: 'outbound', body: 'hi', template_name: 'competitor_hook', status: 'delivered', message_type: 'template' },
  ];
  const p = buildColdCallPlaybook(base({ messages }));
  ok(p.followUp?.reportSentAt === '2026-09-19T16:00:00Z', 'a report-carrying template is recognised as "report sent"');
  ok(/had a chance to look/.test(p.followUp?.continuation ?? ''), 'and the continuation asks whether they looked at it');
}

console.log('── 7. NO MESSAGE HISTORY = COLD CALL ──');
{
  const p = buildColdCallPlaybook(base({ messages: [] }));
  ok(p.mode === 'cold' && p.followUp === null && p.context.whatsappStatus === 'No WhatsApp contact yet', 'cold, with no follow-up box');
  const failedOnly: PlaybookMessage[] = [{ id: 'm1', created_at: '2026-09-19T16:00:00Z', direction: 'outbound', body: 'x', template_name: 'initial_contact', status: 'failed', message_type: 'template' }];
  const q = buildColdCallPlaybook(base({ messages: failedOnly }));
  ok(q.mode === 'cold' && /never delivered/.test(q.context.whatsappStatus), 'a send that never delivered is still a first contact');
}

console.log('── 8. NO USABLE PUBLIC REPORT ──');
{
  const p = buildColdCallPlaybook(base({ reportAudit: null, report: null }));
  ok(p.reportUrl === null && /No usable public report/.test(p.reportNote ?? ''), 'no link invented');
  ok(p.evidence.kind === 'none', 'no AI evidence claimed');
  ok(!/mentioned|didn't come up/.test(p.opening.join(' ')), 'the opening does not claim an AI result it does not have');
  ok(p.warnings.some((w) => /No AI result is stored/.test(w)), 'and warns before the call');
  const r = buildColdCallPlaybook(base({ reportAudit: null, report: null, auditRunning: true }));
  ok(/still running/.test(r.reportNote ?? ''), 'an audit in flight is named as such');
}

console.log('── 9. FRESHNESS ──');
{
  const p = buildColdCallPlaybook(base({ reportAudit: { ...base().reportAudit!, created_at: new Date(NOW - 50 * DAY).toISOString() } }));
  ok(p.context.auditStale && p.warnings.some((w) => /more than 30 days old/.test(w)), 'an old AI result is flagged');
  ok(!/ earlier,/.test(p.opening.join(' ')), 'and the opening stops saying "earlier"');
}

console.log('── 10. OFFER AND CLAIMS ──');
{
  const p = buildColdCallPlaybook(base({ leadCrawl: crawl(THIN, 1, SITEMAP_EVIDENCE) }));
  const text = allText(p);
  ok(p.offer.lines[0] === FINDABLE_OFFER_SUMMARY, 'the offer comes from findableOffer.ts: ' + FINDABLE_OFFER_SUMMARY);
  ok(p.offer.monthly.includes(FINDABLE_MINIMUM_TERM_MONTHS + ' months') && /12th payment/.test(p.offer.monthly) && !/check current offer/i.test(text), 'the 12-month term is stated; no "check current offer"');
  ok(!/£29\.99|£9\.99|£49\.99/.test(text), 'no stale or invented price anywhere');
  ok(!/guarantee (you|that you)|will (rank|be named|show up)|you'll definitely/i.test(text), 'no guaranteed outcome anywhere');
  ok(!/is why you (don't|do not|aren't)|caused|because of your (site|website)/i.test(text), 'no website finding is stated as the cause');
  const objections = p.objections.map((o) => o.objection);
  for (const o of ['I already have a website guy', 'My website is fine', 'I already come up on Google', 'Nobody uses AI for this', "I'm too busy", 'How much is it?', "Can you guarantee I'll show up?", 'Just send me the information']) {
    ok(objections.includes(o), 'objection covered: ' + o);
  }
}

console.log('── 11. OPENING THE PLAYBOOK TRIGGERS NOTHING ──');
{
  const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
  const files = ['src/hooks/useColdCallPlaybook.ts', 'src/components/ColdCallPlaybook.tsx', 'src/lib/coldCallPlaybook.ts'];
  for (const file of files) {
    const src = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    ok(!/functions\s*\.\s*invoke|\.rpc\s*\(/.test(src), file + ': no edge-function invoke, no rpc (no audit, crawl, Apify, model or send)');
    ok(!/\.(insert|update|upsert|delete)\s*\(/.test(src), file + ': no database write');
    ok(!/\bfetch\s*\(/.test(src), file + ': no raw fetch');
    ok(!/create-ai-audit|crawl-check|send-whatsapp|process-whatsapp|openai|apify/i.test(src), file + ': names no spending endpoint');
  }
  const hook = read('src/hooks/useColdCallPlaybook.ts');
  ok((hook.match(/\.select\(/g) ?? []).length >= 5, 'the loader is SELECTs');
  ok(/enabled:\s*enabled && !!leadId/.test(hook), 'and loads only while the panel is open');
  const inbox = read('src/pages/Inbox.tsx');
  const outreach = read('src/components/OutreachTable.tsx') + read('src/components/LeadDetailDialog.tsx');
  ok(/<ColdCallPlaybookButton leadId=\{active\.leadId\} className=\{HEADER_ICON_BTN\} iconOnly \/>/.test(inbox),
    'Inbox: an icon in the header icon row, for the selected conversation\'s own lead');
  ok(/Send WhatsApp message[\s\S]{0,900}setPlaybookLeadId\(lead\.id\)/.test(read('src/components/OutreachTable.tsx')),
    'Outreach: an icon beside the contact buttons');
  ok(/ColdCallPlaybookSheet/.test(outreach) && /ColdCallPlaybookButton/.test(outreach), 'Outreach opens the same shared panel');
}

if (f > 0) { console.log('\n' + f + ' FAILURE' + (f === 1 ? '' : 'S')); process.exit(1); }
console.log('\nALL PASS');
