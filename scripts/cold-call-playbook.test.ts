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
import { termMonthsFor } from '../src/lib/findableOffer.ts';
import { bothPlansSpoken } from '../src/lib/planTerms.ts';
import { salesStyleProblems } from '../src/lib/salesStyle.ts';
import { BRIDGE_LINE, DISCOVERY_QUESTIONS, FIRST_QUESTION, MAX_SPOKEN_FINDINGS, NO_STRONG_ISSUE_LINE } from '../src/lib/callScript.ts';

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
  // 2026-10-06 (sales-team-today, Paul): no "Hi, is that …?" check — the reason for ringing IS the opener.
  ok(/^Hi mate, I was looking for a locksmith in Tunbridge Wells, so I asked Google AI and it mentioned /.test(p.opening[0]) && !/is that|from Findable/i.test(opening),
    "opens with Paul's tested line: the search, the engine, the names (never \"is that …?\", never \"from Findable\")");
  ok(opening.includes('LockRite Locksmiths Tunbridge Wells') && opening.includes('LockFit Tunbridge Wells') && opening.includes('TN Locksmith'),
    'the opening names the first three REAL competitors from the stored answer');
  ok(!opening.includes('S.J. Osborne'), 'and only three — the fourth stays in the evidence box');
  ok(p.evidence.competitors.length === 4, 'the evidence box lists them all (up to the cap)');
  ok(/it mentioned .*, but not you\./.test(opening), 'says the business did not come up — the AI result leads');
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
  ok(p.findings.length === 0 && /Nobody has checked this website yet/.test(p.findingsNote ?? '') && !/Crawl site/.test(p.findingsNote ?? ''), 'no crawl → says so plainly, with no pointer at an admin-only button');
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
  // Days are said the way a person says them (Session A A-04, 2026-10-04): 19 Sep, four days before NOW, is "on Saturday" — never the year.
  /* removed 2026-10-06 (sales-team-today, Paul): the script never says "I messaged you" or the day of the
     earlier message — the rep is told in a NOTE beside the script instead. */
  ok(!/messaged|WhatsApp|Saturday|on \w+day|2026/i.test(opening), 'the opening never mentions the earlier message or its day');
  ok(/^Hi mate, I was looking for /.test(p.opening[0]), 'a follow-up opens with the same tested line');
  ok(/been in touch with them before/.test(p.script.openerNote ?? ''), 'the rep is told, beside the script, that they have been in touch before');
  ok(buildColdCallPlaybook(base()).script.openerNote === null, '…and a first contact carries no such note');
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
  ok(p.offer.lines[0] === bothPlansSpoken(), 'the offer comes from planTerms.ts (both plans, each with its own ending): ' + bothPlansSpoken());
  ok(p.offer.monthly.includes(termMonthsFor('build') + ' months') && /12 payments/.test(p.offer.monthly) && /6 payments/.test(p.offer.monthly) && /6th payment is the last one/.test(p.offer.monthly) && !/check current offer/i.test(text), 'both routes\' terms are stated (Build 12, Optimise 6 — the 6th the last); no "check current offer"');
  /* 2026-10-07: £29.99 appears ONLY as Build's optional hosting / maintenance after its 12 payments. */
  ok(!/£9\.99|£49\.99/.test(text) && !/£29\.99(?! a month for hosting and maintenance)/.test(text), 'no stale or invented price anywhere (£29.99 only as Build\'s optional hosting and maintenance)');
  ok(!/Optimise[^.]*£29\.99|carries on at £29\.99 a month for monitoring/.test(text), 'Optimise is never followed by £29.99');
  ok(!/guarantee (you|that you)|will (rank|be named|show up)|you'll definitely/i.test(text), 'no guaranteed outcome anywhere');
  ok(!/is why you (don't|do not|aren't)|caused|because of your (site|website)/i.test(text), 'no website finding is stated as the cause');
  const objections = p.objections.map((o) => o.objection);
  /* 2026-10-06 (sales-team-today, Paul): the short list a rep can use DURING a call, exactly, in this order.
     The long 2026-09-30 list (website guy, rank on Google, SEO company, …) was removed deliberately. */
  const EXPECTED = ['Why £99?', 'How much is it?', 'I already have an agency', 'My agency controls the website / domain', 'I need to think about it',
    'Is this a scam?', 'Can I cancel?', "Can you guarantee I'll show up?", 'Why twelve months?', 'Why six months?', 'Just send me something', "I'm busy right now"];
  for (const o of EXPECTED) ok(objections.includes(o), 'objection covered: ' + o);
  ok(JSON.stringify(objections) === JSON.stringify(EXPECTED), 'the objection list is exactly the call-time list, in order');
  ok(!objections.some((o) => /Why six payments\?|What happens after\?/.test(o)), 'the objection list keeps its call-time shape');
  const ans = (t: string) => p.objections.find((o) => o.objection === t)?.answer ?? '';
  /* 2026-10-07 (Paul): Optimise = 6 payments in total, then it ENDS; Build's £29.99 only if they want hosting to continue. */
  ok(/12 payments if we build the site, 6 if we work on yours/.test(ans('Can I cancel?')) && /simply ends after the 6th payment/.test(ans('Can I cancel?')) && /only if you want it, and you can cancel that with 30 days' notice/.test(ans('Can I cancel?')),
    '"Can I cancel?": 12 / 6 minimum; Optimise simply ends; Build\'s hosting only if they want it, cancellable with notice');
  ok(/6th payment is the last one/.test(ans('Why six months?')) && /plan ends/.test(ans('Why six months?')) && !/£29\.99/.test(ans('Why six months?')),
    '"Why six months?": the 6th payment is the last, then the plan ends — no £29.99');
  ok(/keep hosting and maintaining it after that, it's £29\.99 a month for hosting and maintenance/.test(ans('Why twelve months?')),
    '"Why twelve months?": £29.99 a month only if they want hosting / maintenance to continue');
  ok(/^No one can promise AI will name you/.test(ans("Can you guarantee I'll show up?")) && /claim your £99 back/.test(ans("Can you guarantee I'll show up?")),
    '"Can you guarantee …?": nobody can promise a placement; the measurement or the £99 back');
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
  /* 2026-10-07: the call screen SAVES the answers the rep taps (who runs the site, the contract, jobs, areas, the
     decision maker) — through fn quick-close's save / save_call only, on a tap or a blur, never on open. */
  {
    const ui = read('src/components/ColdCallPlaybook.tsx').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const calls = [...ui.matchAll(/invokeEdge\(\s*'([a-z-]+)'/g)].map((m) => m[1]);
    ok(calls.length > 0 && calls.every((c) => c === 'quick-close'), 'the call screen talks only to fn quick-close');
    ok(/mode: 'save', answers:/.test(ui) && /mode: 'save_call', call:/.test(ui) && !/mode: '(generate_link|share_link|send_to_paul)'/.test(ui), '…only to save answers (never a link, a share or a send)');
    ok(!/useEffect\([^)]*\b(saveAnswer|saveCall)\b/.test(ui), '…and never on open (no save inside an effect)');
  }
  const hook = read('src/hooks/useColdCallPlaybook.ts');
  ok((hook.match(/\.select\(/g) ?? []).length >= 5, 'the loader is SELECTs');
  ok(/enabled:\s*enabled && !!leadId/.test(hook), 'and loads only while the panel is open');
  const inbox = read('src/pages/Inbox.tsx');
  const outreach = read('src/components/OutreachTable.tsx') + read('src/components/LeadDetailDialog.tsx');
  ok(!/<ColdCallPlaybookButton/.test(inbox) && /Prospect/.test(inbox),
    'Inbox: no second copy of the script on the header (UI cleanup 2026-09-29) — the Prospect button opens the workspace whose Scripts tab is the same panel');
  ok(/Send WhatsApp message[\s\S]{0,1800}setPlaybookLeadId\(lead\.id\)/.test(read('src/components/OutreachTable.tsx')),
    'Outreach: an icon beside the contact buttons');
  ok(/ColdCallPlaybookSheet/.test(outreach) && /ColdCallPlaybookInline/.test(outreach), 'Outreach opens the same shared panel (the row sheet, and inline in the prospect workspace Scripts tab)');
}

console.log('── 12. SIMPLIFIED PLAYBOOK (Paul, 2026-09-27) ──');
{
  // ONE call script, built from the pieces, nothing invented.
  const p = buildColdCallPlaybook(base({ leadCrawl: crawl(THIN, 1, SITEMAP_EVIDENCE) }));
  const script = p.callScript.join(' ');
  ok(p.callScript.length >= 4 && /^Hi mate, I was looking for /.test(p.callScript[0]), "the call script is one read that opens with Paul's tested line (2026-10-06)");
  ok(script.includes('LockRite Locksmiths Tunbridge Wells') && script.includes('LockFit Tunbridge Wells') && script.includes('TN Locksmith') && !script.includes('S.J. Osborne'),
    'it names the first three competitors from THAT result, no more');
  ok(/Hi mate, I was looking for a locksmith in Tunbridge Wells, so I asked Google AI and it mentioned/.test(script), 'it names the engine that was actually asked (Gemini is said as Google AI), and the search plainly');
  ok(/I had a look into why they were being named and you weren't, and I found a few potential reasons\./.test(script)
    && p.callScript.includes("The map of your site that Google reads points at a different web address, so it isn't clear which site is really yours.")
    && !/that's why/i.test(script), 'it carries the real findings (strongest first) in plain words, as potential reasons (never "that\'s why")');
  ok(p.script.found.lines.length <= MAX_SPOKEN_FINDINGS, 'never more than MAX_SPOKEN_FINDINGS website points said aloud');
  // Plain words, not "AI visibility" (Session A, 2026-10-04: jargon to a plumber).
  ok(script.includes(BRIDGE_LINE) && !/AI visibility/.test(script), 'the Findable line (BRIDGE_LINE) is inside the script, in plain words');
  /* removed 2026-10-06 (sales-team-today, Paul): the "Is now OK …?" line and the report fallback ("I'll WhatsApp
     you the report") — the script ends on the offer to explain, and `fallback` is gone from the playbook. */
  ok(/I'm happy to explain what I'd change to give you a better chance of showing up in those answers\.$/.test(script) && !('fallback' in p) && !/If they'd rather|Is now OK/.test(script),
    'it ends on the offer to explain; there is no fallback line');
  ok(!('gatekeeper' in p) && !('voicemail' in p), 'removed 2026-10-06 (sales-team-today, Paul): no gatekeeper and no voicemail lines');
  ok(JSON.stringify(p.qualify) === JSON.stringify([FIRST_QUESTION, ...DISCOVERY_QUESTIONS]) && FIRST_QUESTION === 'Do you manage the website yourself, or does an agency do it?',
    'the questions: FIRST_QUESTION always first, then the discovery questions');
  {
    const clean = buildColdCallPlaybook(base({ leadCrawl: crawl(CLEAN) }));
    ok(clean.script.found.lines.length === 2 && clean.script.found.lines[0] === NO_STRONG_ISSUE_LINE && /do not invent one/.test(clean.script.found.note ?? '') && (clean.script.found.checklist?.length ?? 0) >= 6,
      'no strong site issue → "not set up for AI" + the short list of what we make sure it has (NO_STRONG_ISSUE_LINE), no invented fault');
  }
  ok((script.match(/but not you/g) ?? []).length === 1, 'the AI miss is said once, not repeated as a separate explanation');

  // Follow-up: picks up where it left off.
  const msgs: PlaybookMessage[] = [
    { id: 'm1', created_at: new Date(NOW - 3 * DAY).toISOString(), direction: 'outbound', body: 'Hi', message_type: 'text', template_name: null, status: 'read' },
    { id: 'm2', created_at: new Date(NOW - 2 * DAY).toISOString(), direction: 'inbound', body: 'Yeah go on then', message_type: 'text', template_name: null, status: 'received' },
  ];
  const fu = buildColdCallPlaybook(base({ messages: msgs }));
  // removed 2026-10-06 (sales-team-today, Paul): the follow-up script no longer refers to the WhatsApp or their reply.
  ok(fu.mode === 'follow_up' && /^Hi mate, I was looking for /.test(fu.callScript[0]) && !/WhatsApp|messaged|getting back to me/.test(fu.callScript.join(' ')) && /been in touch/.test(fu.script.openerNote ?? ''),
    'follow-up: the same opener — no WhatsApp, no "getting back to me"; the rep gets a note instead');

  // A directory profile is not their website.
  const prof = buildColdCallPlaybook(base({
    lead: { id: 'lead-fb', business_name: 'Firebeard Electrical', phone: '07700 900456', website: 'https://tradehq.co.uk/firebeardelectrical', category: 'Electrician', derived_town: 'Shrewsbury', status: 'replied' },
    reportAudit: { id: 'aud-fb', short_code: 'abcdef', created_at: new Date(NOW - DAY).toISOString(), business_name: 'Firebeard Electrical', business_type: 'Electricians', location_text: 'Shrewsbury' },
    report: { hook: { questionsTested: 1, gap: { question: 'emergency electrician in Shrewsbury UK who can come today', engineLabel: 'Google AI', namedInstead: ['Able Group (Shrewsbury Service)', 'Shrewsbury Emergency Electricians', 'Whitfield Plumbing & Electrical'], answerExcerpt: REAL_EXCERPT }, tested: [] } },
    leadCrawl: crawl(THIN),
  }));
  ok(prof.site.source === 'directory_profile' && prof.site.label === 'TradeHQ', 'a TradeHQ website is classified as a directory profile');
  ok(prof.findings.length === 0 && /only a TradeHQ profile/.test(prof.findingsNote ?? ''), 'its crawl is never offered as website findings');
  const ps = prof.callScript.join(' ');
  ok(/could only find your TradeHQ profile/.test(ps) && !/your site|your website is/i.test(ps.replace(/website of your own|one of your own/g, '')), 'the script says "just your TradeHQ profile", never "your site"');
  // "My website is fine" objection removed 2026-10-06 (sales-team-today, Paul); the profile truth now lives in what we found.
  ok(prof.script.found.lines.some((l) => /belongs to TradeHQ/.test(l)) && /Never call the profile their website/.test(prof.script.found.note ?? ''), 'what we found says truthfully that the profile page is TradeHQ\'s');
  ok(ps.includes('Able Group (Shrewsbury Service)') && /asked Google AI/.test(ps), 'the profile lead keeps its exact engine and competitors');

  // "How much" is the canonical offer sentence itself (2026-10-06); the ownership line moved to "Why twelve months?".
  const howMuch = p.objections.find((o) => o.objection === 'How much is it?')?.answer ?? '';
  ok(howMuch === bothPlansSpoken() && /6 payments in total, today's included, and then it ends/.test(howMuch) && /£29\.99 a month for hosting and maintenance only if you want us to keep looking after it/.test(howMuch),
    '"How much is it?" names both plans: Optimise 6 then it ends; Build 12, £29.99 after only if they want hosting (2026-10-07)');
  ok(/the website is theirs/.test(p.objections.find((o) => o.objection === 'Why twelve months?')?.answer ?? ''), 'the ownership line: on Build the site is theirs once the payments are made');

  // The panel: the new hierarchy, the old A–H headings gone.
  const ui = readFileSync(new URL('../src/components/ColdCallPlaybook.tsx', import.meta.url), 'utf8');
  /* 2026-10-06 (sales-team-today, Paul): SCAN → SAY → ASK → LOG → CLOSE. The sections a rep glances at mid-call. */
  for (const t of ['title="Say"', 'title="Ask first"', 'title="Then ask"', 'title="What we do"', 'title="Offer"', 'title="Objections"', "'Call script'", "'Voice note'"]) ok(ui.includes(t), 'panel shows: ' + t);
  /* removed 2026-10-06 (sales-team-today, Paul): the second copy of the AI result (AI opportunity / Audit evidence /
     report links), "What I'd talk about", "Questions they may ask", the source links and the coaching blocks. */
  for (const t of ['AI opportunity', "What I'd talk about", 'Questions they may ask', 'Audit evidence', 'Open report', 'Copy report link',
    'CallEvidence', 'AiOpportunity', 'TalkAbout', 'AuditEvidence', 'ReportLinks', 'WhyItMatters(', 'function WhatWeDo', 'HowWeBuild', 'SourceNote', 'VoiceCoaching']) ok(!ui.includes(t), 'removed block gone: ' + t);
  for (const t of ['How to explain it', 'Transition to Findable', 'Offer / next step', 'letter="A"']) ok(!ui.includes(t), 'old block gone: ' + t);
  ok(!/<a [^>]*href=\{?["'`]?https?:/.test(ui.replace(/href=\{'tel:'/g, '')) && !/\.sourceUrl|source\.url/.test(ui), 'removed 2026-10-06 (sales-team-today, Paul): no research source links on the call screen');
  // removed 2026-10-06 (sales-team-today, Paul): the LinkedIn and Email tabs — only Call script and Voice note remain.
  ok(/const tabs: Array<\[ScriptTab, string\]> = \[\['call', 'Call script'\], \['voice', 'Voice note'\]\];/.test(ui) && /type ScriptTab = 'call' \| 'voice';/.test(ui) && !/'linkedin'|'email'/.test(ui),
    'the script tabs are exactly Call script and Voice note (no LinkedIn, no Email)');
  ok(/\{tab === 'voice' && <VoiceNoteScriptBody leadId=\{leadId\} currentAuditId=\{p\.auditId\} \/>\}/.test(ui) && /data-testid="voice-note-out-of-date"/.test(readFileSync(new URL('../src/components/VoiceNoteScriptButton.tsx', import.meta.url), 'utf8')), 'the voice-note script sits in the Voice note tab (loaded only when that tab is opened)');
  /* The AI result is no longer inside the playbook body: it is the ONE summary above it (LeadHookPanel 'call' →
     HookVisibilityView), which still reads the Inbox card's scored results and labels an older check. */
  ok(!/useHookVisibility\(leadId\)/.test(ui), 'the inline playbook carries no second copy of the AI result');
  {
    const hv = readFileSync(new URL('../src/components/HookVisibilityView.tsx', import.meta.url), 'utf8');
    ok(/score\.shape !== 'six'/.test(hv) && /Older quick check/.test(hv) && /variant\?: 'inline' \| 'call'/.test(hv), 'the AI result above the script (HookVisibilityView, variant call) labels an older check format');
  }
  ok(/const \[open, setOpen\] = useState<number \| null>\(null\);/.test(ui) && /aria-expanded=\{open === i\}/.test(ui) && /data-testid="objection-answer"/.test(ui),
    'objections are closed until opened, one answer open at a time');
  ok(!/onSend|doSend|send-whatsapp/.test(ui), 'the panel has no send action');
  const vn = readFileSync(new URL('../src/components/VoiceNoteScriptButton.tsx', import.meta.url), 'utf8');
  ok(/export function VoiceNoteScriptBody/.test(vn) && /<VoiceNoteScriptBody leadId=\{leadId\} \/>/.test(vn), 'the voice-note dialog and the playbook share one body');
}

console.log('── 13. HOUSE STYLE (Paul, 2026-09-30) ──');
{
  const cases = [
    base({ leadCrawl: crawl(THIN, 1, SITEMAP_EVIDENCE) }),
    base({ report: gapReport([]) }),
    base({ report: null }),
    base({ lead: { id: 'lead-n', business_name: 'No Site Locks', phone: '07700 900999', website: null, category: 'Locksmith', derived_town: 'Tunbridge Wells', status: 'new' }, leadCrawl: null }),
    base({ reportAudit: { id: 'aud-old', short_code: 'oldold', created_at: new Date(NOW - 60 * DAY).toISOString(), business_name: 'Acme Locksmiths Tunbridge Wells', business_type: 'Locksmiths', location_text: 'Tunbridge Wells UK' } }),
    base({ messages: [{ id: 'm1', created_at: new Date(NOW - 3 * DAY).toISOString(), direction: 'outbound', body: 'Hi', message_type: 'text', template_name: null, status: 'read' }] }),
  ];
  const rivals = ['LockRite Locksmiths Tunbridge Wells', 'LockFit Tunbridge Wells', 'TN Locksmith', 'S.J. Osborne & Son'];
  for (const [i, input] of cases.entries()) {
    const p = buildColdCallPlaybook(input);
    const said = p.callScript.join(' ') + ' ' + p.objections.map((o) => o.answer).join(' ');
    const problems = salesStyleProblems(said, rivals);
    ok(problems.length === 0, 'case ' + (i + 1) + ': no filler, no fake rapport' + (problems.length ? ' — ' + problems.join(' ') : ''));
    ok(!/Have you got a minute|How are you|caught you at a bad time|I came across/i.test(said), 'case ' + (i + 1) + ': no permission-asking before the reason for ringing');
    ok(!/\bUK\b/.test(p.callScript.join(' ')) && !/for businesses in/.test(p.callScript.join(' ')), 'case ' + (i + 1) + ': the search is said as trade + town, never the audit query (no "UK", no qualifiers)');
    // 2026-10-06 (sales-team-today, Paul): no name first — the reason for ringing IS the first line.
    ok(/^Hi mate, I (was looking for|look at how)/.test(p.callScript[0] ?? ''), 'case ' + (i + 1) + ': the reason for ringing IS the first line (no name, no company, no earlier message)');
    ok(!/from Findable|I messaged you|quicker to explain on the phone/i.test(said) && !/WhatsApp/.test(p.callScript.join(' ')) && !/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/.test(p.callScript.join(' ')),
      'case ' + (i + 1) + ': never "from Findable", "I messaged you", a weekday or "quicker to explain on the phone"');
    ok(p.objections.every((o) => o.answer.split(/(?<=[.?!])\s+/).length <= 5), 'case ' + (i + 1) + ': every objection answer is five sentences or fewer');
    ok(!/\bi asked\b/.test(p.callScript.join(' ')), 'case ' + (i + 1) + ': "I" is never lower-cased mid-sentence');
    ok(p.callScript.every((l) => l.length <= 320), 'case ' + (i + 1) + ': no line of the script runs past ~50 words');
  }
}

if (f > 0) { console.log('\n' + f + ' FAILURE' + (f === 1 ? '' : 'S')); process.exit(1); }
console.log('\nALL PASS');
