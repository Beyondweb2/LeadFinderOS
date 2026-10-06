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
import { FINDABLE_OFFER_SUMMARY, termMonthsFor } from '../src/lib/findableOffer.ts';
import { salesStyleProblems } from '../src/lib/salesStyle.ts';

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
  ok(/^Hi mate, I was looking for a locksmith in Tunbridge Wells, so I asked Google AI and it mentioned /.test(p.opening[0]), "opens with Paul's tested line: the search, the engine, the names (2026-10-06)");
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
  /* 2026-10-06 (Paul): the script never says "I messaged you" or the day — the rep is told in a NOTE instead. */
  ok(!/messaged|WhatsApp|Saturday|on \w+day|2026/i.test(opening), 'the opening never mentions the earlier message or its day');
  ok(/been in touch with them before/.test(p.script.openerNote ?? ''), 'the rep is told, beside the script, that they have been in touch before');
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
  ok(p.offer.monthly.includes(termMonthsFor('build') + ' months') && /12th payment/.test(p.offer.monthly) && /6th payment/.test(p.offer.monthly) && !/check current offer/i.test(text), 'both routes\' terms are stated (Build 12, Optimise 6); no "check current offer"');
  /* 2026-10-05: £29.99 is the v3 Continuing Service — allowed ONLY as "£29.99 a month for … / until …". */
  /* 2026-10-06 (v4): £29.99 is Build's hosting after the term — never on Optimise. */
  ok(!/£9\.99|£49\.99/.test(text) && !/£29\.99(?! a month (for|until|after that)|\/month| hosting)/.test(text), 'no stale or invented price anywhere (£29.99 only as the Build continuing service)');
  ok(!text.split(/(?<=[.;])\s/).some((s) => /Optimise/.test(s) && /£29\.99/.test(s) && !/Build/.test(s)), 'Optimise is never said to continue at £29.99 (a sentence naming both must also name Build)');
  ok(!/guarantee (you|that you)|will (rank|be named|show up)|you'll definitely/i.test(text), 'no guaranteed outcome anywhere');
  ok(!/is why you (don't|do not|aren't)|caused|because of your (site|website)/i.test(text), 'no website finding is stated as the cause');
  const objections = p.objections.map((o) => o.objection);
  /* 2026-10-06 (Paul): the short list a rep can use DURING a call. */
  for (const o of ['Why £99?', 'Why six payments?', 'Why twelve payments?', 'What happens after?', 'I already have an agency', 'I need to think about it',
    'Is this a scam?', 'Can I cancel?', "Can you guarantee I'll show up?", 'Just send me something']) {
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
  ok(!/<ColdCallPlaybookButton/.test(inbox) && /Prospect/.test(inbox),
    'Inbox: no second copy of the script on the header (UI cleanup 2026-09-29) — the Prospect button opens the workspace whose Scripts tab is the same panel');
  ok(/Send WhatsApp message[\s\S]{0,900}setPlaybookLeadId\(lead\.id\)/.test(read('src/components/OutreachTable.tsx')),
    'Outreach: an icon beside the contact buttons');
  ok(/ColdCallPlaybookSheet/.test(outreach) && /ColdCallPlaybookInline/.test(outreach), 'Outreach opens the same shared panel (the row sheet, and inline in the prospect workspace Scripts tab)');
}

console.log('── 12. SIMPLIFIED PLAYBOOK (Paul, 2026-09-27) ──');
{
  // ONE call script, built from the pieces, nothing invented.
  const p = buildColdCallPlaybook(base({ leadCrawl: crawl(THIN, 1, SITEMAP_EVIDENCE) }));
  const script = p.callScript.join(' ');
  ok(p.callScript.length >= 4 && /^Hi mate, I was looking for /.test(p.callScript[0]), "the call script is one read that opens with Paul's tested line");
  ok(script.includes('LockRite Locksmiths Tunbridge Wells') && script.includes('LockFit Tunbridge Wells') && script.includes('TN Locksmith') && !script.includes('S.J. Osborne'),
    'it names the first three competitors from THAT result, no more');
  ok(/I was looking for a locksmith in Tunbridge Wells, so I asked Google AI and it mentioned/.test(script), 'it names the engine that was actually asked (Gemini is said as Google AI), and the search plainly');
  ok(/I had a look into why they were being named and you weren't, and I found (a few potential reasons|one thing that could be part of it)\./.test(script) && /The map of your site that Google reads is pointing at a different web address/.test(script) && !/that's why/i.test(script), 'it carries the strongest finding in plain words, as a potential reason (never "that\'s why")');
  ok(/this is exactly what we specialise in/.test(script) && !/AI visibility/.test(script), 'the Findable line is inside the script, in plain words');
  ok(/I'm happy to explain what I'd do to give you a much better chance of showing up in those answers\./.test(script) && /I'll send you the report/.test(p.fallback) && !/If they'd rather/.test(script), 'it ends on the offer to explain; the report fallback is a hint beside the script, not a line to read');
  ok((script.match(/but not you/g) ?? []).length === 1, 'the AI miss is said once, not repeated as a separate explanation');

  // Follow-up: picks up where it left off.
  const msgs: PlaybookMessage[] = [
    { id: 'm1', created_at: new Date(NOW - 3 * DAY).toISOString(), direction: 'outbound', body: 'Hi', message_type: 'text', template_name: null, status: 'read' },
    { id: 'm2', created_at: new Date(NOW - 2 * DAY).toISOString(), direction: 'inbound', body: 'Yeah go on then', message_type: 'text', template_name: null, status: 'received' },
  ];
  const fu = buildColdCallPlaybook(base({ messages: msgs }));
  ok(fu.mode === 'follow_up' && /^Hi mate, I was looking for /.test(fu.callScript[0]) && !/WhatsApp|messaged|getting back to me/.test(fu.callScript.join(' ')), 'follow-up: the same opener — no WhatsApp, no "getting back to me" (2026-10-06)');

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
  ok(prof.script.found.lines.some((l) => /belongs to TradeHQ/.test(l)), 'what we found says truthfully that the profile page is TradeHQ\'s');
  ok(ps.includes('Able Group (Shrewsbury Service)') && /asked Google AI/.test(ps), 'the profile lead keeps its exact engine and competitors');

  // "What happens after?" is the v4 rule: Optimise stops, Build continues at £29.99 for hosting.
  const after = p.objections.find((o) => o.objection === 'What happens after?')?.answer ?? '';
  ok(/On Optimise, nothing more to pay — the 6th £99 payment is the last, we do one final month of work, then it finishes\./.test(after) && /On Build, it's £29\.99 a month after that for hosting and monitoring, until you cancel\./.test(after),
    '"What happens after?": Optimise stops after the 6th payment; Build continues at £29.99 for hosting (v4)');

  // The panel: the new hierarchy, the old A–H headings gone.
  const ui = readFileSync(new URL('../src/components/ColdCallPlaybook.tsx', import.meta.url), 'utf8');
  for (const t of ['AI opportunity', "What I'd talk about", 'Call script', 'Voice note', 'Objections', 'Audit evidence', 'Open report', 'Copy report link']) ok(ui.includes(t), 'panel shows: ' + t);
  for (const t of ['How to explain it', 'Transition to Findable', 'Offer / next step', 'letter="A"']) ok(!ui.includes(t), 'old block gone: ' + t);
  ok(/No strong owned-site technical issue found from the available evidence\./.test(ui), 'no strong site issue → one plain line, no padding');
  ok(/\{tab === 'voice' && <div className="space-y-3"><VoiceNoteScriptBody leadId=\{leadId\} currentAuditId=\{p\.auditId\} \/><VoiceCoaching \/><\/div>\}/.test(ui) && /\['linkedin', 'LinkedIn'\], \['email', 'Email'\]/.test(ui) && /data-testid="voice-note-out-of-date"/.test(readFileSync(new URL('../src/components/VoiceNoteScriptButton.tsx', import.meta.url), 'utf8')), 'the voice-note script sits in the Voice note tab (loaded only when that tab is opened), with the coaching beside it (v2)');
  ok(/useHookVisibility\(leadId\)/.test(ui) && /score\.shape !== 'six'/.test(ui) && /Older early-stop check/.test(ui), 'audit evidence reads the Inbox card\'s scored results and labels an old early-stop check');
  ok(/<details key=\{o\.objection\}/.test(ui), 'each question is collapsed until opened');
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
    ok(/^Hi mate, I (was looking for|look at how)/.test(p.callScript[0] ?? ''), 'case ' + (i + 1) + ': the reason for ringing IS the first line (no name, no company, no earlier message)');
    ok(!/from Findable|I messaged you|WhatsApp|quicker to explain on the phone/i.test(said), 'case ' + (i + 1) + ': never "from Findable", "I messaged you" or "quicker to explain on the phone"');
    ok(p.objections.every((o) => o.answer.split(/(?<=[.?!])\s+/).length <= 5), 'case ' + (i + 1) + ': every objection answer is five sentences or fewer');
    ok(!/\bi asked\b/.test(p.callScript.join(' ')), 'case ' + (i + 1) + ': "I" is never lower-cased mid-sentence');
    ok(p.callScript.every((l) => l.length <= 320), 'case ' + (i + 1) + ': no line of the script runs past ~50 words');
  }
}

if (f > 0) { console.log('\n' + f + ' FAILURE' + (f === 1 ? '' : 'S')); process.exit(1); }
console.log('\nALL PASS');
