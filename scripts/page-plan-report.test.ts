/* Tests for src/lib/pagePlanReportHtml.ts — the printable page plan must (1) wear the EXACT audit
   report chrome (shared band/footer/print CSS — imported, not copied), (2) put the wave name +
   page X of Y in the header band like the audit report does, and (3) follow the leak-safe
   client/internal rule: scores + grouping rationale + score reasons render ONLY when internal is
   EXPLICITLY true. Run: npx tsx scripts/page-plan-report.test.ts */
import { renderPagePlanHtml, type PagePlanReportData } from '../src/lib/pagePlanReportHtml.ts';
import { renderReportHtml, REPORT_CHROME_CSS_CORE, type AiAuditReportData } from '../src/lib/aiAuditReportHtml.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const data: PagePlanReportData = {
  businessName: 'Solene & Co', businessType: 'online menopause clinic', generatedAtLabel: '28 August 2026',
  waves: [
    {
      wave: 1,
      items: [
        {
          job: 'Getting HRT online in the UK', topic: 'Online menopause services', labelKind: 'build', label: 'Build',
          winnability: 'open',
          questions: [{ text: 'Can I get HRT online in the UK without a GP referral?', chatgpt: '0/3', gemini: '0/3' }],
          sources: [{ domain: 'gov.uk', count: 15 }, { domain: 'nhs.uk', count: 11 }],
          heldReason: null, score: 85, rationale: 'both ask about online HRT', scoreReasons: ['open (fragmented field)', 'client absent from every answer (+10)'],
        },
        {
          job: 'Comparison of UK services', topic: 'Menopause services comparison', labelKind: 'gap', label: 'Build — Gemini gap',
          winnability: 'named',
          questions: [{ text: 'Compare UK private menopause subscription services', chatgpt: '2/3', gemini: '0/3' }],
          sources: [], heldReason: null, score: 35, rationale: null,
          scoreReasons: ['Already strong on ChatGPT (ChatGPT 2/3 · Gemini 0/3) — this page targets the Gemini gap.'],
        },
      ],
    },
    {
      wave: 2,
      items: [{
        job: 'Emergency lockouts — Huntingdon', topic: 'Emergencies', labelKind: 'defend', label: 'Defend — already named',
        winnability: 'named',
        questions: [{ text: 'emergency lockouts locksmiths in Huntingdon UK', chatgpt: '3/3', gemini: '3/3' }],
        sources: [{ domain: 'checkatrade.com', count: 4 }],
        heldReason: 'Already named for this question (ChatGPT 3/3 · Gemini 3/3) — defend the existing page rather than build a new one.',
        score: 30, rationale: null, scoreReasons: [],
      }],
    },
  ],
};

console.log('── SHARED CHROME (identical template by construction) ──');
{
  const html = renderPagePlanHtml(data);
  ok(html.includes(REPORT_CHROME_CSS_CORE), 'the plan document embeds the SAME chrome CSS constant the audit report uses');
  ok(html.includes('<div class="wordmark">Findable<span class="dot">.</span></div>'), '  blue band wordmark present');
  ok(html.includes('Prepared for <b>Solene &amp; Co</b>'), '  "Prepared for [client]" footer present');
  ok(html.includes('@page{ size:A4'), '  A4 print rules present');
  const audit = renderReportHtml({
    businessName: 'X', businessType: 'plumbers', locationText: 'Wisbech', generatedAtLabel: 'today',
    namedCount: 0, totalAnswers: 0, questionBreakdown: [],
  } as unknown as AiAuditReportData);
  const band = (h: string) => h.match(/<header class="band">[\s\S]*?<\/header>/)?.[0]?.replace(/<div class="band-meta">[\s\S]*?<\/div>/, '');
  ok(!!band(html) && band(html) === band(audit), '  header band markup is BYTE-IDENTICAL to the audit report (same helper)');
}

console.log('── WAVE NAME + PAGE X OF Y IN THE HEADER ──');
{
  const html = renderPagePlanHtml(data);
  ok(html.includes('Page Plan &middot; Wave 1 &mdash; top priorities &middot; page 1 of 2'), 'wave name + global page X of Y in the band meta');
  ok(html.includes('Wave 2') && html.includes('page 2 of 2'), '  second wave numbered globally');
}

console.log('── ⛔ CLIENT vs INTERNAL (leak-safe) ──');
{
  const client = renderPagePlanHtml(data);                       // internal omitted -> CLIENT
  const internal = renderPagePlanHtml({ ...data, internal: true });
  ok(!client.includes('score 85') && !client.includes('class="pp-int"'), 'client view carries NO scores and no internal block');
  ok(!client.includes('both ask about online HRT'), '  client view hides the grouping rationale');
  ok(!client.includes('client absent from every answer'), '  client view hides the score reasons');
  ok(!client.includes('(15)'), '  client view shows source domains without counts');
  ok(client.includes('gov.uk') && client.includes('Engines currently read:'), '  but the domains themselves show');
  ok(client.includes('Build &mdash; Gemini gap') || client.includes('Build — Gemini gap'), '  the verdict labels show in BOTH views');
  ok(client.includes('defend the existing page'), '  held reasons (client-safe wording) show in both views');
  ok(internal.includes('score 85') && internal.includes('both ask about online HRT') && internal.includes('(15)'),
    'internal view shows scores, rationale and source counts');
  // The status pill next to the score must match the BUILD decision, never contradict it.
  ok(internal.includes('<span class="pp-int-chip">Gemini gap</span>') && !/pp-int-chip">named</.test(internal),
    'a gap BUILD card\'s pill reads "Gemini gap", never a bare "named"');
}

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILED`);
if (f > 0) process.exit(1);
