/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SALES WORKSPACE V2 (Paul, 2026-10-05) — docs/pre-sales-certification/sales-workspace-v2.md.
   Simple for the salesperson, the complexity in the background. Pins:
     1. CAMPAIGNS — a container (name · niche · Call/WhatsApp · optional area); no wizard; leads join from
        Find Leads; a Call campaign never sends; membership never depends on message eligibility; delete
        archives (leads + history stay); stats in the channel's own words.
     2. CONTACT — a Call tap writes nothing; only a logged CONVERSATION stops the cold opener (one rule in
        SQL and the browser); the lead keeps its campaign and the reason is said.
     3. THE CALL TAB — stored evidence only; the sourced UK talking point; the product explainer true to
        the product (Discovery ~40, the 20 × 3 × 2 baseline, the four-week replay); the AI-friendly site
        bullets; ONE Next Action.
     4. DETAILS — "Website & domain".
     5. CLOSE — the questions follow the website approach; a new site never needs the old site's access;
        a domain to hand over is a note for Paul, not a stop; no exact-copy promise without rights; the
        certified money and client-safety rules unchanged.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import {
  campaignFormError, campaignOpenerNote, campaignStats, suggestCampaignName, CAMPAIGN_ERROR_TEXT, LAUNCH_SKIP_TEXT,
} from '../src/lib/campaignRules.ts';
import { QUEUE_SKIP_LABEL } from '../src/lib/salesCrm.ts';
import { CONVERSATION_OUTCOMES, reachedInConversation } from '../src/lib/leadState.ts';
import {
  AI_FRIENDLY_SITE, BASELINE_ANSWERS, DISCOVERY_ABOUT, FOLLOW_UP_VOICE_NOTE, GOOGLE_STILL_MATTERS, HOW_WE_KNOW, HOW_WE_KNOW_CAVEAT,
  REMEASURE_WEEKS, WEBSITE_MATTERS, WHAT_WE_DO, WHAT_WE_DO_SHORT, WHY_IT_MATTERS, WHY_IT_MATTERS_STATS, YEXT_SOURCE, spokenSeconds,
} from '../src/lib/salesExplainer.ts';
import { BASELINE_QUESTIONS, BASELINE_RUNS } from '../src/lib/auditQuestionCounts.ts';
import { REMEASURE_OFFSET_DAYS } from '../src/lib/deliveryCockpit.ts';
import { perTownCounts, DISCOVERY_RUNS } from '../supabase/functions/_shared/baseline-discovery.ts';
import {
  APPROACH_ROUTE, closeFlow, deliveryApproach, missingQuestions, paulFlagText, quickCloseClosedRefusal, quickCloseGate,
  quickCloseState, mayGenerateLink, routeTermsLines, QUICK_CLOSE_PROMISE, QC_REVIEW_HEADING, linkUsable,
} from '../src/lib/quickClose.ts';
import { FINDABLE_GUARANTEE, FINDABLE_MONTHLY_DELAY_DAYS, totalPaymentsFor } from '../src/lib/findableOffer.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const root = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const SQL = read('supabase/migrations/20261008100000_sales_workspace_v2.sql');
const fnBody = (name: string) => { const s = SQL.indexOf(`function public.${name}(`); return s < 0 ? '' : SQL.slice(s, SQL.indexOf('$function$;', s) > 0 ? SQL.indexOf('$function$;', s) : SQL.indexOf('$$', SQL.indexOf('$$', s) + 2)); };

console.log('── 1. CAMPAIGNS ──');
{
  ok(campaignFormError({ name: 'Plumbers · Halifax · Call', trade: 'Plumbers', method: 'call' }) === null, 'name + niche + method is enough (area optional)');
  ok(campaignFormError({ name: 'X', trade: '', method: 'call' }) === CAMPAIGN_ERROR_TEXT.trade_required && campaignFormError({ name: 'X', trade: 'Roofers', method: null }) === CAMPAIGN_ERROR_TEXT.method_required, 'niche and method are required, said in words');
  ok(suggestCampaignName('Plumbers', 'Halifax', 'call') === 'Plumbers · Halifax · Call' && suggestCampaignName('Roofers', '', 'whatsapp') === 'Roofers · WhatsApp', 'a sensible auto-name the person may overwrite');
  ok(!fs.existsSync(path.join(root, 'src/components/campaigns/CampaignWizard.tsx')) && !fs.existsSync(path.join(root, 'src/components/campaigns/LeadChooser.tsx')), 'no lead-selection wizard, no message step');
  const form = read('src/components/campaigns/CampaignEditDialog.tsx');
  ok(!/template|LeadChooser|Review/.test(form.replace(/\/\*[\s\S]*?\*\//g, '')) && /campaign-trade/.test(form) && /campaign-area/.test(form), 'the form has no message / lead / review step');
  const create = fnBody('campaign_new');
  ok(/v_method not in \('call', 'whatsapp'\)/.test(create) && /trade_required/.test(create) && /values \(v_name, auth\.uid\(\)/.test(create) && /security definer/.test(create), 'campaign_new: four fields, the owner is the signed-in account');
  const idx = read('src/pages/Index.tsx');
  ok(/addToOutreach\(lead, lastSearchCountry, 'no_website', activeCampaign,/.test(idx) && /campaign_id: a\.campaignId/.test(read('src/lib/salesAddPayload.ts')), 'Find Leads: the selected campaign is assigned to the businesses added');
  ok(/leadRpc\('lead_set_campaign', \{ _lead_id: crmLeadId, _campaign_id: activeCampaign \}\)/.test(idx) && /data-testid="crm-move-to-campaign"/.test(read('src/components/LeadsTable.tsx')), '…and a business ALREADY in the CRM can be put into the selected campaign from its row');
  ok(/if exists \(select 1 from public\.campaigns where id = _campaign_id and method = 'call'\) then\s*return jsonb_build_object\('ok', false, 'error', 'call_campaign'\)/.test(fnBody('campaign_launch')), 'a Call campaign never queues a WhatsApp opener (campaign_launch refuses it)');
  const page = read('src/pages/Campaigns.tsx');
  ok(/method === 'whatsapp' && c\.ready > 0 && <Button/.test(page) && /method === 'whatsapp' && c\.queued > 0 && <Button/.test(page), '…and its card offers no Send openers / Pause sending');
  ok(!/lead_first_contact_at|lead_reached_contact/.test(read('supabase/migrations/20261006120000_campaign_ownership.sql').slice(read('supabase/migrations/20261006120000_campaign_ownership.sql').indexOf('function public.lead_set_campaign'), read('supabase/migrations/20261006120000_campaign_ownership.sql').indexOf('function public.leads_set_campaign'))), 'joining a campaign never reads contact history (membership ≠ message eligibility)');
  const archive = fnBody('campaign_archive');
  ok(/set archived_at = now\(\)/.test(archive) && !/delete from/.test(archive) && /public\.campaign_stop\(_campaign_id\)/.test(archive), 'delete = archive: no row deleted, waiting openers paused first');
  ok(/leadRpc\('campaign_archive'/.test(read('src/hooks/useMyCampaigns.ts')) && !/from\('campaigns'\)\.delete|\.delete\(\)\.eq\('id'/.test(read('src/hooks/useCampaigns.ts')), 'the screens delete through campaign_archive only — never a hard delete (lead_claims cascade)');
  ok(/archived_at is null/.test(fnBody('campaign_usable')) && /where archived_at is null/.test(SQL), 'an archived campaign takes no new leads and its name is free again');
  const st = campaignStats({ method: 'call', leads: 10, contacted: 0, replied: 0, interested: 2, called: 6, spoke: 3, won: 1 }).map((s) => `${s.label}:${s.value}`).join(' ');
  ok(st === 'Leads:10 Called:6 Spoke:3 Interested:2 Won:1', `call campaign stats in call words (${st})`);
  const sw = campaignStats({ method: 'whatsapp', leads: 10, contacted: 7, replied: 2, interested: 1, called: 0, spoke: 2, won: 0 }).map((s) => s.label).join(',');
  ok(sw === 'Leads,Messaged,Replied,Interested,Won', 'WhatsApp campaign stats in WhatsApp words');
  const stats = fnBody('_campaign_stats');
  ok(/lead_is_client\(l\.amount_paid, l\.status\)/.test(stats) && /lead_conversation_outcomes\(\)/.test(stats) && /not coalesce\(o\.is_archived, false\)/.test(stats), 'stats: won = a client, spoke = a logged conversation or a reply, archived leads not counted');
}

console.log('\n── 2. CONTACT: a tap is not a call ──');
{
  const table = read('src/components/OutreachTable.tsx');
  const call = table.slice(table.indexOf('const handleCallClick'), table.indexOf('}, [onContactGated]);')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  ok(!/onContactMethodChange|executeContact|logAttempt|updateLead|last_outreach_attempt_at/.test(call), 'tapping Call writes nothing (no contact method, no attempt, no status)');
  ok(/<a href=\{`tel:\$\{lead\.phone\}`\}[^>]*data-testid="workspace-call"/.test(read('src/components/LeadDetailDialog.tsx')), 'the popup Call is a plain tel: link — the phone\'s own dialler');
  ok(reachedInConversation([]) === null && reachedInConversation([{ kind: 'call_outcome', created_at: '2026-10-05T10:00:00Z', data: { outcome: 'no_answer' } } as never]) === null, 'no answer is an attempt — it never stops the opener');
  ok(reachedInConversation([{ kind: 'call_outcome', created_at: '2026-10-05T10:00:00Z', data: { outcome: 'spoke_to_owner' } } as never]) === 'phone', 'spoke to the owner (a call) → contacted by phone');
  ok(reachedInConversation([{ kind: 'contact_logged', created_at: '2026-10-05T10:00:00Z', data: { outcome: 'interested', channel: 'email' } } as never]) === 'other', 'a logged conversation on another channel → contacted (other)');
  const sqlOutcomes = [...(SQL.match(/select array\[([^\]]+)\]/)?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort().join();
  ok(sqlOutcomes === [...CONVERSATION_OUTCOMES].sort().join(), `ONE list: the SQL conversation outcomes equal CONVERSATION_OUTCOMES (${sqlOutcomes})`);
  const queue = fnBody('sales_queue_opener');
  ok(/elsif public\.lead_first_contact_at\(v_id\) is not null then v_reason := 'already_contacted';/.test(queue) && /v_reason := case when v_reached\.by_phone then 'contacted_by_phone' else 'contacted_logged' end;/.test(queue), 'sales_queue_opener: the old rules, then a logged conversation → contacted_by_phone / contacted_logged');
  ok(!/last_outreach_attempt_at|contact_method/.test(fnBody('lead_reached_contact')), '…read from logged outcomes only (a dialler tap stamps nothing it could read)');
  ok(/already contacted by phone — initial opener not queued/.test(LAUNCH_SKIP_TEXT.contacted_by_phone) && /already contacted by phone — initial opener not queued/.test(QUEUE_SKIP_LABEL.contacted_by_phone), 'the skip is said plainly where the send was attempted');
  ok(/stays in this campaign/.test(campaignOpenerNote({ method: 'whatsapp', status: 'not_contacted', reached: 'phone' }) ?? '') && /^Already contacted by phone — initial opener not queued/.test(campaignOpenerNote({ method: 'whatsapp', status: 'not_contacted', reached: 'phone' }) ?? ''), 'the lead keeps its campaign, with the reason on the lead');
  ok(campaignOpenerNote({ method: 'whatsapp', status: 'not_contacted', reached: null }) === null && /no WhatsApp opener is ever sent/.test(campaignOpenerNote({ method: 'call', status: 'not_contacted', reached: null }) ?? ''), 'nothing to say when the opener can go; a Call campaign says it never sends');
  ok(!/Already contacted — manage on the Outreach page/.test(read('src/components/LeadsTable.tsx')), 'Find Leads no longer calls a merely-starred lead "Already contacted" (the Infinity Fit Club label)');
}

console.log('\n── 3. THE CALL TAB ──');
{
  const ui = read('src/components/ColdCallPlaybook.tsx');
  /* 2026-10-06 (sales-team-today, Paul): the evidence block inside the playbook (CallEvidence / AiOpportunity /
     AuditEvidence / TalkAbout) was removed — the ONE AI result is the top of the Call tab (LeadHookPanel 'call' →
     HookVisibilityCard → useHookVisibility, the stored scored results). The script reads the stored evidence only. */
  const dlgCall = read('src/components/LeadDetailDialog.tsx');
  ok(!/function (CallEvidence|AiOpportunity|AuditEvidence|TalkAbout)\b|<(CallEvidence|AiOpportunity|AuditEvidence|TalkAbout)\b/.test(ui) && !/'[A-Z][a-z]+ (Plumbing|Locksmiths|Ltd)'/.test(ui)
    && /data-testid="ai-check-tools"[\s\S]{0,400}<LeadHookPanel leadId=\{lead\.id\} variant="call" \/>/.test(dlgCall)
    && /const q = useHookVisibility\(leadId\)/.test(read('src/components/HookVisibilityCard.tsx'))
    && /const top = i\.competitors\.slice\(0, 3\)/.test(read('src/lib/callScript.ts')) && /competitors: evidence\.competitors/.test(read('src/lib/coldCallPlaybook.ts')),
    'evidence = the stored audit (the AI result above the script, the stored answer\'s own competitors in the opener) and the stored crawl — nothing hard-coded');
  {
    const hv = read('src/components/HookVisibilityView.tsx');
    ok(/\{t\.named\}\/\{t\.expected\}/.test(hv) && /scoreTone\(t\.named, t\.expected\)/.test(hv) && /variant\?: 'inline' \| 'call'/.test(hv), 'the "X / N named" count comes from the scored stored results, coloured by scoreTone (the AI result, call variant)');
  }
  const flow = ui.slice(ui.indexOf('function CallFlow('), ui.indexOf('type ScriptTab'));
  const order = ['<Say ', '<Ask ', '<WhyAndWhat ', '<Offer ', '<Objections '].map((s) => flow.indexOf(s));
  ok(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])) && /title="What we do"/.test(ui), 'order: say (opener → reasons → bridge) → ask → what we do (why it matters) → offer → objections');
  ok(!/HowWeBuild|Questions they may ask/.test(ui), 'removed 2026-10-06 (sales-team-today, Paul): "how we build" and "Questions they may ask" blocks');
  ok(/36\.7% of UK consumers had used AI for local search in the previous month/.test(WHY_IT_MATTERS[0].text) && /2026 Yext study/.test(WHY_IT_MATTERS[0].text) && /24% had tried a new local business because of an AI recommendation/.test(WHY_IT_MATTERS[1].text), 'the UK talking point, exactly as sourced');
  /* removed 2026-10-06 (sales-team-today, Paul): the source link on the call screen. The source stays on the DATA
     (every stat carries it), and the two stat cards on screen are the same sourced figures. */
  ok(YEXT_SOURCE === 'Yext — 2026 UK Consumer Search Behaviours, n=600 UK consumers' && WHY_IT_MATTERS.every((p) => p.source === YEXT_SOURCE && /^https:\/\/www\.yext\.com\//.test(p.url))
    && WHY_IT_MATTERS_STATS.length === 2 && WHY_IT_MATTERS_STATS.every((s) => s.source === YEXT_SOURCE && /^https:\/\/www\.yext\.com\//.test(s.url)), '…its source kept on the data, for every stat (incl. the two stat cards)');
  ok(WHY_IT_MATTERS_STATS[0].figure === '37%' && /36\.7%/.test(WHY_IT_MATTERS[0].text) && WHY_IT_MATTERS_STATS[1].figure === '24%' && /24%/.test(WHY_IT_MATTERS[1].text), 'the stat cards are the sourced figures (36.7% shown rounded as 37%)');
  ok(!/data-testid="source-note"|SourceNote|\.url\b|yext\.com/.test(ui) && /WHY_IT_MATTERS_STATS\.map/.test(ui), '…and no source link on the call screen (removed 2026-10-06)');
  const words = [WHY_IT_MATTERS.map((p) => p.text).join(' '), GOOGLE_STILL_MATTERS, WHAT_WE_DO.join(' '), WHAT_WE_DO_SHORT, HOW_WE_KNOW.join(' '), AI_FRIENDLY_SITE.join(' '), WEBSITE_MATTERS, FOLLOW_UP_VOICE_NOTE].join(' ');
  ok(!/replaced google|google is dead|instead of google|cannot recommend you without|can't recommend you without|without a website.{0,20}(can't|cannot)/i.test(words), 'no "AI replaced Google", no "AI cannot recommend you without a website"');
  ok(/Google still matters/.test(GOOGLE_STILL_MATTERS), '"Google still matters" framing');
  ok(!/guarantee(d)? (to|you'?ll) (rank|be named|win)|top of|number one|secret|trick/i.test(words), 'no ranking / winning promise, no "secret trick"');
  ok(BASELINE_QUESTIONS === 20 && BASELINE_RUNS === 3 && BASELINE_ANSWERS === 120 && WHAT_WE_DO.some((l) => l.includes('20 questions × 3 runs × ChatGPT + Gemini = 120 answers')), 'the baseline is still 20 × 3 × 2 = 120 (unchanged)');
  ok(perTownCounts(0).primary === DISCOVERY_ABOUT && perTownCounts(2).primary + 2 * perTownCounts(2).area >= DISCOVERY_ABOUT && DISCOVERY_RUNS === 3 && /around 40 customer-style questions \(more if you cover several towns\)/.test(WHAT_WE_DO[0]), 'Discovery "around 40" is what the engine asks for (40 for one town, more with areas), three times');
  ok(/balanced mix/.test(WHAT_WE_DO[1]) && /already win every time/.test(WHAT_WE_DO[1]) && !/only (target|pick) (what|questions).{0,20}winnable/i.test(WHAT_WE_DO.join(' ')), 'how the 20 are chosen is said as the code does it (balance first) — no "we only target what is winnable"');
  ok(REMEASURE_WEEKS * 7 === REMEASURE_OFFSET_DAYS && /same 20 questions again/.test(WHAT_WE_DO[3]), 'the four-week re-measure: the same 20 questions, 28 days');
  ok(HOW_WE_KNOW.some((l) => /fragmented/.test(l)) && /doesn't guarantee/.test(HOW_WE_KNOW_CAVEAT), '"how do you know?" explains fragmentation and promises nothing');
  ok(AI_FRIENDLY_SITE.length >= 10 && ['sitemap', 'schema', 'cloned town pages', 'keyword stuffing', 'crawlers', 'internal linking'].every((k) => AI_FRIENDLY_SITE.join(' ').toLowerCase().includes(k)), 'the AI-friendly site bullets are all there');
  const dlg = read('src/components/LeadDetailDialog.tsx');
  const flowNa = read('src/components/LeadCallFlow.tsx');
  ok(!/<NextActionBar|onEditNext=|NextActionForm/.test(dlg) && !/<NextActionForm /.test(read('src/components/LeadCrmPanel.tsx')) && (flowNa.match(/<NextActionForm /g) ?? []).length === 1 && (dlg.match(/<HeaderNextAction /g) ?? []).length === 1,
    'ONE Next Action control (2026-10-06): one compact display in the popup header, one editor (LeadCallFlow) — no card at the bottom of Call');
  ok(/lead_set_follow_up/.test(read('src/lib/nextActionWrite.ts')) && /_expected/.test(read('src/lib/nextActionWrite.ts')), 'stale-write protection kept (lead_set_follow_up _expected)');
  ok(spokenSeconds(FOLLOW_UP_VOICE_NOTE) >= 18 && spokenSeconds(FOLLOW_UP_VOICE_NOTE) <= 32 && FOLLOW_UP_VOICE_NOTE.includes(QUICK_CLOSE_PROMISE), `the "how does it work?" voice note is ~20–30 s (${spokenSeconds(FOLLOW_UP_VOICE_NOTE)} s) and says the guarantee as written`);
  // removed 2026-10-06 (sales-team-today, Paul): the coaching block beside the voice note (VoiceCoaching).
  ok(!/data-testid="voice-coaching"|VoiceCoaching/.test(ui) && /\{tab === 'voice' && <VoiceNoteScriptBody leadId=\{leadId\} currentAuditId=\{p\.auditId\} \/>\}/.test(ui), 'the Voice note tab is the voice note alone — no coaching block beside it');
}

console.log('\n── 4. DETAILS ──');
{
  const crm = read('src/components/LeadCrmPanel.tsx');
  ok(/title="Website & domain"/.test(crm) && !/title="Call booked · website"/.test(crm), '"Website & domain" replaces "Call booked · website"');
  ok(/<WebsiteApproachField leadId=\{leadId\} \/>/.test(crm) && /mode: 'save', answers: \{ approach: value \}/.test(read('src/components/QuickCloseDialog.tsx')), 'the website approach is captured here — the SAME stored answer as the Close tab');
}

console.log('\n── 5. CLOSE ──');
{
  ok(APPROACH_ROUTE.improve === 'optimise' && APPROACH_ROUTE.new_template === 'build' && APPROACH_ROUTE.refresh === 'build' && APPROACH_ROUTE.recreation === 'build', 'the approach maps onto the two existing plans');
  /* 2026-10-07 (Paul: "Quick Close should be QUICK"): the offer, authority, then only the plan's own questions. */
  ok(closeFlow({ decision_maker: 'yes', approach: 'new_template' }).join() === 'route,decision_maker', 'new site: the offer and authority — no domain / consents / current-site access on the call');
  ok(closeFlow({ decision_maker: 'yes', approach: 'improve' }).join() === 'route,decision_maker,access,manager', 'Optimise: access and who manages it; no domain question');
  ok(closeFlow({ decision_maker: 'yes', approach: 'refresh' }).join() === 'route,decision_maker' && closeFlow({ decision_maker: 'yes', approach: 'recreation', manager: 'agency' }).join() === 'route,decision_maker,agency_contract', 'refresh / recreation ask nothing extra; Build on an agency site asks only whether they are still in contract');
  const newNoAccess = { decision_maker: 'yes', approach: 'new_template', domain: 'yes', access: 'no', manager: 'agency', agency_contract: 'free', build_consents: 'yes' } as const;
  ok(quickCloseGate(newNoAccess).review.length === 0 && quickCloseState('answers_saved', { answers: newNoAccess }) === 'ready', 'the screenshot: Build + "could not give access to the current website" → NO blocker');
  for (const d of ['agency', 'not_sure', 'no'] as const) {
    const a = { decision_maker: 'yes', approach: 'new_template', domain: d, build_consents: 'yes' } as const;
    ok(mayGenerateLink('answers_saved', { answers: a }) && /^Domain handoff to resolve before launch/.test(paulFlagText('domain_handoff', a)) && !/access problem/i.test(paulFlagText('domain_handoff', a)), `domain "${d}" on a new site → "Domain handoff to resolve before launch", the sale goes ahead`);
  }
  ok(/authorised provider makes the DNS change, or a different domain is agreed/.test(paulFlagText('domain_handoff', { domain: 'no' })), 'never implies Findable can take a domain over: control, an authorised provider, or a different domain');
  ok(quickCloseGate({ decision_maker: 'yes', approach: 'improve', access: 'no', manager: 'owner' }).review.includes('no_site_access') && QC_REVIEW_HEADING === 'WEBSITE ACCESS ISSUE — Paul review required', 'Paul review stays for Optimise on a site we cannot get into — and says what it is');
  const rec = { decision_maker: 'yes', approach: 'recreation', rights: 'not_sure', design_owner: 'agency', domain: 'yes', build_consents: 'yes' } as const;
  ok(mayGenerateLink('answers_saved', { answers: rec }) && deliveryApproach(rec) === 'new_template' && /Never promise an exact copy/.test(paulFlagText('exact_copy_rights', rec)), 'recreation with unclear rights: still sold as Build, delivered as template / refresh, never an exact-copy promise');
  ok(deliveryApproach({ ...rec, rights: 'yes', design_owner: 'agency' }) === 'refresh' && deliveryApproach({ ...rec, rights: 'yes', design_owner: 'business' }) === 'recreation', 'content theirs but design an agency\'s → a visual refresh; both theirs → a close recreation');
  ok(quickCloseGate({ decision_maker: 'no', approach: 'new_template' }).blocked, 'a decision-maker "No" still stops payment');
  ok(quickCloseClosedRefusal({ service_terminated_at: '2026-10-04T10:00:00Z' })?.error === 'client_closed' && quickCloseClosedRefusal({ amount_paid: 99 })?.error === 'already_paid' && quickCloseClosedRefusal({ status: 'refunded' })?.error === 'client_closed', 'ended / paid / refunded clients are still refused');
  ok(totalPaymentsFor('build') === 12 && totalPaymentsFor('optimise') === 6 && FINDABLE_MONTHLY_DELAY_DAYS === 42 && routeTermsLines('build')[1] === 'Then £99 a month, starting the day after your 14-day refund window closes (normally about six weeks after you give us access)', 'pricing unchanged: Build 12, Optimise 6; the card times the monthly by v3 Option B (E2E-11)');
  ok(QUICK_CLOSE_PROMISE === 'We improve AI visibility or you get your money back.' && FINDABLE_GUARANTEE.length > 100, 'the guarantee unchanged');
  ok(!linkUsable({ link_url: 'https://x', link_generated_at: '2026-09-29T10:00:00Z' }, Date.parse('2026-10-05T10:00:00Z')), 'stale-link protection unchanged');
  ok(missingQuestions({ decision_maker: 'yes', approach: 'new_template', domain: 'yes' }).length === 0, '2026-10-07: the Build consents are no longer asked on the call (the signed agreement covers them; the onboarding form collects the details)');
  const fn = read('supabase/functions/quick-close/index.ts');
  ok(/flags: quickCloseGate\(answers\)\.flags\.map\(\(f\) => paulFlagText\(f, answers\)\)/.test(fn) && /title: QC_REVIEW_HEADING,/.test(fn), 'the server returns the flags and words the payment stop truthfully');
  const dlg = read('src/components/LeadDetailDialog.tsx');
  const closeTab = dlg.slice(dlg.indexOf('TabsContent value="close"'), dlg.indexOf('TabsContent value="history"'));
  ok(/<QuickClosePanel leadId=\{lead\.id\}/.test(closeTab) && /!isPaidLead\(lead\) && \(/.test(closeTab) && /<OnboardingLinkCard lead=\{lead\} \/>/.test(closeTab), 'Close tab: the close, then the self-service sign-up link only before payment');
  ok(/Paul takes it from here/.test(read('src/components/QuickCloseDialog.tsx')), 'after payment the setup is Paul\'s (no setup link handed to the seller)');
}

if (f) { console.log(`\n${f} FAILURE(S)`); process.exit(1); }
console.log('\nALL PASS');
