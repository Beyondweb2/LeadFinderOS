/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE CALL SCRIPT + THE AI SCORE COLOURS (sales-team-today release, Paul, 2026-10-06).

   Pinned here — a FAIL means someone has put back what Paul removed, or let the script invent something:
     1. The opener: "Hi mate, I was looking for <trade> in <town>, so I asked <engine> and it mentioned …,
        but not you." Never "Paul from Findable" / "from Findable", "I messaged you", a previous-contact
        day or date, "quicker to explain on the phone".
     2. Competitors only from the stored answer (up to three; one said naturally; none → no names).
     3. Website reasons only from the stored crawl (up to three, plain words); none strong → the fixed
        no-strong-issue line; no crawl → nothing about the site.
     4. The first question is ALWAYS the website-management question; the agency branch; the price angle
        only where Findable is genuinely cheaper.
     5. Removed noise stays removed: "If they'd rather see it first", "The longer version is in",
        "Someone else answers", "Voicemail (under 20 seconds)", "Where does most of your work come from",
        the LinkedIn and Email scripts, visible research source URLs.
     6. One plan preselected from the website (no site → Build, own site → Optimise); live v3 terms only.
     7. AI score colours: 3/3 green, 2/3 green-ish, 1/3 amber, 0/3 red, proportional; overall 0% red,
        100% green; no data neutral; ChatGPT and Google AI drawn separately, Gemini said "Google AI".
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AGENCY_CONTRACT_QUESTION, AGENCY_COST_QUESTION, BRIDGE_LINE, DISCOVERY_QUESTIONS, FIRST_QUESTION, NO_STRONG_ISSUE_LINE,
  PRICE_ANGLE_LINE, afterFirstQuestion, buildCallScript, preselectedPlan, priceAngleApplies, spokenScriptText,
  type CallScriptInput, type ScriptFinding,
} from '../src/lib/callScript.ts';
import { buildCallClose } from '../src/lib/callClose.ts';
import { buildColdCallPlaybook, type PlaybookInput } from '../src/lib/coldCallPlaybook.ts';
import { CRAWL_CHECK_VERSION, type CrawlSignals } from '../src/lib/crawlCheck.ts';
import { SITE_EVIDENCE_VERSION, type SiteEvidence } from '../src/lib/siteEvidence.ts';
import { FINDABLE_CONTINUING_GBP, FINDABLE_MONTHLY_GBP } from '../src/lib/findableOffer.ts';
import { percentTone, salesEngineLabel, scoreTone, SCORE_TONE_CLASS } from '../src/lib/scoreTone.ts';
import { HOOK_ENGINES, initialHookStateV2, type HookScoreRow } from '../src/lib/hookScore.ts';
import { hookReportState, pickHookAudit, scoreHookAuditForCard, type HookCardAudit } from '../src/lib/hookVisibility.ts';
import { HookVisibilityView } from '../src/components/HookVisibilityView.tsx';
import { WHY_IT_MATTERS_STATS } from '../src/lib/salesExplainer.ts';

let f = 0;
const ok = (cond: unknown, msg: string) => { if (cond) console.log('PASS ' + msg); else { f++; console.error('FAIL ' + msg); } };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

/* ── Fixtures ─────────────────────────────────────────────────────────────────────────────────── */
const FINDINGS: ScriptFinding[] = [
  { kind: 'duplicate_pages', title: 'Near-identical town pages', explanation: 'Many of your town pages are near-duplicates.' },
  { kind: 'thin_pages', title: 'Service pages are thin', explanation: 'Your service pages have little text.' },
  { kind: 'crawler_blocked', title: 'AI crawlers blocked', explanation: 'robots.txt blocks AI crawlers.' },
  { kind: 'noindex_important_page', title: 'Main page set to noindex', explanation: 'A main page is noindexed.' },
];
const own = { source: 'own_site' as const, label: null };
const input = (over: Partial<CallScriptInput> = {}): CallScriptInput => ({
  searchFor: 'a plumber in Rugby', engine: 'Google AI', evidenceKind: 'gap',
  competitors: ['Rugby Plumbing Co', 'Swift Heating', 'A1 Drains', 'Fourth Name Ltd'], auditStale: false,
  findings: FINDINGS, findingsStatus: 'findings', site: own, close: buildCallClose('own_site'),
  contactedBefore: false, hasReport: true, ...over,
});
const BANNED: Array<[RegExp, string]> = [
  [/Paul from Findable/i, '"Paul from Findable"'], [/from Findable/i, '"from Findable"'], [/I messaged you/i, '"I messaged you"'],
  [/\b(on|last) (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b|\byesterday\b|\bearlier today\b|\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i, 'a previous-contact day or date'],
  [/quicker to explain on the phone/i, '"quicker to explain on the phone"'],
  [/If they'd rather see it first/i, '"If they\'d rather see it first"'], [/The longer version is in/i, '"The longer version is in"'],
  [/Someone else answers/i, '"Someone else answers"'], [/Voicemail \(under 20 seconds\)/i, '"Voicemail (under 20 seconds)"'],
  [/Where does most of your work come from/i, '"Where does most of your work come from"'],
  [/https?:\/\//i, 'a URL'], [/\bGemini\b/, 'the internal engine name "Gemini"'],
];
const noBanned = (label: string, text: string) => {
  for (const [re, what] of BANNED) ok(!re.test(text), label + ': never ' + what);
};

console.log('── 1. Plumber, three competitors, website issues ──');
{
  const s = buildCallScript(input());
  ok(s.opener[0] === 'Hi mate, I was looking for a plumber in Rugby, so I asked Google AI and it mentioned Rugby Plumbing Co, Swift Heating and A1 Drains, but not you.', 'opener line 1 is Paul\'s structure, word for word');
  ok(s.opener[1] === "I had a look into why they were being named and you weren't, and I found a few potential reasons.", 'opener line 2: why they were named and you weren\'t — a few potential reasons');
  ok(!s.opener.join(' ').includes('Fourth Name'), 'only the first three competitors are said');
  ok(s.found.lines.length === 2 && s.found.lines.every((l) => !/near-duplicates|robots\.txt|noindex/.test(l)), 'exactly two reasons (MAX_SPOKEN_FINDINGS, 2026-10-07: one or two hooks, never a list), said in plain words (no jargon)');
  ok(/near enough the same/.test(s.found.lines[0]) && /light on detail/.test(s.found.lines[1]), '…each the same claim as its stored finding, in the order found');
  ok(s.bridge[0].startsWith(BRIDGE_LINE) && /give you a better chance of showing up in those answers/.test(s.bridge[0]), 'the bridge: AI is how people find local businesses now + happy to explain what I\'d change');
  noBanned('plumber', spokenScriptText(s));
}

console.log('── 2. Follow-up lead: the SAME opener, the earlier contact is a note for the rep ──');
{
  const s = buildCallScript(input({ contactedBefore: true }));
  ok(s.opener[0] === buildCallScript(input()).opener[0], 'contacted before → the identical opener');
  ok(/been in touch with them before/.test(s.openerNote ?? '') && !spokenScriptText(s).includes(s.openerNote ?? '###'), '…and the note is for the rep, never in what they say');
  noBanned('follow-up', spokenScriptText(s));
}

console.log('── 3. One competitor / none ──');
{
  const one = buildCallScript(input({ competitors: ['Solo Plumbing'] }));
  ok(one.opener[0] === 'Hi mate, I was looking for a plumber in Rugby, so I asked Google AI and it mentioned Solo Plumbing, but not you.', 'one competitor, said naturally ("it mentioned Solo Plumbing, but not you")');
  const none = buildCallScript(input({ competitors: [] }));
  ok(none.opener[0] === "Hi mate, I was looking for a plumber in Rugby, so I asked Google AI and you didn't come up in the answer it gave.", 'no competitors → "you didn\'t come up", no names');
  ok(!/mentioned/.test(none.opener.join(' ')) && /I had a look into why you weren't coming up/.test(none.opener[1] ?? ''), '…and never "it mentioned", the reason line has no "they"');
}

console.log('── 4. No invented competitors, no invented findings ──');
{
  const real = ['Rugby Plumbing Co', 'Swift Heating', 'A1 Drains'];
  const s = buildCallScript(input({ competitors: real }));
  const said = spokenScriptText(s);
  for (const n of ['Rugby Plumbing Co', 'Swift Heating', 'A1 Drains']) ok(s.opener[0].includes(n), 'a real name is said: ' + n);
  const named = s.opener[0].replace(/^.*it mentioned /, '').replace(/, but not you\.$/, '').split(/, | and /);
  ok(named.every((n) => real.includes(n)), 'every name said is one the stored answer returned (' + named.join(' | ') + ')');
  const clean = buildCallScript(input({ findings: [], findingsStatus: 'clean' }));
  ok(clean.found.lines.length === 1 && clean.found.lines[0] === NO_STRONG_ISSUE_LINE, 'good website / no strong issue → the fixed honest line, nothing invented');
  ok(clean.opener[1] === "I had a look into why they were being named and you weren't.", '…and the opener does not claim "a few potential reasons"');
  for (const st of ['not_crawled', 'crawl_stale', 'unreadable'] as const) {
    const n = buildCallScript(input({ findings: [], findingsStatus: st }));
    ok(n.found.lines.length === 0 && n.opener.length === 1 && /say nothing about the site/.test(n.found.note ?? ''), st + ' → nothing said about the site at all');
  }
  ok(NO_STRONG_ISSUE_LINE === "I couldn't see one huge technical problem with the site. The bigger issue is that the public evidence around the business isn't strong enough for AI to consistently choose you over the other companies.", 'the no-strong-issue line is Paul\'s wording');
}

console.log('── 5. No website / a profile ──');
{
  const s = buildCallScript(input({ findings: [], findingsStatus: 'no_website', site: { source: 'none', label: null }, close: buildCallClose('none') }));
  ok(/couldn't find a website for you/.test(s.opener[1] ?? '') && s.found.lines.length === 1, 'no website → said once, plainly');
  ok(!/can't name|cannot name|never name/i.test(spokenScriptText(s)), '…never "AI cannot name you without one"');
  ok(s.plans.preselected === 'build' && s.plans.routes.map((r) => r.route).join() === 'build', 'no website → Build preselected (and the only plan)');
  ok(/Findable Build conversation/.test(s.firstQuestion.hint ?? ''), 'the first-question hint points at Build');
}

console.log('── 6. Named (3/3-type lead) and no audit ──');
{
  const named = buildCallScript(input({ evidenceKind: 'named', competitors: [], findings: [], findingsStatus: 'clean' }));
  ok(named.opener[0] === 'Hi mate, I was looking for a plumber in Rugby, so I asked Google AI and it did mention you, which is good.', 'named → says so honestly');
  ok(!/but not you|weren't/.test(spokenScriptText(named)), '…and never claims a miss');
  const none = buildCallScript(input({ evidenceKind: 'none', competitors: [] }));
  ok(/^Hi mate, I look at how local businesses come up/.test(none.opener[0]) && !/mentioned|but not you/.test(none.opener.join(' ')), 'no audit → claims no AI result');
}

{ const two = buildCallScript(input({ evidenceKind: 'named', engine: 'ChatGPT and Google AI', competitors: [], findings: [], findingsStatus: 'clean' })); ok(/asked ChatGPT and Google AI and they did mention you/.test(two.opener[0]), 'two engines → "they", not "it"'); }
console.log('── 7. The first question, the agency branch, the price angle ──');
{
  const s = buildCallScript(input());
  ok(FIRST_QUESTION === 'Do you manage the website yourself, or does an agency do it?' && s.firstQuestion.question === FIRST_QUESTION, 'the first question is ALWAYS the website-management question');
  for (const site of [own, { source: 'none' as const, label: null }, { source: 'directory_profile' as const, label: 'Checkatrade' }]) {
    ok(buildCallScript(input({ site })).firstQuestion.question === FIRST_QUESTION, 'first question unchanged for site source ' + site.source);
  }
  const self = afterFirstQuestion('self');
  ok(self.ask.length === 0 && self.priceAngle === null, 'self-managed → no agency questions, no price angle');
  const agency = afterFirstQuestion('agency');
  ok(agency.ask[0] === AGENCY_CONTRACT_QUESTION && agency.ask[1] === AGENCY_COST_QUESTION, 'agency → the contract question, then the cost question');
  ok(AGENCY_CONTRACT_QUESTION === 'Are you still tied into a contract with them?' && AGENCY_COST_QUESTION === "If you don't mind me asking, roughly what are you paying them?", '…in Paul\'s words');
  ok(afterFirstQuestion('agency', 400).priceAngle === PRICE_ANGLE_LINE, 'high agency cost (£400) → the cheaper angle is offered');
  ok(afterFirstQuestion('agency', 60).priceAngle === null && afterFirstQuestion('agency', FINDABLE_MONTHLY_GBP).priceAngle === null && afterFirstQuestion('agency', null).priceAngle === null, 'low / equal-to-ours / unknown cost → never claims we are cheaper');
  ok(!priceAngleApplies(Number.NaN) && !priceAngleApplies(undefined), 'garbage input is not a price');
  ok(!/rubbish|useless|ripping you off|cowboy/i.test(PRICE_ANGLE_LINE), 'the angle never knocks their agency');
}

console.log('── 8. Discovery is short and useful ──');
{
  ok(DISCOVERY_QUESTIONS.length >= 2 && DISCOVERY_QUESTIONS.length <= 3, '2–3 discovery questions after the first (' + DISCOVERY_QUESTIONS.length + ')');
  ok(!DISCOVERY_QUESTIONS.some((q) => /most of your work come from/i.test(q)), '"Where does most of your work come from" is gone');
  ok(DISCOVERY_QUESTIONS.some((q) => /jobs/.test(q)) && DISCOVERY_QUESTIONS.some((q) => /areas|towns/.test(q)) && DISCOVERY_QUESTIONS.some((q) => /decisions/.test(q)), 'jobs, areas, decision-maker');
}

console.log('── 9. Build / Optimise preselection, live v3 terms only ──');
{
  ok(preselectedPlan('own_site') === 'build' && preselectedPlan('none') === 'build' && preselectedPlan('directory_profile') === 'build' && preselectedPlan(null) === 'build', 'BUILD is the plan opened first, whatever the site (final pass, 2026-10-07)');
  const o = buildCallScript(input());
  ok(o.plans.preselected === 'build' && o.plans.routes.map((r) => r.route).join() === 'build,optimise', 'existing usable website → Build selected first, Optimise available to switch');
  const all = spokenScriptText(o);
  ok(!/payments stop|one final month|nothing more to pay|then they stop/i.test(all), 'none of the unapproved v4 AGREEMENT phrases (the sales words say Optimise ends; the contract wording is a separate, unapproved change)');
  /* 2026-10-07 (Paul): Optimise ENDS after its 6th payment; Build's £29.99 only if they want hosting to continue. */
  ok(o.plans.routes.find((r) => r.route === 'build')!.spoken.join(' ').includes('£' + FINDABLE_CONTINUING_GBP + ' a month for hosting and maintenance') && !o.plans.routes.find((r) => r.route === 'optimise')!.spoken.join(' ').includes('£' + FINDABLE_CONTINUING_GBP), 'Build: £29.99 only for continued hosting; Optimise: no £29.99 at all');
  const sixMonths = o.objections.find((x) => x.objection === 'Why six months?')?.answer ?? '';
  ok(/6th payment is the last one/.test(sixMonths) && /plan ends/.test(sixMonths) && !sixMonths.includes('£' + FINDABLE_CONTINUING_GBP), '"Why six months?": the 6th payment is the last, then the plan ends');
}

console.log('── 10. Guarantee once, objections short ──');
{
  const s = buildCallScript(input());
  ok(s.guarantee.spoken === buildCallClose('own_site').guarantee.spoken, 'the guarantee is callClose\'s one sentence (not a second wording)');
  ok(/Never promise a ranking/.test(s.guarantee.caution), 'the rep caution: never promise a ranking');
  ok(s.objections.every((o) => o.answer.split(/(?<=[.?!])\s+/).length <= 5), 'every objection is five sentences or fewer');
  for (const t of ['Why £99?', 'I already have an agency', 'I need to think about it', 'Is this a scam?', 'Can I cancel?', "Can you guarantee I'll show up?"]) ok(s.objections.some((o) => o.objection === t), 'objection present: ' + t);
}

console.log('── 11. The playbook end to end (real crawl evidence) ──');
{
  const NOW = Date.parse('2026-10-06T10:00:00Z');
  const signals: CrawlSignals = {
    homeUrl: 'https://acmeplumb.co.uk/', fetchFailed: false, searchBlocked: [], readableAs: 'OAI-SearchBot',
    clientRendered: { flagged: false, visibleChars: 4000, htmlBytes: 30000, appShell: false },
    missingH1: true, noJsonLd: true, duplicates: null, thinPages: 1, thinPageUrls: ['https://acmeplumb.co.uk/'],
    checkedPages: [{ url: 'https://acmeplumb.co.uk/', kind: 'other', words: 82, hasH1: true, readable: true }],
  };
  const evidence: SiteEvidence = { version: SITE_EVIDENCE_VERSION, findings: [{
    kind: 'sitemap_wrong_domain', severity: 5, certainty: 'observed', tier: 'A', pageUrl: null,
    evidence: { observed: ['https://old-site.com/x'], source: 'https://acmeplumb.co.uk/sitemap.xml', subject: 'acmeplumb.co.uk', counted: { matched: 34, of: 40 } },
    summary: 'sitemap lists another domain',
  }] };
  const pb = (over: Partial<PlaybookInput> = {}) => buildColdCallPlaybook({
    lead: { id: 'l1', business_name: 'Acme Plumbing Rugby', phone: '07700 900123', website: 'https://acmeplumb.co.uk', category: 'Plumber', derived_town: 'Rugby', status: 'contacted' },
    reportAudit: { id: 'a1', short_code: 'abcdef', created_at: new Date(NOW - 86_400_000).toISOString(), business_name: 'Acme Plumbing Rugby', business_type: 'Plumbers', location_text: 'Rugby' },
    report: { hook: { questionsTested: 3, gap: { question: 'plumber in Rugby UK', engineLabel: 'Gemini', namedInstead: ['Rugby Plumbing Co', 'Swift Heating', 'A1 Drains'], answerExcerpt: 'Try Rugby Plumbing Co.' }, tested: [] } },
    runCrawls: [], leadCrawl: { result: { version: CRAWL_CHECK_VERSION, signals, evidence, evidenceVersion: SITE_EVIDENCE_VERSION }, createdAtMs: NOW - 86_400_000 },
    messages: [{ id: 'm', created_at: new Date(NOW - 3 * 86_400_000).toISOString(), direction: 'outbound', body: 'Hi', message_type: 'text', template_name: null, status: 'read' }],
    nowMs: NOW, callerName: 'Paul Jones', ...over,
  });
  const p = pb();
  const said = [...p.callScript, ...p.qualify, ...p.objections.map((o) => o.answer)].join('\n');
  ok(/^Hi mate, I was looking for a plumber in Rugby, so I asked Google AI and it mentioned Rugby Plumbing Co, Swift Heating and A1 Drains, but not you\.$/.test(p.callScript[0]), 'the real playbook opener (Gemini said as Google AI)');
  ok(p.script.found.lines.length >= 1 && p.script.found.lines.length <= 3 && /different web address/.test(p.script.found.lines.join(' ')), 'reasons come from the stored crawl evidence (the sitemap finding)');
  ok(p.qualify[0] === FIRST_QUESTION, 'qualify starts with the website-management question');
  noBanned('playbook (messaged 3 days ago, caller Paul)', said);
  ok(!('gatekeeper' in p) && !('voicemail' in p) && !('fallback' in p), 'no gatekeeper / voicemail / fallback lines exist any more');
}

console.log('── 12. The Call screen UI: removed noise stays removed ──');
{
  const ui = read('src/components/ColdCallPlaybook.tsx');
  const code = ui.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  ok(!/linkedin|'email'|messages\.email|messages\.linkedin/i.test(code), 'no LinkedIn or Email script in the call UI');
  ok(!/gatekeeper|voicemail|\.fallback\b/.test(code), 'no gatekeeper / voicemail / fallback rendered');
  ok(!/SourceNote|source-note|\.url\b|YEXT_URL|href=\{s\.url/.test(code) && !/https?:\/\//.test(code), 'no research source link or URL rendered');
  ok(WHY_IT_MATTERS_STATS.length === 2 && WHY_IT_MATTERS_STATS.every((s) => /^\d+%$/.test(s.figure) && !/https?:/.test(s.label)), 'two stat cards: a figure and a line, no link in the words');
  ok(/data-testid="answer-self"[^>]*>I manage it</.test(ui) && /data-testid="answer-agency"[^>]*>Agency \/ someone else</.test(ui), 'the first-question buttons: I manage it / Agency / someone else');
  ok(/manager === 'agency' && after &&/.test(ui), 'the agency questions appear only after Agency is chosen');
  ok(/const preferred = fit\?\.recommended \?\? s\.plans\.preselected/.test(ui) && /data-testid=\{'call-route-' \+ plan\.route\}/.test(ui) && !/routes\.map\(\(r[^)]*\) => \(\s*<div key=\{r\.route\}[^]*?r\.spoken/.test(ui), 'one plan open at a time, starting from the preselected one');
  ok(/useState<number \| null>\(null\)/.test(ui) && /open !== null && p\.script\.objections\[open\]/.test(ui), 'objections: closed by default, one answer open at a time');
  ok((code.match(/<QuickCloseButton/g) ?? []).length === 1, 'exactly ONE Quick Close on the call screen (the sticky bar)');
  ok(/data-testid="log-this-call"/.test(ui) && /Log this call/.test(ui), 'the sticky bar: Log this call');
  ok(!/AiOpportunity|CallEvidence|AiCheckCount|TalkAbout/.test(code), 'no second AI-result block inside the script');
  const dlg = read('src/components/LeadDetailDialog.tsx');
  const call = dlg.slice(dlg.indexOf('data-testid="workspace-call"'), dlg.indexOf('data-testid="workspace-details"'));
  ok(call.indexOf('<LeadHookPanel leadId={lead.id} variant="call" />') > 0 && call.indexOf('<LeadHookPanel') < call.indexOf('<ColdCallPlaybookInline'), 'the ONE AI summary is at the TOP of the Call tab, above the script');
  ok((call.match(/<LeadHookPanel/g) ?? []).length === 1 && !/<details[^>]*ai-check-tools/.test(call), '…exactly once (no folded second copy below)');
  ok(!/NotReadyToSellBanner/.test(dlg.replace(/\{\/\*[\s\S]*?\*\/\}/g, '')), 'no onboarding banner in the lead popup');
}

console.log('── 13. AI score colours ──');
{
  ok(scoreTone(3, 3) === 'strong', '3/3 → green (strong)');
  ok(scoreTone(2, 3) === 'good', '2/3 → green-ish (good)');
  ok(scoreTone(1, 3) === 'weak', '1/3 → amber (weak)');
  ok(scoreTone(0, 3) === 'poor', '0/3 → red (poor)');
  ok(scoreTone(5, 10) === 'good' && scoreTone(4, 10) === 'weak' && scoreTone(10, 10) === 'strong' && scoreTone(0, 10) === 'poor', 'proportional for other denominators (5/10 good, 4/10 weak)');
  ok(scoreTone(null, 3) === 'none' && scoreTone(1, 0) === 'none' && scoreTone(4, 3) === 'none' && scoreTone(undefined, undefined) === 'none', 'no data / impossible counts → neutral');
  ok(percentTone(0) === 'poor' && percentTone(100) === 'strong' && percentTone(50) === 'good' && percentTone(33) === 'weak' && percentTone(null) === 'none', 'overall: 0% red, 100% green, mid amber/green-ish, none neutral');
  ok(/emerald/.test(SCORE_TONE_CLASS.strong.chip) && /red/.test(SCORE_TONE_CLASS.poor.chip) && /amber/.test(SCORE_TONE_CLASS.weak.chip) && /muted/.test(SCORE_TONE_CLASS.none.chip), 'the classes are green / amber / red / neutral');
  ok(salesEngineLabel('gemini') === 'Google AI' && salesEngineLabel('Gemini') === 'Google AI' && salesEngineLabel('chatgpt') === 'ChatGPT', 'Gemini is "Google AI" on sales screens');

  /* The real component, rendered, from real scored rows. */
  const Q = ['best plumber in Rugby?', 'emergency plumber Rugby?', 'boiler repair Rugby?'];
  const cell = (named: boolean) => ({ named, self_named: named, answer_text: named ? 'Try Acme Plumbing or Rugby Plumbing Co.' : 'Try Rugby Plumbing Co, Swift Heating.', competitors: ['Rugby Plumbing Co', 'Swift Heating'], citations: [] });
  const render = (grid: Array<[boolean, boolean]>) => {
    const rows: HookScoreRow[] = grid.map(([c, g], i) => ({ question: Q[i], status: 'done', engines: [...HOOK_ENGINES], result: { chatgpt: cell(c), gemini: cell(g) } }));
    const createdAt = '2026-10-06T09:00:00Z';
    const audit = { id: 'aud-00001', lead_id: 'L', short_code: 'cabcde', created_at: createdAt, business_name: 'Acme Plumbing', business_type: 'Plumbers', location_text: 'Rugby', audit_purpose: 'audit',
      baseline_target_runs: 1, is_measurement: false, baseline_contract: null, is_market: false,
      ai_audit_runs: [{ id: 'run-1', status: 'complete', run_number: 1, created_at: createdAt, results: { hook: initialHookStateV2(Q), competitor_cleaning: { complete: true, at: 'x', attempts: 1, errors: [] } } }] } as unknown as HookCardAudit;
    const picked = pickHookAudit([audit])!;
    const state = (picked.runResults as { hook?: unknown }).hook;
    const card = scoreHookAuditForCard({ audit: picked.audit, state, runResults: picked.runResults, rows });
    const report = hookReportState({ leadId: 'L', audits: [audit], picked, score: card.score, nowMs: Date.parse('2026-10-06T10:00:00Z') });
    return renderToStaticMarkup(createElement(HookVisibilityView, { card, inFlight: false, state, report, variant: 'call', onOpenFull: () => {} }));
  };
  const zero = render([[false, false], [false, false], [false, false]]);
  ok(/data-engine="chatgpt" data-tone="poor"/.test(zero) && /data-engine="gemini" data-tone="poor"/.test(zero), 'gym-style 0/3 + 0/3: both engine chips red');
  ok(/data-testid="hook-headline" data-tone="poor"/.test(zero) && /0%/.test(zero), '0% named overall → red headline');
  ok(/Google AI/.test(zero) && /ChatGPT/.test(zero) && !/>Gemini</.test(zero), 'the engines are drawn separately as ChatGPT and Google AI');
  ok(/data-testid="hook-named-instead"/.test(zero) && /Rugby Plumbing Co/.test(zero), 'the call summary shows who was named instead');
  ok(/View full audit/.test(zero), '"View full audit" is the route to the detail');
  const full = render([[true, true], [true, true], [true, true]]);
  ok(/data-engine="chatgpt" data-tone="strong"/.test(full) && /data-engine="gemini" data-tone="strong"/.test(full) && /data-testid="hook-headline" data-tone="strong"/.test(full) && /100%/.test(full), '3/3 + 3/3 → green chips, 100% green');
  const mixed = render([[true, false], [true, false], [false, true]]);
  ok(/data-engine="chatgpt" data-tone="good"/.test(mixed) && /data-engine="gemini" data-tone="weak"/.test(mixed), 'ChatGPT 2/3 green-ish, Google AI 1/3 amber');
}

if (f > 0) { console.log('\n' + f + ' FAILURE' + (f === 1 ? '' : 'S')); process.exit(1); }
console.log('\nALL PASS');
