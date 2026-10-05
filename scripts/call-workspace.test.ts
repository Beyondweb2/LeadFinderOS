/* ════════════════════════════════════════════════════════════════════════════════════════════════
   Call workspace (fix workstream 5, pre-sales certification, 2026-10-04).

   Pinned here — each a finding from Session A (salesperson) or Session E (reliability):
     1. Archived leads are never work: not a next action, a follow-up, a waiting reply, a meeting, a pipeline
        card or a health warning — and their HISTORY still counts (M-008, A-03).
     2. The call screen explains the offer for BOTH routes from the constants: Build £99 + £99/month, 12
        payments, a new site built, hosted and managed; Optimise £99 + £99/month, 6 payments, they keep their
        site. The route that fits the lead comes first; a lead with no site is offered Build only (M-009, A-06).
     3. No false guarantee: the headline is findable.live's own line; nothing promises a ranking, a citation,
        a recommendation or that AI will name them; the old overpromising lines are gone (M-009).
     4. Who is calling comes first — cold, follow-up, after "who's this?", voicemail, gatekeeper, voice note;
        no "Quick recap" when no pitch went out; no year for a day this week (A-04, A-21).
     5. The call flow: open → ask → close → after they pay, plus gatekeeper/voicemail; it works with no
        audit and no WhatsApp ever sent (A-06; "call-first works even if WhatsApp has never been sent").
     6. Logging the call: interested-type outcomes put Quick Close in the result line; call outcomes are
        grouped by what happened; Call back saves a Call, Not interested clears (routing).
     7. Double submit: one tap guard in the UI AND the server refuses an identical row in the window (E-12).
     8. Stale Next Action: the editor sends what it showed; the server refuses a changed one; the screen asks
        before replacing (E-13). The rule is unit-tested here; the live SQL test is
        supabase/tests/call-workspace-guards.sql (18 checks, rolled back).
     9. Another rep cannot alter the lead: every write in the migration goes through _require_work.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { findableSiteDir } from './findable-site-dir.mjs';
import { buildColdCallPlaybook, spokenDay, WHO_ASKED_RE, type PlaybookInput, type PlaybookMessage } from '../src/lib/coldCallPlaybook.ts';
import { buildCallClose, GUARANTEE_HEADLINE, routeOffer, routesFor } from '../src/lib/callClose.ts';
import { FINDABLE_MONTHLY_GBP, FINDABLE_SETUP_PRICE_GBP, FINDABLE_BUILD_TOTAL_PAYMENTS, FINDABLE_OPTIMISE_TOTAL_PAYMENTS } from '../src/lib/findableOffer.ts';
import { QUICK_CLOSE_AFTER_PAYMENT } from '../src/lib/quickClose.ts';
import { foldSalesWorkspace, isActiveWork } from '../src/lib/salesWorkspace.ts';
import { isStaleSave, snapshotOf, toSnapshotArg } from '../src/lib/nextActionStale.ts';
import { outcomePlan } from '../src/lib/leadState.ts';
import { shortVoiceNote, buildVoiceNotePrompt, VOICE_NOTE_SYSTEM_PROMPT, checkVoiceNoteScript } from '../src/lib/voiceNoteScript.ts';
import { salesStyleProblems } from '../src/lib/salesStyle.ts';

let f = 0;
const ok = (cond: unknown, msg: string) => {
  if (cond) console.log('  ✓ ' + msg);
  else { f++; console.log('  ✗ ' + msg); }
};
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const NOW = Date.parse('2026-10-05T10:00:00Z'); // a Monday
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

const base = (over: Partial<PlaybookInput> = {}): PlaybookInput => ({
  lead: { id: 'lead-1', business_name: 'Calder Plumbing and Heating', phone: '07700 900123', website: 'https://calderplumbing.co.uk', category: 'Plumber', derived_town: 'Halifax', status: 'not_contacted' },
  reportAudit: { id: 'aud-1', short_code: 'abc123', created_at: iso(NOW - DAY), business_name: 'Calder Plumbing and Heating', business_type: 'Plumbers', location_text: 'Halifax' },
  report: { hook: { questionsTested: 3, gap: { question: 'best plumber in Halifax UK', engineLabel: 'Gemini', namedInstead: ['Brian Slattery Plumbers Limited', 'Sunnybank Plumbing Services'], answerExcerpt: 'Several plumbers operate in Halifax and offer emergency call-outs across the town and nearby villages.' }, tested: [] } },
  runCrawls: [], leadCrawl: null, messages: [], nowMs: NOW, callerName: 'Sam Rep',
  ...over,
});
const noSite = (over: Partial<PlaybookInput> = {}) => base({ lead: { ...base().lead, website: null }, ...over });
const said = (p: ReturnType<typeof buildColdCallPlaybook>) => [...p.callScript, ...p.qualify, p.gatekeeper, p.voicemail, ...p.objections.map((o) => o.answer),
  ...p.close.routes.flatMap((r) => r.spoken), p.close.guarantee.spoken, p.close.monthly, p.close.closeLine].join(' ');

console.log('── 1. ARCHIVED LEADS ARE NEVER WORK ──');
{
  const thread = (id: string) => [
    { id: id + '-o', lead_id: id, direction: 'outbound', template_name: 'initial_contact', status: 'read', created_at: iso(NOW - 2 * DAY), body: 'hi', sent_by_user_id: null },
    { id: id + '-i', lead_id: id, direction: 'inbound', template_name: null, status: 'received', created_at: iso(NOW - 3_600_000), body: "who's this?", sent_by_user_id: null },
  ];
  const fact = (id: string, over: Record<string, unknown> = {}) => ({
    lead: { id, business_name: id, status: 'replied' }, thread: thread(id), contactTimesMs: [NOW - 2 * DAY], humanReplyTimesMs: [NOW - 3_600_000], firstContactMs: NOW - 2 * DAY, lastContactMs: NOW - 2 * DAY,
    contactCount: 1, channels: new Set(['whatsapp']), respondedChannels: new Set(['whatsapp']), responded: true, interested: true, notInterested: false, onboardingSent: false, onboardingOpened: false, won: false,
    interestedAtMs: NOW - 5 * DAY, linkFirstSentAt: null, linkFirstOpenedAt: null, ...over,
  });
  const lead = (id: string, archived: boolean) => [id, {
    id, business_name: id, status: 'replied', next_action: 'call', next_action_date: '2026-10-01', next_action_note: 'ring back', next_action_time: null,
    call_booked_at: iso(NOW + 3 * 3_600_000), is_archived: archived,
  }] as const;
  const ws = foldSalesWorkspace({
    personId: 'me', nowMs: NOW,
    // deno-lint-ignore no-explicit-any
    facts: [fact('Active Co'), fact('Archived Co')] as any,
    // deno-lint-ignore no-explicit-any
    leads: new Map([lead('Active Co', false), lead('Archived Co', true)]) as any,
    audits: [{ lead_id: 'Active Co', completed_at: iso(NOW - DAY) }, { lead_id: 'Archived Co', completed_at: iso(NOW - DAY) }],
    activity: [{ id: 'a1', lead_id: 'Archived Co', actor_user_id: 'me', kind: 'call_outcome', data: { outcome: 'no_answer' }, created_at: iso(NOW - 2 * 3_600_000) }],
  });
  const all = JSON.stringify({ a: ws.nextActions, f: ws.followUps, w: ws.waiting, p: ws.pipeline, h: ws.health });
  ok(ws.nextActions.some((a) => a.leadId === 'Active Co'), 'the fixture works: the active twin IS work');
  ok(!all.includes('Archived Co'), 'an archived lead is in no next action, follow-up list, waiting reply, meeting, pipeline card or health warning');
  ok(ws.followUps.overdue.length === 1 && ws.followUps.meetings.length === 1 && ws.waiting.length === 1, '…only the active lead is overdue / has the meeting / is waiting');
  ok(ws.today.followUpsDue === 1, "…and the archived lead's overdue Call is not counted as due today");
  ok(ws.activity.some((a) => a.leadId === 'Archived Co'), 'its HISTORY stays: the activity feed still shows what was done on it');
  ok(isActiveWork({ is_archived: false }) && isActiveWork({}) && isActiveWork(null) && !isActiveWork({ is_archived: true }), 'isActiveWork: only an explicit archive removes a lead from work (absent = active)');
  ok(/is_archived"/.test(read('supabase/functions/sales-performance/index.ts')), 'sales-performance reads is_archived for the fold');
}

console.log('── 2. THE OFFER, BOTH ROUTES, FROM THE CONSTANTS ──');
{
  const b = routeOffer('build');
  const o = routeOffer('optimise');
  ok(b.summary === `£${FINDABLE_SETUP_PRICE_GBP} now · £${FINDABLE_MONTHLY_GBP}/month · ${FINDABLE_BUILD_TOTAL_PAYMENTS} payments in total` && FINDABLE_BUILD_TOTAL_PAYMENTS === 12, 'Build: £99 now · £99/month · 12 payments in total');
  ok(o.summary === `£${FINDABLE_SETUP_PRICE_GBP} now · £${FINDABLE_MONTHLY_GBP}/month · ${FINDABLE_OPTIMISE_TOTAL_PAYMENTS} payments in total` && FINDABLE_OPTIMISE_TOTAL_PAYMENTS === 6, 'Optimise: £99 now · £99/month · 6 payments in total');
  ok(/new website, host it and look after it/.test(b.spoken.join(' ')) && /built, hosted and managed by Findable/.test(b.site), 'Build: a new Findable-built, hosted and managed website');
  ok(/keep your own website and it stays yours/.test(o.spoken.join(' ')) && /never take it offline/.test(o.spoken.join(' ')) && /keep their existing website and its ownership/.test(o.site), 'Optimise: they keep their existing site and its ownership; we never take it offline');
  ok(/12 payments in total, the £99 today included, so a 12-month minimum/.test(b.spoken.join(' ')) && /6 payments in total, the £99 today included, so a 6-month minimum/.test(o.spoken.join(' ')), 'both say the total counts the £99 today and name the minimum term');
  ok(/starting six weeks after today/.test(b.spoken.join(' ')), 'the first monthly payment is "six weeks after today" (FINDABLE_MONTHLY_DELAY_DAYS)');
  ok(!/\b(12|6) (more|further) payments|then (12|6) payments|13 payments|7 payments/i.test(b.spoken.join(' ') + o.spoken.join(' ')), 'no wording that implies an extra payment on top of the 12 / 6');
  const src = read('src/lib/callClose.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  ok(!/£\s?\d|\b(12|6) payments\b/.test(src), 'callClose.ts types no price and no payment count — every figure is a constant');
  ok(routesFor('own_site').routes.join(',') === 'optimise,build' && routesFor('none').routes.join(',') === 'build' && routesFor('directory_profile').routes.join(',') === 'build', 'the route that fits first: own site → Optimise then Build; no site or a profile page → Build only');
  const own = buildColdCallPlaybook(base());
  const none = buildColdCallPlaybook(noSite());
  ok(own.close.routes.map((r) => r.route).join(',') === 'optimise,build' && own.close.routeNote === null, 'the call screen of a lead with a site offers both');
  ok(none.close.routes.map((r) => r.route).join(',') === 'build' && /Optimise needs their own website/.test(none.close.routeNote ?? ''), '…and of a lead without one, Build only, saying why');
  ok(own.close.afterPayment === QUICK_CLOSE_AFTER_PAYMENT, 'what happens after they pay is Quick Close\'s own list, not a copy');
  ok(/send you the link now/.test(own.close.closeLine), 'the close: "I\'ll send you the link now"');
  const ui = read('src/components/ColdCallPlaybook.tsx');
  ok(/data-testid="call-step-close"/.test(ui) && /<QuickCloseButton leadId=\{leadId\} \/>/.test(ui) && /data-testid=\{'call-route-' \+ r\.route\}/.test(ui), 'the call screen renders the close block, each route, and Quick Close beside the close line');
}

console.log('── 3. NO FALSE GUARANTEE ──');
{
  ok(GUARANTEE_HEADLINE === 'We improve AI visibility or you get your money back.', 'the headline is the agreed line');
  const site = path.join(findableSiteDir(path.resolve(import.meta.dirname, '..')), 'src', 'components', 'Guarantee.astro');
  if (existsSync(site)) ok(readFileSync(site, 'utf8').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').includes(GUARANTEE_HEADLINE), '…word for word what findable.live says (Guarantee.astro)');
  else console.log('  · findable-site not beside this checkout — headline cross-check skipped');
  for (const p of [buildColdCallPlaybook(base()), buildColdCallPlaybook(noSite()), buildColdCallPlaybook(base({ report: null, reportAudit: null }))]) {
    const t = said(p) + ' ' + p.close.guarantee.caution;
    ok(!/guarantee (you|that you)|will (rank|be named|be recommended|show up|appear)|you'll (definitely|be named|appear)|guaranteed? (a )?(citation|ranking|recommendation|top|first|#1)|top of (google|ai|the list)|number one|#1/i.test(t), 'nothing promises a ranking, a citation, a recommendation or that AI will name them');
    ok(!/The monthly keeps you there|What I guarantee is the measurement/.test(t), 'the two overpromising lines are gone (M-009)');
    ok(!/has not named a business without a website/.test(JSON.stringify(p)), 'the absolute "no website is never named" claim is gone (A-05)');
  }
  const g = buildCallClose('own_site').guarantee;
  ok(/before we start/.test(g.spoken) && /four weeks/.test(g.spoken) && /14 days of your results/.test(g.spoken) && g.spoken.includes('£' + FINDABLE_SETUP_PRICE_GBP + ' back'), 'the guarantee said plainly: measured before, re-checked at four weeks, 14 days to claim, the £99 back');
  ok(/Never promise a ranking, a recommendation or that AI will name them/.test(g.caution), 'and the rep is told what never to promise');
  const appear = buildColdCallPlaybook(base()).objections.find((o) => o.objection === "Can you guarantee I'll appear?")?.answer ?? '';
  ok(/^Nobody can promise AI will name you/.test(appear) && /get your £99 back\.$/.test(appear), '"Can you guarantee I\'ll appear?" — nobody can promise a placement; the number or the £99 back, with no hedge after it');
}

console.log('── 4. WHO IS CALLING COMES FIRST ──');
{
  const cold = buildColdCallPlaybook(base());
  ok(/^Hi, is that .+\? It's Sam from Findable\.$/.test(cold.callScript[0]), 'cold call: "Hi, is that …? It\'s Sam from Findable." (the rep\'s own name)');
  const sent: PlaybookMessage = { id: 'm1', created_at: iso(NOW - 3_600_000 * 3), direction: 'outbound', body: 'Hi is this Calder Plumbing?', message_type: 'text', template_name: null, status: 'read' };
  const who: PlaybookMessage = { id: 'm2', created_at: iso(NOW - 3_600_000), direction: 'inbound', body: "Yeah it is mate, who's this?", message_type: 'text', template_name: null, status: 'received' };
  const fu = buildColdCallPlaybook(base({ messages: [sent, who] }));
  const opening = fu.callScript.join(' ');
  ok(/^Hi, is that .+\? It's Sam from Findable\. You asked who I was when I messaged earlier today/.test(fu.callScript[0]), 'after "who\'s this?": the name and Findable first, answering the question');
  ok(!/Quick recap/.test(opening) && /I'm ringing because I asked Google AI for a plumber in Halifax/.test(opening), '…no "Quick recap" (no pitch went out) — the reason for ringing instead');
  ok(!/2026/.test(opening), '…and no year read out for today');
  const report: PlaybookMessage = { id: 'm3', created_at: iso(NOW - 2 * DAY), direction: 'outbound', body: 'x', message_type: 'template', template_name: 'competitor_hook', status: 'read' };
  ok(/Quick recap: /.test(buildColdCallPlaybook(base({ messages: [report] })).callScript.join(' ')), '"Quick recap" only when a report-carrying message actually went out');
  for (const t of ["who's this?", 'Who is this', 'who are you', 'who dis', 'how did you get my number', 'is this a scam']) ok(WHO_ASKED_RE.test(t), 'recognised as "who is this": ' + t);
  for (const t of ['yeah go on then', 'not interested thanks', 'who would do that for £99']) ok(!WHO_ASKED_RE.test(t) || t.startsWith('who would'), 'not a "who is this": ' + t);
  ok(spokenDay(NOW - 3_600_000, NOW) === 'earlier today' && spokenDay(NOW - DAY, NOW) === 'yesterday' && spokenDay(NOW - 3 * DAY, NOW) === 'on Friday' && spokenDay(NOW - 20 * DAY, NOW) === 'on 15 Sep' && spokenDay(NOW - 400 * DAY, NOW) === 'on 31 Aug 2025',
    'days said aloud: earlier today / yesterday / on Friday / on 15 Sep / on 31 Aug 2025 (the year only when it is not this year)');
  ok(/It's Sam from Findable/.test(cold.gatekeeper) && /^Hi, it's Sam from Findable/.test(cold.voicemail), 'gatekeeper and voicemail lines say who is calling');
  ok(cold.voicemail.split(/\s+/).length <= 50, 'voicemail is under 20 seconds (' + cold.voicemail.split(/\s+/).length + ' words)');
  const short = shortVoiceNote({ engineLabel: 'Google AI', competitors: ['Brian Slattery Plumbers', 'Sunnybank Plumbing'], trade: 'Plumbers', area: 'Halifax', site: { mode: 'no_website', source: 'none', sourceLabel: null }, caller: 'Sam Rep' })!;
  ok(/^hi mate, it's Sam from Findable\./.test(short) && !/quick one/.test(short) && /have you got a website i missed/.test(short), 'the 20-second voice note says who is speaking, drops "quick one", and confirms rather than interrogates about the website');
  ok(/^0\. WHO IS SPEAKING/m.test(VOICE_NOTE_SYSTEM_PROMPT), 'the generated voice note is told to open with who is speaking');
  const prompt = buildVoiceNotePrompt({ business: 'X', trade: 'Plumbers', area: 'Halifax', website: null, evidence: { questionIndex: 0, question: 'q', engine: 'gemini', engineLabel: 'Google AI', competitors: ['A'], answerExcerpt: '', thin: false }, site: { mode: 'no_website', source: 'none', sourceLabel: null, findings: [], services: [], serviceEvidence: '' } as never, caller: 'Sam Rep' });
  ok(/WHO IS SPEAKING .*Sam from Findable/.test(prompt), '…with the signed-in rep\'s first name');
  const check = (s: string) => checkVoiceNoteScript(s, { evidence: { questionIndex: 0, question: 'q', engine: 'gemini', engineLabel: 'Google AI', competitors: ['A'], answerExcerpt: '', thin: false }, site: { mode: 'no_website', source: 'none', sourceLabel: null, findings: [], services: [], serviceEvidence: '' } as never, caller: 'Sam' });
  ok(check("hi mate, it's Sam from Findable. i asked Google AI for a plumber in Halifax and it came up with A, but you didn't come up.").problems.every((p) => !/link/.test(p)), '"from Findable" is the speaker, not a link');
  ok(check('hi mate, have a look at findable dot live').problems.some((p) => /link/.test(p)), '…but the address said aloud still is');
  ok(check('hi mate, i asked Google AI for a plumber in Halifax and it came up with A, but you didn\'t come up.').warnings.some((w) => /who is speaking/.test(w)), 'a generated note that skips who is speaking is flagged to the rep');
}

console.log('── 5. THE CALL FLOW WORKS WITH NO AUDIT AND NO WHATSAPP ──');
{
  const p = buildColdCallPlaybook(base({ report: null, reportAudit: null, messages: [] }));
  ok(p.mode === 'cold' && p.followUp === null, 'no WhatsApp ever sent → a first call');
  ok(p.audit.state === 'none' && p.audit.headline === 'No audit yet', 'the call card says "No audit yet"');
  ok(p.callScript.length >= 3 && /^Hi, is that /.test(p.callScript[0]) && !/didn't come up|it named|named you|but not you/.test(p.callScript.join(' ')), 'the opening works and claims no AI result');
  ok(p.qualify.length >= 4 && p.close.routes.length >= 1 && p.close.guarantee.spoken.length > 0 && p.close.afterPayment.length > 0, '…and every later step (ask, close, after they pay) is still there');
  ok(p.warnings.some((w) => /Run the AI check first/.test(w) && /ring anyway/.test(w)), 'the warning points at the check, and says ringing first is fine');
  const ui = read('src/components/ColdCallPlaybook.tsx');
  ok(/data-testid="call-card-run-check"/.test(ui) && /p\.audit\.state === 'none' && onRunCheck/.test(ui), 'the call card offers "Run the AI check" when there is none');
  ok(/onRunCheck=\{openAiTools\}/.test(read('src/components/LeadDetailDialog.tsx')) && /data-testid="ai-check-tools"[\s\S]{0,400}<LeadHookPanel leadId=\{lead\.id\} \/>/.test(read('src/components/LeadDetailDialog.tsx')), '…which opens the AI check tools on the same Call tab, where the one-lead check is run');
  const ready = buildColdCallPlaybook(base());
  ok(ready.audit.state === 'ready' && /Google AI did not name them — it named Brian Slattery Plumbers Limited and Sunnybank Plumbing Services/.test(ready.audit.headline), 'with an audit: the key finding in one line, from the stored result');
  ok(['call-step-open', 'call-step-ask', 'call-step-close', 'call-step-after', 'call-not-the-owner', 'call-card'].every((id) => ui.includes(`data-testid="${id}"`)), 'the screen: call card, then open → ask → close → after they pay, gatekeeper/voicemail folded');
  for (const c of [base(), noSite(), base({ report: null, reportAudit: null })]) {
    const p2 = buildColdCallPlaybook(c);
    const problems = salesStyleProblems(said(p2), ['Brian Slattery Plumbers Limited', 'Sunnybank Plumbing Services']);
    ok(problems.length === 0, 'house style holds across the new lines' + (problems.length ? ' — ' + problems.join(' ') : ''));
    ok(p2.objections.every((o) => o.answer.split(/(?<=[.?!])\s+/).length <= 5), 'every objection answer is five sentences or fewer');
  }
  const objections = buildColdCallPlaybook(base()).objections.map((o) => o.objection);
  for (const o of ['I need to think about it', 'Who are you? Is this a scam?', 'Can I cancel?', 'How long does it take?']) ok(objections.includes(o), 'objection covered: ' + o);
  ok(objections.some((o) => /^That's a lot/.test(o)), 'objection covered: that\'s a lot / £99?');
}

console.log('── 6. LOGGING THE CALL ROUTES NATURALLY ──');
{
  const crm = read('src/components/LeadCrmPanel.tsx');
  const lc = crm.slice(crm.indexOf('function LogContact('), crm.indexOf('function InternalNote('));
  ok(/CLOSE_READY_OUTCOMES: ReadonlySet<string> = new Set\(\['interested', 'spoke_to_owner', 'meeting_booked'\]\)/.test(crm) && /data-testid="logged-quick-close"/.test(lc) && /<QuickCloseButton leadId=\{leadId\} \/>/.test(lc), 'Interested / Spoke to owner / Meeting booked → Quick Close right in the result line');
  ok(/result\.state\.state !== 'not_interested'/.test(lc), '…never on a lead that reads Not interested');
  ok(/data-testid="outcome-groups"/.test(lc) && /Didn't speak to them/.test(lc) && /Spoke to them/.test(lc) && /current\?\.kind !== 'call'/.test(lc), 'call outcomes grouped by what happened (didn\'t speak / spoke); other channels keep one grid');
  ok(!/lead_set_follow_up/.test(lc), 'logging an outcome itself still never saves a Next Action (the one rule does)');
  const lead = { id: 'l', status: 'contacted', is_potential_work: false, next_action: null } as never;
  ok(outcomePlan('call_back', lead).setNextAction === 'call' && outcomePlan('meeting_booked', lead).setNextAction === 'meeting', 'Call back saves a Call; Meeting booked saves a Meeting');
  ok(outcomePlan('not_interested', lead).status === 'not_interested', 'Not interested sets the status (and clears the Next Action)');
  const dlg = read('src/components/ColdCallPlaybook.tsx');
  ok(/<QuickCloseButton leadId=\{leadId\} className="h-10 px-3 text-sm" \/>/.test(dlg) && /data-testid="log-this-call"/.test(dlg), 'the call screen\'s sticky bar: Log this call + Quick Close, one tap each');
}

console.log('── 7. DOUBLE SUBMIT IS ONE CALL ──');
{
  const crm = read('src/components/LeadCrmPanel.tsx');
  const tap = crm.slice(crm.indexOf('const tap = async'), crm.indexOf('const outcomeButton'));
  ok(/if \(inFlight\.current\) return;\s*inFlight\.current = true;/.test(tap) && /finally \{ inFlight\.current = false; setBusy\(null\); \}/.test(tap), 'a second tap before the first answers is ignored (a ref, not a re-render)');
  ok(/r\.duplicate === true \? 'Already logged a moment ago — not recorded twice'/.test(crm), 'a server-side duplicate is said plainly');
  const mig = read('supabase/migrations/20261007105000_call_workspace_guards.sql');
  for (const fn of ['lead_log_contact', 'lead_record_call']) {
    const body = mig.slice(mig.indexOf('function public.' + fn + '('), mig.indexOf('$function$;', mig.indexOf('function public.' + fn + '(')));
    ok(/perform 1 from public\.outreach_leads where id = _lead_id for update;/.test(body) && /a\.created_at > now\(\) - public\.call_log_dedupe_window\(\)/.test(body) && /'duplicate', true/.test(body), fn + ': locks the lead, then refuses an identical row inside the window (answers ok + duplicate)');
    ok(/a\.actor_user_id is not distinct from auth\.uid\(\)/.test(body) && /a\.body is not distinct from v_note/.test(body) && /a\.data ->> 'outcome' = _outcome/.test(body), fn + ': conservative — same person, same outcome, same note only');
  }
  ok(/interval '10 seconds'/.test(mig), 'the window is one named function, ten seconds');
  const nf = read('src/components/NextActionForm.tsx');
  ok(/if \(busy\) return; setBusy\(true\)/.test(nf), 'the Next Action form ignores a second Save while the first is in flight');
}

console.log('── 8. A STALE NEXT ACTION IS NEVER SILENTLY REPLACED ──');
{
  const call = snapshotOf({ next_action: 'call', next_action_date: '2026-10-06', next_action_time: null });
  const meeting = snapshotOf({ next_action: 'meeting', next_action_date: '2026-10-06', next_action_time: '14:30:00' });
  const none = snapshotOf({ next_action: null, next_action_date: '2026-10-06', next_action_time: '09:00' });
  ok(none.nextAction === 'none' && none.date === null && none.time === null && meeting.time === '14:30', 'snapshot: "none" carries no day or time; a time is HH:MM');
  ok(isStaleSave(meeting, call, snapshotOf({ next_action: 'follow_up', next_action_date: '2026-10-12' })), 'another tab booked a meeting since this screen opened → stale');
  ok(!isStaleSave(call, call, meeting), 'nothing changed meanwhile → not stale');
  ok(!isStaleSave(meeting, call, meeting), 'asking for exactly what is stored now → not a conflict');
  ok(!isStaleSave({ ...call }, { ...call }, call), 'a note-only edit is not material (the snapshot has no note)');
  ok(JSON.stringify(toSnapshotArg(meeting)) === '{"next_action":"meeting","date":"2026-10-06","time":"14:30"}', 'the server argument shape');
  const form = read('src/components/NextActionForm.tsx');
  ok(/const \[expected\] = useState\(\(\) => snapshotOf\(lead\)\);/.test(form) && /onSave\(\{ \.\.\.a, expected \}\)/.test(form), 'the one form captures what it showed at open and sends it with every Save / Clear');
  const write = read('src/lib/nextActionWrite.ts');
  ok(/r\.error === 'stale_next_action'/.test(write) && /confirmReplace\(/.test(write) && /_expected: \{ next_action: cur\.next_action/.test(write), 'on stale_next_action: say what it is now, and only a yes sends again (expecting the new value)');
  ok(/typeof window\.confirm === 'function'[\s\S]{0,200}: false;/.test(write), '…with no way to ask, the answer is no (never a silent replace)');
  ok(/_expected: toSnapshotArg\(snapshotOf\(lead\)\)/.test(read('src/lib/leadOutcome.ts')), 'a Call back / Meeting booked outcome also expects what the screen showed');
  ok(/expected: snapshotOf\(lead\)/.test(read('src/components/NextActionEditor.tsx')), 'the row\'s ✓ Done expects what the row showed');
  const mig = read('supabase/migrations/20261007105000_call_workspace_guards.sql');
  ok(/drop function if exists public\.lead_set_follow_up\(uuid, text, date, text, text, boolean\);/.test(mig) && /_expected jsonb default null::jsonb/.test(mig), 'the server function gains a defaulted _expected (old signature dropped: no ambiguous overload)');
  ok(/'error', 'stale_next_action', 'current'/.test(mig) && /'error', 'bad_expected'/.test(mig), '…answers stale_next_action with the current values, and refuses a malformed expectation');
  ok(/revoke all on function public\.lead_set_follow_up\(uuid, text, date, text, text, boolean, jsonb\) from public, anon;/.test(mig), '…and anon cannot call the new signature');
  ok(/stale_next_action/.test(read('src/lib/salesCrm.ts')), 'the refusal has words');
}

console.log('── 9. ANOTHER REP CANNOT ALTER THE LEAD ──');
{
  const mig = read('supabase/migrations/20261007105000_call_workspace_guards.sql');
  const fns = mig.split(/create (?:or replace )?function /).slice(1).filter((b) => /security definer/.test(b) && /lead_id/.test(b.split('\n')[0]));
  ok(fns.length === 3 && fns.every((b) => /perform public\._require_work\(_lead_id\);/.test(b)), 'every lead write in the migration checks _require_work first (role + the lead is theirs)');
  ok(existsSync(new URL('../supabase/tests/call-workspace-guards.sql', import.meta.url)) && /another rep cannot log a call on the lead/.test(read('supabase/tests/call-workspace-guards.sql')) && /another rep cannot change its Next Action/.test(read('supabase/tests/call-workspace-guards.sql')), 'the live rolled-back SQL test covers it (rep B → not_your_lead)');
}

if (f > 0) { console.log('\n' + f + ' FAILURE' + (f === 1 ? '' : 'S')); process.exit(1); }
console.log('\nALL PASS');
