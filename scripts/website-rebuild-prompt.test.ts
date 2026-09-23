/* ============================================================
   THE GENERATED WEBSITE BUILD PACK (rebuild route) — every fact is autofilled from Findable's own
   records, nothing is invented, a disagreement between sources is asked about rather than settled,
   and only VERIFIED facts are publishable.

   Ported 2026-09-23 from the single "Claude rebuild prompt" to the Build Pack that replaced it:
   the same fixtures and the same guarantees, read from the pack's items.

   Run: npx tsx scripts/website-rebuild-prompt.test.ts
   ============================================================ */
import { toRebuildPromptInput, type RebuildContextPayload } from '../src/lib/rebuildContext.ts';
import { parseWebsiteBuild } from '../src/lib/websiteBuildState.ts';
import { buildPack, MARK } from '../src/lib/buildPack.ts';
import { candidateFacts, mergeFacts } from '../src/lib/buildFacts.ts';
import { resolveClientFacts, clientConfirmationsNeeded } from '../src/lib/clientFacts.ts';
import type { AiAuditReportData } from '../src/lib/aiAuditReportHtml.ts';

let failures = 0;
function ok(cond: boolean, msg: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  if (!cond) failures++;
}

/* A stand-in for MCLocksmiths, shaped exactly as paid-client-hub returns it. */
const report: AiAuditReportData = {
  businessName: 'MCLocksmiths centre',
  businessType: 'locksmiths',
  locationText: 'Peterborough',
  named: 14, total: 120, pct: 12,
  questionsAsked: 20, enginesUsed: 2, measurementRuns: 3,
  perEngine: [
    { label: 'ChatGPT', named: 11, total: 60 },
    { label: 'Gemini', named: 3, total: 60 },
    { label: 'AI Overview', named: 0, total: 20 },
  ],
  competitors: ['Peterborough Lock & Key'],
  topCompetitors: [{ name: 'Peterborough Lock & Key', count: 9 }],
  gutPunch: null,
  generatedAtLabel: '22 Sep 2026',
  questionBreakdown: [
    {
      question: 'emergency locksmith Peterborough', namedYou: true, namedCount: 6, answers: 6,
      rivals: [], citations: [{ domain: 'mc-locksmiths.com', url: 'https://mc-locksmiths.com/emergency' }],
      perEngine: [
        { label: 'ChatGPT', ran: true, named: 3, rivals: [], citations: [{ domain: 'mc-locksmiths.com', url: 'https://mc-locksmiths.com/emergency' }] },
        { label: 'Gemini', ran: true, named: 3, rivals: [], citations: [] },
      ],
    },
    {
      question: 'uPVC door lock repair Peterborough', namedYou: true, namedCount: 2, answers: 6,
      rivals: ['Peterborough Lock & Key'], citations: [],
      perEngine: [
        { label: 'ChatGPT', ran: true, named: 2, rivals: [], citations: [] },
        { label: 'Gemini', ran: true, named: 0, rivals: [], citations: [] },
      ],
    },
    {
      question: 'car key replacement Peterborough', namedYou: false, namedCount: 0, answers: 6,
      rivals: ['Peterborough Lock & Key'], citations: [],
      perEngine: [
        { label: 'ChatGPT', ran: true, named: 0, rivals: [], citations: [] },
        { label: 'Gemini', ran: true, named: 0, rivals: [], citations: [] },
      ],
    },
  ],
};

const payload = (over: Partial<RebuildContextPayload> = {}): RebuildContextPayload => ({
  lead: {
    id: 'lead-1', business_name: 'MCLocksmiths centre', website: 'https://mc-locksmiths.com/',
    derived_town: 'Peterborough', category: 'Locksmith', services_included: ['emergency entry'],
    phone: '01733 000000', email: 'info@mc-locksmiths.com', place_id: 'abc',
    website_build: {},
  },
  onboarding: {
    business_name: 'MCLocksmiths centre', confirmed_location: 'Peterborough',
    services_list: ['emergency entry', 'uPVC door locks', 'car keys'],
    areas_list: ['Peterborough', 'Whittlesey', 'Yaxley'],
    contact_name: 'Mark', contact_email: 'mark@mc-locksmiths.com',
    standout: 'Twenty minute response across the city', accreditations: 'MLA approved',
    must_not_say: 'Do not say 24/7', website_platform: 'WordPress', willing_to_migrate: 'yes',
    website_route: 'optimise_existing', domain_status: 'existing', access_status: 'has_login',
    baseline_questions: ['emergency locksmith Peterborough', 'uPVC door lock repair Peterborough', 'car key replacement Peterborough'],
    incomplete: false,
  },
  baseline_audit: {
    id: 'audit-b', business_name: 'MCLocksmiths centre', business_type: 'locksmiths',
    location_text: 'Peterborough', website: 'https://mc-locksmiths.com/',
  },
  baseline_audit_id: 'audit-b',
  baseline_completed_at: '2026-09-22T03:24:58.072Z',
  report,
  discovery_audit: null,
  crawl: null,
  pages: [],
  ...over,
});

/* The rebuild route's whole Build Pack, as one text — the capture prompt, the master prompt, every
   command. Same client data as before; the prompts that used to be one "rebuild prompt" are now
   split across the pack, so the assertions read the pack. */
const packFor = (over: Partial<RebuildContextPayload> = {}, build: Record<string, unknown> = {}) => {
  const p = payload(over);
  const evidence = toRebuildPromptInput(p);
  const state = parseWebsiteBuild({ build_mode: 'rebuild', rebuild_style: 'replica', copy_ownership: 'unknown', ...((p.lead as { website_build?: object } | null)?.website_build ?? {}), ...build });
  const rows = mergeFacts(candidateFacts(p as never, state.canonical_domain), state.facts, null);
  return buildPack({
    state, template: null, facts: rows, evidence,
    businessName: evidence.facts.businessName.value ?? '', existingSiteUrl: evidence.facts.website.value ?? '',
    mustNotSay: evidence.facts.mustNotSay.value ?? '', generatedAt: '2026-09-23T00:00:00Z',
  });
};
const prompt = (over: Partial<RebuildContextPayload> = {}, build: Record<string, unknown> = {}) => packFor(over, build).map((x) => x.text).join('\n\n');
const item = (id: string, over: Partial<RebuildContextPayload> = {}, build: Record<string, unknown> = {}) => packFor(over, build).find((x) => x.id === id)!.text;

console.log('\n── 9-13. THE CLIENT CONTEXT AUTOFILLS ──');
{
  const p = prompt();
  ok(p.includes('https://mc-locksmiths.com/'), '9. the website URL autofills');
  ok(p.includes('MCLocksmiths centre'), '10. the business name autofills');
  ok(p.includes('uPVC door locks'), '11. onboarding services autofill');
  ok(p.includes('Whittlesey'), '12. onboarding service areas autofill');
  ok(p.includes('named in 14 of 120 answers'), '13. the baseline overall result autofills');
  ok(p.includes('ChatGPT: named in 11 of 60'), '13. the per-engine result autofills');
  ok(/VERIFIED FACTS MAY BE USED/.test(p) && /UNVERIFIED FACTS MUST NOT BE PUBLISHED/.test(p), 'the verified / unverified rule is stated');
}

console.log('\n── 14-15. THE FROZEN BASELINE AND ITS FINDINGS ──');
{
  const p = item('master');
  ok(p.includes('1. emergency locksmith Peterborough'), '14. the exact frozen questions are included, in order');
  ok(p.includes('3. car key replacement Peterborough'), '14. all of them, not a sample');
  ok(/1 question\(s\) where the business was never named/.test(p), '15. the absent finding is included');
  ok(/1 question\(s\) where it was named on some asks but not others/.test(p), '15. the fragile finding is included');
  ok(/1 question\(s\) where only one scored engine named it/.test(p), '15. the one-engine finding is included');
  ok(p.includes('Peterborough Lock & Key'), '15. competitors that actually appeared are included');
}

console.log('\n── 23. IT SAYS NOT TO RERUN OR CHANGE THE BASELINE ──');
{
  const p = item('master');
  ok(/DO NOT change, re-run, regenerate/.test(p), '23. it forbids changing or re-running the baseline');
  ok(/DO NOT rewrite the frozen questions/.test(p), '23. it forbids rewriting the frozen questions');
  ok(/BASELINE PROTECTION/.test(p), '23. under a heading that cannot be missed');
}

console.log('\n── 20. DO-NOT-BREAK URLS, WITHOUT CLAIMING CAUSATION ──');
{
  const p = item('master');
  ok(p.includes('https://mc-locksmiths.com/emergency'), '20. a cited own-site URL is listed');
  ok(/it is NOT proof that the page caused/.test(p), '20. it explicitly refuses the causation claim');
  ok(/investigate before you touch any URL/.test(p), 'Claude is told to investigate first');
}
{
  const bare: AiAuditReportData = { ...report, questionBreakdown: report.questionBreakdown!.map((q) => ({ ...q, citations: [], perEngine: q.perEngine!.map((e) => ({ ...e, citations: [] })) })) };
  const p = item('master', { report: bare });
  ok(/No citations of the client/.test(p), 'no evidence → it says so rather than inventing a list');
  ok(/treat as do-not-break: the homepage/.test(p), 'and still protects the homepage and service pages');
}

console.log('\n── 17. CONFLICTS ARE FLAGGED, NEVER SILENTLY CHOSEN ──');
{
  const p = item('master', { lead: { ...payload().lead!, derived_town: 'Whittlesey' } });
  ok(/CLIENT CONFIRMATION REQUIRED/.test(p), '17. the section is present');
  ok(/Primary location[\s\S]{0,200}Whittlesey/.test(p), '17. the disagreeing values are both named');
  ok(/A winner has NOT/.test(p), '17. and it says a winner was not chosen');
  const verified = p.slice(p.indexOf('## D.'), p.indexOf('## E.'));
  ok(!/Home town:/.test(verified), 'a conflicted fact is NOT in the verified list');
  ok(/Home town: "Peterborough"/.test(p.slice(p.indexOf('## E.'))), 'it is listed as detected, not approved');
}
{
  const facts = resolveClientFacts({
    lead: { website: 'https://mc-locksmiths.com' },
    onboarding: { business_website: 'https://www.mc-locksmiths.com/' },
    baselineAudit: null,
  });
  ok(clientConfirmationsNeeded(facts).filter((c) => c.kind === 'conflict').length === 0,
    'http/https, www and a trailing slash are NOT treated as a conflict');
}

console.log('\n── 18-19. MISSING FACTS ARE LABELLED, NEVER FILLED IN ──');
{
  const p = item('master', { onboarding: null });
  ok(/Missing \(no verified value exists/.test(p), '18. absent facts are listed as missing');
  ok(/\n- Service areas\n/.test(p), '18. including the service areas onboarding would have carried');
  ok(!/lorem|example\.com|TBC\b|\bTODO\b|<[a-z_]+>/i.test(prompt({ onboarding: null })),
    '19. no invented placeholder value is presented as a fact');
  const conf = toRebuildPromptInput(payload({ onboarding: null })).confirmations;
  ok(conf.some((c) => c.label === 'Service areas' && c.kind === 'missing'),
    '18. and the gap reaches the confirmation list as "missing"');
}

console.log('\n── 21-22. PREVIEW INSTRUCTIONS ──');
{
  const local = item('local');
  ok(local.includes('npm run dev'), '21. the dev command is included');
  ok(local.includes('cloudflared tunnel --url http://localhost:4321'), '21. the optional tunnel is included');
  ok(local.includes('http://localhost:4321'), '21. the local URL is included');
  ok(/development only/i.test(local), '21. the tunnel is marked development-only');
  const p = item('master');
  ok(p.includes('1440x900') && p.includes('375x812'), '21. both comparison viewports are named');
  ok(/HTML\/CSS similarity is NOT proof of parity/.test(p), '21. rendered comparison is required');
  ok(p.includes(MARK.path), '22. an unknown local folder prints the required marker');
  ok(!/C:\\Users/.test(prompt()), '22. and no path is invented');
}
{
  const p = item('local', {}, { local_repo_path: 'C:/Users/paulj/MCLocksmiths' });
  ok(p.includes('Set-Location "C:\\Users\\paulj\\MCLocksmiths"'), '22. a KNOWN local folder is autofilled into the command');
  ok(!p.includes(MARK.path), '22. and the marker is then absent');
}

console.log('\n── 16. VERIFIED PRIOR CONTEXT IS REUSED, BUT NEVER AS THE BASELINE ──');
{
  const p = item('master', {
    onboarding: null, baseline_audit: null, baseline_audit_id: null, baseline_completed_at: null, report: null,
    lead: { id: 'lead-1', business_name: 'MCLocksmiths centre', website_build: {} },
    discovery_audit: { business_type: 'locksmiths', location_text: 'Peterborough', website: 'https://mc-locksmiths.com/' },
  });
  ok(p.includes('Peterborough'), '16. Discovery context fills a gap nothing better covers');
  ok(/from Discovery scan/.test(p), '16. and it is labelled as Discovery');
  ok(/no completed paid baseline recorded yet/.test(p), 'Discovery never substitutes for the baseline — the prompt says there is none');
  ok(!/named in \d+ of \d+ answers/.test(p), 'and no measurement figure is printed from Discovery');
}
{
  const p = item('master', { discovery_audit: { location_text: 'Huntingdon', business_type: 'key cutting' } });
  ok(/Home town: "Peterborough"/.test(p) && !/Home town: "Huntingdon"/.test(p), 'Discovery does not override onboarding — the onboarding town leads, held for approval because they disagree');
  ok(/Discovery scan says "Huntingdon"/.test(p), 'but the disagreement is still raised');
}

console.log('\n── STORED CRAWL IS READ, NEVER RE-RUN ──');
{
  const p = item('master', {
    crawl: {
      url: 'https://mc-locksmiths.com/', created_at: '2026-09-20T10:00:00Z',
      result: { signals: { homeUrl: 'https://mc-locksmiths.com/', fetchFailed: false, searchBlocked: ['OAI-SearchBot'], readableAs: null, clientRendered: null, missingH1: false, noJsonLd: true, duplicates: null, thinPages: 0 } as never },
    },
  });
  ok(/STORED TECHNICAL FINDINGS/.test(p), 'the stored crawl section appears when there is one');
  ok(/OAI-SearchBot/.test(p), 'and carries the real finding');
  ok(/do not re-run it/.test(p), 'and says not to re-run it');
}

console.log('\n── THE REUSABLE RULES ARE PRESENT IN FULL ──');
{
  const p = prompt();
  for (const phrase of [
    'EVERY public URL', 'Download genuine assets LOCALLY', 'NEVER submit a form',
    'ONE primary page per intent', 'Do NOT propose cloned town pages', 'One hop each',
    'OAI-SearchBot', 'GPTBot', 'NEVER force push, reset, rebase, squash, amend or run git clean',
    'No hotlinking', 'CUSTOMER QUESTION → DIRECT ANSWER → SUPPORTING DETAIL → EVIDENCE',
    'BUSINESS → SERVICE → LOCATION → EVIDENCE', 'Work autonomously',
  ]) ok(p.includes(phrase), `the pack contains "${phrase}"`);
  ok(/THEN STOP\. Paul approves/.test(item('capture')), 'THE CAPTURE STOPS BEFORE THE BUILD');
  ok(p.includes('Do not say 24/7'), 'the client\u2019s must-not-say constraint is carried as a hard rule');
}

console.log('\n── WEBSITE BUILD STATE PARSING ──');
{
  ok(parseWebsiteBuild(null).build_mode === '', 'an absent record has no build mode');
  ok(parseWebsiteBuild({ build_mode: 'nonsense' }).build_mode === '', 'an unknown mode falls to none, never through');
  ok(parseWebsiteBuild({ repo_url: ' x ' }).repo_url === 'x', 'values are trimmed');
  ok(parseWebsiteBuild({ status: 'qa', repo_url: 'y' }).repo_url === 'y', 'the 2026-09-22 shape (with a status token) still reads');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll passed.');
process.exit(failures ? 1 : 0);
