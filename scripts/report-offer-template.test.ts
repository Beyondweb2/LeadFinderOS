/* THE NAME ON YOUR MESSAGES + ai_visibility_report_offer (2026-10-14, docs/team-access-tidy.md §4–5).
 * Pure rules are run; the wiring (registries, both senders, the queue pre-check, the first-login box) is pinned by
 * reading the source. Nothing here sends a message. */
import fs from 'node:fs';
import path from 'node:path';
import {
  cleanMessageName, emailLocalPart, hasChosenMessageName, MESSAGE_NAME_MAX, messageNameFor, messageNameProblem,
} from '../src/lib/messageName.ts';
import {
  formatVisibilityScore, isLanguageSchoolTrade, joinNames, queueDropWords, REPORT_OFFER_TEMPLATE, REPORT_OFFER_VARS,
  reportOfferBody, reportOfferRefusal, reportOfferWarnings, ukWordedTemplateRefusal, UK_WORDED_TEMPLATES,
} from '../src/lib/reportOfferTemplate.ts';
import { WA_TEMPLATES, templateBodyParams, renderTemplateBody } from '../supabase/functions/_shared/whatsapp-send.ts';
import { READABLE_TEMPLATE_BODIES } from '../src/lib/templateBodies.ts';
import { branchForVars, unsuppliedVars } from '../src/lib/templateRouting.ts';
import { isColdOutreachTemplate } from '../src/lib/coldOutreach.ts';
import { WHATSAPP_TEMPLATES } from '../src/types/outreach.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const root = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');

/* ── 1. The message name ── */
ok(messageNameProblem('') === 'empty' && messageNameProblem('   ') === 'empty', 'N1. a blank name is refused');
ok(messageNameProblem('Ethan') === null && messageNameProblem('x'.repeat(MESSAGE_NAME_MAX + 1)) === 'too_long', 'N2. 1–40 characters');
ok(messageNameProblem('Ethan\nLee') === 'line_break', 'N3. one line only (Meta refuses a newline in a parameter)');
ok(cleanMessageName('  Ethan   Lee ') === 'Ethan Lee', 'N4. spaces are tidied');
ok(emailLocalPart('ethan.lee@findable.live') === 'ethan.lee' && emailLocalPart('') === '' && emailLocalPart('nope') === '', 'N5. the fallback is the first part of the email');
ok(messageNameFor({ message_name: 'Ethan', email: 'x@y.z' }) === 'Ethan', 'N6. a chosen name wins');
ok(messageNameFor({ message_name: null, email: 'ethan@y.z' }) === 'ethan', 'N7. no name → their OWN email’s first part');
ok(messageNameFor(null) === '' && messageNameFor({ message_name: null, email: null }) === '', 'N8. no person → no name (the sender refuses)');
ok(!hasChosenMessageName(null) && hasChosenMessageName('Ethan'), 'N9. the box shows until a name is chosen');

const dlg = read('src/components/MessageNameDialog.tsx');
ok(/What name should we use on your messages\?/.test(dlg), 'N10. the box asks exactly "What name should we use on your messages?"');
ok(/mustChange/.test(dlg) && /if \(!uid \|\| mustChange\) return;/.test(dlg), 'N11. it waits until any temporary-password change is done');
ok(/sessionStorage/.test(dlg) && /messageNameSkipKey/.test(dlg), 'N12. skipped → asked again at the next login, not again in this one');
ok((dlg.match(/<Input /g) ?? []).length === 1, 'N13. ONE field — not onboarding');
ok(/<MessageNameDialog \/>/.test(read('src/components/AppLayout.tsx')), 'N14. mounted once in the signed-in app shell');
ok(/OPEN_MESSAGE_NAME_EVENT/.test(read('src/components/UserMenu.tsx')) && /OPEN_MESSAGE_NAME_EVENT/.test(read('src/components/MobileBottomNav.tsx')), 'N15. editable later from the account menu (desktop and phone)');
const mig = read('supabase/migrations/20261026090000_message_name_report_offer.sql');
ok(/add column if not exists message_name text/.test(mig) && /profiles_message_name_shape/.test(mig), 'N16. stored on the profile, shape-checked in the database');
const sender = read('supabase/functions/_shared/sender-name.ts');
ok(/messageNameFor\(/.test(sender) && !/assigned_to_user_id|user_id\s*:\s*lead|book_owner|"Paul"/.test(sender.replace(/\/\/.*$/gm, '')), 'N17. the sender name is only ever the given person’s own');

/* ── 2. The template ── */
ok(JSON.stringify(WA_TEMPLATES[REPORT_OFFER_TEMPLATE]?.vars) === JSON.stringify(REPORT_OFFER_VARS), 'T1. registered with exactly the six variables, in order');
const q = read('supabase/functions/process-whatsapp-queue/index.ts');
ok(q.includes('ai_visibility_report_offer: { lang: "en", vars: ["name_or_there", "town", "competitors", "visibility_score", "audit_url", "sender_name"] }'), 'T2. the queue mirror carries the same six');
ok(WA_TEMPLATES[REPORT_OFFER_TEMPLATE]?.lang === 'en' && !('headerVideoUrl' in (WA_TEMPLATES[REPORT_OFFER_TEMPLATE] ?? {})), 'T3. English, no header');
ok(branchForVars(REPORT_OFFER_VARS) === 'audit' && unsuppliedVars(REPORT_OFFER_VARS).length === 0, 'T4. routed to the audit branch, which supplies every variable');
ok(isColdOutreachTemplate(REPORT_OFFER_TEMPLATE), 'T5. cold: the phone-history seatbelt and the opener contact guard apply');
ok(WHATSAPP_TEMPLATES.some((t) => t.value === REPORT_OFFER_TEMPLATE), 'T6. in the queue picker');

ok(joinNames(['A']) === 'A' && joinNames(['A', 'B']) === 'A and B' && joinNames(['A', 'B', 'C']) === 'A, B and C', 'T7. names join as "A", "A and B", "A, B and C"');
ok(formatVisibilityScore(66.4) === '66%' && formatVisibilityScore(66.6) === '67%' && formatVisibilityScore(0) === '0%' && formatVisibilityScore(null) === '' && formatVisibilityScore(NaN) === '', 'T8. the score is a whole-number percentage, nothing when absent');

const extra = { templateName: REPORT_OFFER_TEMPLATE, competitors: 'Alpha English, Beta School and Gamma Centre', town: 'Johor Bahru', visibilityScore: '33%', auditUrl: 'https://findable.live/r/ABC234', senderName: 'Ethan' };
const params = templateBodyParams(WA_TEMPLATES[REPORT_OFFER_TEMPLATE].vars, 'Bright English Academy', '', extra)[0].parameters.map((p: { text: string }) => p.text);
ok(params.length === 6 && params[1] === 'Johor Bahru' && params[2] === extra.competitors && params[3] === '33%' && params[4] === extra.auditUrl && params[5] === 'Ethan', 'T9. the six parameters fill in order');
ok(!/preview/.test(params[4]), 'T10. the report link carries no preview flag');
const p0 = templateBodyParams(WA_TEMPLATES[REPORT_OFFER_TEMPLATE].vars, '', '', extra)[0].parameters[0].text;
ok(p0 === 'there', 'T11. no business name → "Hi there"');
const throws = (over: Record<string, string>) => { try { templateBodyParams(WA_TEMPLATES[REPORT_OFFER_TEMPLATE].vars, 'X', '', { ...extra, ...over }); return false; } catch (e) { return String((e as Error).message).startsWith('unsafe_template_var:') || /audit_url/.test(String((e as Error).message)); } };
ok(throws({ competitors: '' }), 'T12. no competitors → refused before Meta');
ok(throws({ visibilityScore: '' }) && throws({ visibilityScore: 'sixty' }), 'T13. no score → refused before Meta');
ok(throws({ auditUrl: '' }), 'T14. no report link → refused before Meta');
ok(throws({ senderName: '' }), 'T15. no sender name → refused (never a default, never another person)');

const body = reportOfferBody({ name: 'Bright', town: 'Johor Bahru', competitors: 'A, B and C', score: '33%', link: 'https://findable.live/r/ABC234', sender: 'Ethan' });
ok(body === `Hi Bright, I searched Google AI and ChatGPT for the best English language school in Johor Bahru and it mentioned
A, B and C
but not you.
Your AI visibility score is 33%.
Here is your free report: https://findable.live/r/ABC234
I know how to get you showing up more in those answers so students are more likely to find you.
Can I call you, or send you more info?
Ethan 😊`, 'T16. the transcript body is the registered wording exactly');
ok(renderTemplateBody(REPORT_OFFER_TEMPLATE, 'Bright', 'https://findable.live/r/ABC234', undefined, 'A, B and C', undefined, 'Johor Bahru', undefined, undefined, '33%', 'Ethan') === body, 'T17. the stored Inbox body matches');
ok(READABLE_TEMPLATE_BODIES[REPORT_OFFER_TEMPLATE]('Bright', 'https://findable.live/r/ABC234', undefined, 'A, B and C', undefined, 'Johor Bahru', undefined, undefined, '33%', 'Ethan') === body, 'T18. the readable (SPA) body matches');

/* ── 3. The queue guard ── */
const good = { hasAudit: true, competitors: 'A and B', score: '33%', link: 'https://findable.live/r/ABC234', namedInAnswers: false };
ok(reportOfferRefusal(good) === null, 'G1. every piece present → queueable');
ok(reportOfferRefusal({ ...good, hasAudit: false }) === 'no_audit', 'G2. no finished check → refused');
ok(reportOfferRefusal({ ...good, competitors: '' }) === 'no_competitors', 'G3. no competitor names → refused');
ok(reportOfferRefusal({ ...good, score: '' }) === 'no_score', 'G4. no score → refused');
ok(reportOfferRefusal({ ...good, link: '' }) === 'no_report_link' && reportOfferRefusal({ ...good, link: 'https://findable.live/r/ABC234?preview=1' }) === 'no_report_link', 'G5. no (or a preview) report link → refused');
ok(reportOfferRefusal({ ...good, namedInAnswers: true }) === 'named_in_answers', 'G6. the lead was named in the answers → refused');
ok(/mode === "report_offer_check"/.test(q) && /mode === "report_offer_check"\)\) salesActor/.test(q), 'G7. the pre-check exists and a salesperson may ask it');
ok(/if \(salesActor\) q = q\.eq\("assigned_to_user_id", salesActor\.id\)/.test(q), 'G8. a salesperson is answered only for their own leads');
ok(/HOOK_NO_GAP_REASON\)\) return "named_in_answers"/.test(q), 'G9. "named in every answer" maps to named_in_answers');
const ot = read('src/components/OutreachTable.tsx');
ok((ot.match(/template === REPORT_OFFER_TEMPLATE\) \{\n\s+const chk = await checkReportOffer/g) ?? []).length === 2, 'G10. both bulk paths (admin, sales) check before queueing');
ok(/<ReportOfferPreviewBox/.test(ot), 'G11. the queue dialog shows who can get it, who cannot and why, before the press');
ok(/reportOfferBlocked\(\)/.test(read('src/components/WhatsAppLeadControls.tsx')), 'G12. the single-lead queue checks too');
ok(/queued_by_user_id: user\?\.id/.test(ot) && /queued_by_user_id = v_uid/.test(mig), 'G13. who queued it is stamped (admin write and the sales function)');
ok(/'initial_contact', 'initial_opener_v2', 'ai_visibility_report_offer'/.test(mig), 'G14. the sales queue function accepts the report offer');

/* ── 4. Warnings (never a block) ── */
ok(reportOfferWarnings({ market: 'MY', trade: 'English language school' }).length === 0, 'W1. a Malaysian language school → no warning');
ok(reportOfferWarnings({ market: null, trade: 'English tuition' }).includes('outside_markets'), 'W2. outside MY / SG / UK → warning');
ok(reportOfferWarnings({ market: 'UK', trade: 'plumber' }).includes('not_language_school'), 'W3. not a language school → warning');
ok(isLanguageSchoolTrade('IELTS centre') && isLanguageSchoolTrade('Language schools') && !isLanguageSchoolTrade('Locksmith'), 'W4. language-school trades recognised');

/* ── 5. UK-worded templates + Meta status ── */
ok([...UK_WORDED_TEMPLATES].sort().join() === 'booking_switch_barbers,explain_offer,explain_offer_v2,re_engage', 'U1. the four UK-worded templates');
ok(ukWordedTemplateRefusal('explain_offer', 'MY') !== null && ukWordedTemplateRefusal('re_engage', 'SG') !== null && ukWordedTemplateRefusal('explain_offer', null) !== null, 'U2. never to Malaysia, Singapore or an unknown number');
ok(ukWordedTemplateRefusal('explain_offer', 'UK') === null && ukWordedTemplateRefusal(REPORT_OFFER_TEMPLATE, 'MY') === null, 'U3. the UK is unchanged; other templates unaffected');
ok(/ukWordedTemplateRefusal\(templateName, coldMarket\)/.test(q) && /ukWordedTemplateRefusal\(templateName, mobileMarketOf\(to\)\)/.test(read('supabase/functions/send-whatsapp-message/index.ts')), 'U4. both senders enforce it');
ok(/META_STATUS_GATED\.has\(templateName\)/.test(q) && /templateAvailability\(service, templateName\)/.test(q), 'M1. the drip reads Meta’s live status before sending the report offer');
ok(/TEMPLATE_UNAVAILABLE_CODES\.has\(failCode\) \|\| failCode === 132000/.test(q) && /whatsapp_attempts: attempts, contact_method: null, queued_at: null/.test(q), 'M2. a template refusal from Meta leaves the queue — never retried in a loop');
ok(/rejected by Meta/.test(queueDropWords('template_rejected') ?? '') && /not sent/i.test(queueDropWords('report_offer_no_score') ?? '') && queueDropWords('sent') === null, 'M3. the reason is said plainly on the lead');

console.log(f ? `\n${f} FAILURE(S)` : '\nALL PASS');
process.exit(f ? 1 : 0);
