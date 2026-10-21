/* THE REPLY RECON REGRESSION SET (Paul, 2026-10-21; reply recon 2026-10-20 §7). 100 real threads (masked, scripts/fixtures/
   reply-recon-regression.json), each at the burst the drafter would read, run through pickMove and scored the §7b way:
     1. ROUTE (hard gate): draft / needs you / stop / auto / client. ⛔ A stop, angry, complaint, not-interested or client thread
        must NEVER produce a draft: any miss fails the suite.
     2. INTENT: for draft cases, the intent equals the expected one.
     3. CONTENT: every rule-built draft passes the checker, one question at most, no AI brand, no banned phrase, no sign-up link,
        every £ and "weeks" on the fact sheet, word caps, greeting names only from the first-name list.
   The expected values are Claude's (the recon). Where this session disagrees, OVERRIDES says why; the code is not bent to them.
   Pure: no model, no DB. `--preview` prints the draft for every case. */
import { readFileSync } from 'node:fs';
import { pickMove, PITCH_SITE_Q, type MoveEvidence, type MoveThreadMsg, type MovePlan } from '../src/lib/replyMove.ts';
import { NEEDS_YOU_INTENTS, NEW_INTENTS, type PlaybookIntent } from '../src/lib/replyPlaybook.ts';
import { aiReplyDecision, checkAiReply, fallbackAiReply, AI_BRAND, type AiReplyContext } from '../src/lib/aiReplyDraft.ts';
import { SHEET_MONEY } from '../src/lib/offerFactSheet.ts';
import { REMEASURE_WEEKS_STANDARD } from '../src/lib/findableOffer.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };
const PREVIEW = process.argv.includes('--preview');

interface Case { id: string; date: string; pattern: string; context_before: string[]; prospect_messages: string[]; expected: string; note: string }
const CASES = JSON.parse(readFileSync(new URL('./fixtures/reply-recon-regression.json', import.meta.url), 'utf8')) as Case[];

/* ── where this session disagrees with the recon's expected value (said in the report, never bent into the code) ── */
const OVERRIDES: Record<string, { expected: string; why: string }> = {
  R054: { expected: 'NEEDS:not_interested', why: 'B9 (Paul): "No thanks" + a reason is a no. moved_area asks a question, which would push after a no.' },
  R066: { expected: 'NEEDS:not_interested', why: 'B9 (Paul): "Thanks anyway but I am fine" + a reason is a no; the older eval (zz-real-19) says the same.' },
  R075: { expected: 'DRAFT:how_much', why: 'A price question beside a proof ask is answered as the price first (zz-real-15).' },
  R081: { expected: 'DRAFT:set_call', why: 'We asked the time; confirming it is the existing set_call draft (the win event), not a hand-over.' },
  R095: { expected: 'NEW:where_based', why: '"Company name and website": where_based gives both (findable.live); who_are_you gives neither.' },
  R077: { expected: 'NEEDS:proof_request', why: 'References are something we cannot send (Paul: proof we cannot send is Needs you). Suggested text is the proof line.' },
};
/* Not scored: an intent not built yet. (R085 acknowledge_wait was built 2026-10-21, Paul: "No problem, speak soon.") */
const NOT_BUILT: Record<string, string> = {};

/* ── the evidence every case reads (route and intent are tested, not pitch content: the recon used one stand-in) ── */
const EV: MoveEvidence = { businessName: 'ZZ Fixture Business', trade: 'driving instructor', town: 'Rugby', engineWords: 'gemini', named: { named: 0, valid: 6 },
  missed: { engine: 'gemini', question: 'Who is the best driving instructor in Rugby?' }, competitors: ['Rival A Driving', 'Rival B Driving', 'Rival C Driving'],
  hookAlreadySent: false, findings: [], hasWebsite: true, ownerName: null, foundOnGoogle: true,
  site: { state: 'issues', issues: ['Some pages have no main heading', 'There is no phone number on the site'] } };
const NO_SITE: MoveEvidence = { ...EV, hasWebsite: false, site: { state: 'no_website', issues: [] } };

/* ── one thread per case: context hours apart, the burst 30 seconds apart, the last message at the case's own time ── */
const HOUR = 3_600_000;
function threadOf(c: Case): { thread: MoveThreadMsg[]; nowMs: number } {
  const T = Date.parse(c.date.replace(' ', 'T') + ':00Z');
  const ctx = c.context_before.map((s): MoveThreadMsg => {
    const tpl = /^US\[template ([a-z0-9_]+)\]$/i.exec(s);
    if (tpl) return { from: 'us', text: '', templateName: tpl[1], messageType: 'template' };
    const m = /^(US|THEM): ?([\s\S]*)$/.exec(s);
    return { from: m?.[1] === 'THEM' ? 'them' : 'us', text: m?.[2] ?? s, messageType: 'text' };
  });
  let them = c.prospect_messages;
  let chaseGapMs = 0;
  if (c.id === 'R018') them = them.slice(0, 2); // the recon's burst ran on into a chase three days later (that is R100)
  if (c.id === 'R100') chaseGapMs = 3 * 24 * HOUR; // "Hellooo, just wanted to follow up" came three days after the first two
  const n = them.length;
  const burst = them.map((text, j): MoveThreadMsg => {
    const back = (n - 1 - j) * 30_000 + (c.id === 'R100' && j < n - 1 ? chaseGapMs : 0);
    return { from: 'them', text, messageType: 'text', at: new Date(T - back).toISOString() };
  });
  const start = Date.parse(burst[0].at!) - HOUR;
  ctx.forEach((m, i) => { m.at = new Date(start - (ctx.length - 1 - i) * 2 * HOUR).toISOString(); });
  /* R042: the recon's note is that our template looped into the auto-responder; the saved context only kept the opener. */
  if (c.id === 'R042') {
    const auto = burst[0];
    const t0 = Date.parse(auto.at!);
    ctx.push({ from: 'them', text: auto.text, messageType: 'text', at: new Date(t0 - 2 * HOUR).toISOString() },
      { from: 'us', text: '', templateName: 'audit_reply', messageType: 'template', at: new Date(t0 - HOUR).toISOString() });
  }
  return { thread: [...ctx, ...burst], nowMs: T + 60_000 };
}

type Route = 'draft' | 'needs' | 'stop' | 'auto' | 'client';
const expectedOf = (c: Case) => OVERRIDES[c.id]?.expected ?? c.expected;
function expectedRoute(exp: string): Route {
  if (exp === 'STOP') return 'stop';
  if (exp === 'CLIENT') return 'client';
  if (exp === 'AUTO' || exp === 'NEEDS:repeat_auto_reply') return 'auto'; // a repeated auto-reply is skipped, never drafted

  if (exp.startsWith('NEEDS')) return 'needs';
  const intent = exp.split(':')[1] as PlaybookIntent | undefined;
  return intent && NEEDS_YOU_INTENTS.includes(intent) ? 'needs' : 'draft';
}
const routeOf = (p: MovePlan): Route => (p.stop ? 'stop' : p.move === 'auto_reply' ? 'auto' : p.noDraft || p.needsYou ? 'needs' : 'draft');
/** The safety classes (§7b hard gate): never a draft, not even on "Draft reply". */
const SAFETY = (exp: string) => exp === 'STOP' || exp === 'CLIENT' || /^NEEDS:(angry|complaint|not_interested|opt_out)$/.test(exp);
const intentMatches = (exp: string, p: MovePlan) => {
  if (exp === 'PITCH' || exp === 'PITCH-SITE') return p.move === 'first_reply_pitch' && p.read === 'first_reply';
  const want = exp.split(':')[1];
  if (exp.startsWith('NEEDS:') && !NEW_INTENTS.includes(want as PlaybookIntent) && want !== 'proof_request') return true; // the route is what is scored
  if (want === 'set_call') return p.move === 'set_call';
  return p.intent === want;
};

/* ── §7b content checks on a draft ── */
const FIRST_NAMES_OK = /^(Hi|Hey) (mate|Mark|Sarah|Michael|Kylie|Dom|Lewis|Rachel),/;
const BANNED: Array<[RegExp, string]> = [
  [/£\s?19\.99|£\s?49\.99|£\s?59\b|special\s+deal|six\s+months\s+minimum/i, 'a retired price or deal'], [/\binvisible\b/i, '"invisible"'], [/\btop\b/i, '"top"'],
  [/\bnumber\s+one\b/i, '"number one"'], [/\bdefinitely\b/i, '"definitely"'], [/\bwe'?ll\s+get\s+you\b/i, '"we\'ll get you"'], [/\bwill\s+rank\b/i, '"will rank"'],
  [/100\s?%/, '"100%"'], [/\brubbish\b|\buseless\b/i, 'a put-down'], [/\bfree\b(?!\s+(?:now|to\s+(?:leave|talk|chat|call)))/i, '"free"'], [/\bmonthly\b/i, '"monthly" (say "regular checks")'],
  [/\/agree\b|\bsign[\s-]?up\b|\bonboarding\b/i, 'a sign-up link'],
];
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
function contentProblems(text: string, p: MovePlan, ctx: AiReplyContext): string[] {
  const out = [...checkAiReply(text, ctx)];
  if ((text.replace(/"[^"\n]*"/g, '').match(/\?/g) ?? []).length > 1) out.push('more than one question');
  const pitchStyle = p.move === 'first_reply_pitch' || p.move === 'auto_reply';
  /* Word caps: the first pitch 110 (the straight-answer / chased pitch carries one more sentence: 135); a follow-up 45, except a line
     Paul dictated word for word (factual / fixed: the price, the proof words), which is his length. */
  const cap = pitchStyle ? (p.intent === 'straight_answer_then_pitch' || p.intent === 'they_chased' ? 135 : 110) : p.fixedText || /word for word/.test(p.points[0] ?? '') ? 70 : 45;
  if (words(text) > cap) out.push(`${words(text)} words (cap ${cap})`);
  const hi = /^(Hi|Hey) [A-Za-z]+,/.exec(text);
  if (hi && !FIRST_NAMES_OK.test(text)) out.push(`greets "${hi[0]}"`);
  if (!p.brandsAllowed && AI_BRAND.test(text)) out.push('names an AI brand');
  for (const [re, label] of BANNED) if (re.test(text)) out.push(`uses ${label}`);
  for (const m of text.match(/£\s?\d[\d,]*(?:\.\d+)?/g) ?? []) if (!SHEET_MONEY.includes(m.replace(/\s/g, '').replace(/\.00$/, ''))) out.push(`${m} is not on the fact sheet`);
  for (const m of text.matchAll(/\b(\d+)\s+weeks?\b/gi)) if (Number(m[1]) !== REMEASURE_WEEKS_STANDARD) out.push(`"${m[0]}" is not on the fact sheet`);
  return out;
}

console.log(`1. the ${CASES.length} cases`);
ok(CASES.length === 100, '100 cases in the set');
let routeRight = 0; let routeTotal = 0; let intentRight = 0; let intentTotal = 0; let safetyMiss = 0; let contentRight = 0; let contentTotal = 0;
const previews: string[] = [];
for (const c of CASES) {
  if (NOT_BUILT[c.id]) { console.log(`  SKIP ${c.id}: ${NOT_BUILT[c.id]}`); continue; }
  const exp = expectedOf(c);
  const { thread, nowMs } = threadOf(c);
  const evidence = c.expected === 'PITCH-SITE' ? NO_SITE : EV;
  const plan = pickMove({ thread, suppressed: false, aiSentSinceWin: 0, evidence, nowMs });
  const latest = [...thread].reverse().find((m) => m.from === 'them')!;
  let route = routeOf(plan);
  if (exp === 'CLIENT') {
    const d = aiReplyDecision({ inboundAt: latest.at!, lead: { amount_paid: 99, status: 'payment_received' }, hadOutreach: true, plan, nowMs });
    route = d.kind === 'skipped' && d.reason === 'client' ? 'client' : route;
  }
  const want = expectedRoute(exp);
  /* A stop where the recon said Needs you (angry / complaint) is the stricter side: it still writes no draft. */
  const routeOk = route === want || (want === 'needs' && SAFETY(exp) && route === 'stop');
  routeTotal++; if (routeOk) routeRight++;
  const drafts = !plan.stop && !plan.noDraft && route !== 'client';
  if (SAFETY(exp) && drafts) safetyMiss++;
  ok(routeOk, `${c.id} route: expected ${want}${OVERRIDES[c.id] ? ' (override)' : ''}, got ${route} (${plan.intent ?? plan.move}${plan.needsYou ? ' / ' + plan.needsYou.reason : ''}) — "${latest.text.slice(0, 50)}"`);
  if (SAFETY(exp)) ok(!drafts, `${c.id} ⛔ hard gate: ${exp} writes no draft`);
  if (exp.startsWith('PITCH') || exp.startsWith('DRAFT:') || exp.startsWith('NEW:') || exp === 'NEEDS:proof_request') {
    intentTotal++;
    const im = intentMatches(exp, plan);
    if (im) intentRight++;
    ok(im, `${c.id} intent: expected ${exp}, got ${plan.intent ?? plan.read}`);
    if (exp === 'PITCH-SITE') ok(plan.question === PITCH_SITE_Q, `${c.id}: no website on record → the website question`);
  }
  if (!plan.stop && !plan.noDraft && route !== 'client' && route !== 'auto') {
    const ctx: AiReplyContext = { businessName: evidence.businessName, latestInbound: latest.text, thread: thread.map((m) => ({ from: m.from, text: m.text })), plan, evidence };
    const text = fallbackAiReply(ctx);
    const probs = contentProblems(text, plan, ctx);
    contentTotal++; if (!probs.length) contentRight++;
    ok(!probs.length, `${c.id} content (${plan.intent ?? plan.move})${probs.length ? ' — ' + probs.join(' | ') : ''}`);
    previews.push(`PREVIEW ${c.id} ${plan.intent ?? plan.move}${plan.needsYou ? ' [Needs you: ' + plan.needsYou.reason + ']' : ''} | them: "${latest.text.slice(0, 80)}" | draft: "${text.replace(/\n+/g, ' / ')}"`);
  }
}

console.log('2. the §7b scores');
const pct = (a: number, b: number) => (b ? Math.round((1000 * a) / b) / 10 : 100);
console.log(`  route ${routeRight}/${routeTotal} (${pct(routeRight, routeTotal)}%) · intent ${intentRight}/${intentTotal} (${pct(intentRight, intentTotal)}%) · content ${contentRight}/${contentTotal} · overrides ${Object.keys(OVERRIDES).length} · not built ${Object.keys(NOT_BUILT).length}`);
ok(safetyMiss === 0, `⛔ HARD GATE: no stop / angry / complaint / not-interested / client case produced a draft (${safetyMiss} did)`);
ok(pct(routeRight, routeTotal) >= 97, `route accuracy at least 97% (${pct(routeRight, routeTotal)}%)`);
ok(pct(intentRight, intentTotal) >= 90, `intent accuracy at least 90% (${pct(intentRight, intentTotal)}%)`);
for (const [id, o] of Object.entries(OVERRIDES)) console.log(`  OVERRIDE ${id}: ${o.expected} — ${o.why}`);

if (PREVIEW) console.log('\n' + previews.join('\n'));
if (f) { console.log(`\n${f} FAILURE(S)`); process.exit(1); }
console.log('\nALL PASS');
