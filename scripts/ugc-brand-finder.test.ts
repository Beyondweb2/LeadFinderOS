/* UGC Brand Finder (2026-10-29, docs/ugc-brand-finder.md). Proves, without Apify, a model or the database:
 *   · Jess's rules: Tier B from the Ads Library, the hard no's (incl. religion, her blocked list, her pitch log),
 *     contact order, follow-ups at +5 / +12 business days, the local track has none;
 *   · the pitch pipeline: write → independent review → code checks, max 3 attempts, then "Needs Jess" (no draft);
 *     no rate, no Thailand in a brand pitch, no figure outside "About Jess" / the research;
 *   · money: every run has a ceiling, refused when the Apify reading is missing (fail closed) or near the cap;
 *   · separation: own tables with RLS, her pitch system owner-only (not the admin), one channel per brand enforced
 *     in SQL, a UGC login never gets a user_roles row, the function sends nothing, her files are gitignored. */
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { adsLibraryTierB, tierFor, templateFamilyFor } from '../src/lib/ugc/tiers.ts';
import { addBusinessDays, bestContact, contactOptions, emailKind, followUps } from '../src/lib/ugc/contactOrder.ts';
import {
  MAX_PITCH_ATTEMPTS, WHATSAPP_ASK_DRAFT, chooseTemplate, copyEmailPayload, fillWhatsAppAsk, gmailComposeUrl, pitchProblems,
  runPitchPipeline, safeSignoffHtml, unverifiedFigures, whatsappChatUrl, type PitchPlan, type PitchSystem, type ResearchFields, type WriteOut,
} from '../src/lib/ugc/pitch.ts';
import { brandVerdict } from '../src/lib/ugc/brandRules.ts';
import {
  candidatesFrom, contactsInput, fromContactItem, fromFbAd, namedContactsFrom, primaryNamedContact, waDigits, brandWebsite,
} from '../src/lib/ugc/normalize.ts';
import { parseSheetDate, pitchedKeySet, rowsFromCsv, rowsFromWorkbook } from '../src/lib/ugc/pitchLog.ts';
import { parsePitchSystem } from '../src/lib/ugc/pitchSystemImport.ts';
import { ENRICH_LEADS_PER_BRAND, UGC_APIFY_STOP_PCT, UGC_MAX_ITEM_CAP, clampCap, estimateRunUsd, ugcSpendRefusal } from '../src/lib/ugc/config.ts';
import { createUgcMember } from '../supabase/functions/_shared/ugc-member-create.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log(`  PASS ${m}`); else { f++; console.log(`  FAIL ${m}`); } };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const NOW = new Date('2026-10-29T10:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10);

console.log('── tiers ──');
{
  ok(adsLibraryTierB([daysAgo(10), daysAgo(90), daysAgo(100), daysAgo(120), daysAgo(200)], NOW).ok, 'Tier B: 5 active video ads, one started in the last 60 days');
  ok(!adsLibraryTierB([daysAgo(70), daysAgo(90), daysAgo(100), daysAgo(120), daysAgo(200)], NOW).ok, '…not when none started in the last 60 days');
  ok(adsLibraryTierB([daysAgo(1), daysAgo(5), daysAgo(29)], NOW).ok, 'Tier B: 3 started in the last 30 days');
  ok(!adsLibraryTierB([daysAgo(1), daysAgo(5), daysAgo(31)], NOW).ok, '…not 2 in 30 days');
  ok(!adsLibraryTierB(Array(40).fill(daysAgo(300)), NOW).ok, 'raw ad count alone never makes Tier B');
  const base = { name: 'Glow Lab', domain: 'glowlab.com', ad_start_dates: [] as string[] };
  ok(tierFor(base, { now: NOW }).tier === 'unrated', 'no ads data and no tier from Jess → unrated, never guessed');
  ok(tierFor({ ...base, tier_override: 'A' }, { now: NOW }).tier === 'A', "Jess's tier wins");
  ok(tierFor({ ...base, name: 'Nike' }, { now: NOW }).tier === 'skip', 'mega-brand → skip');
  ok(tierFor({ ...base, name: 'Boots' }, { now: NOW }).tier === 'skip', 'retailer → skip');
  ok(tierFor({ ...base, domain: 'amazon.co.uk' }, { now: NOW }).tier === 'skip', 'marketplace domain → skip');
  ok(tierFor({ ...base, tier_override: 'A', text: 'Faith-based Christian apparel' }, { now: NOW }).tier === 'skip', 'religion-based → skip, even over her tier');
  ok(tierFor({ ...base, text: 'Learn forex trading and get rich' }, { now: NOW }).tier === 'skip', 'forex / make-money course → skip');
  ok(tierFor({ ...base, text: 'online casino bonus' }, { now: NOW }).tier === 'skip', 'gambling → skip');
  ok(tierFor({ ...base, text: 'bitcoin wallet' }, { now: NOW }).tier === 'skip', 'crypto → skip');
  ok(tierFor(base, { now: NOW, blocked: ['glowlab.com'] }).tier === 'skip', 'her blocked list (domain) → skip');
  ok(tierFor(base, { now: NOW, pitchedKeys: new Set(['n:glow lab']) }).tier === 'skip', 'already in her pitch log (by name) → skip');
  ok(tierFor({ ...base, track: 'local' }, { now: NOW }).tier === 'local' && tierFor({ ...base, track: 'local', text: 'casino' }, { now: NOW }).tier === 'skip', 'the local track is not tiered, but the hard no list still applies');
  ok(templateFamilyFor('A') === 'ad_idea_v2' && templateFamilyFor('B') === 'ad_idea_v2' && templateFamilyFor('C') === 'video_idea_v3' && templateFamilyFor('D') === 'video_idea_v3' && templateFamilyFor('unrated') === null, 'A/B → Ad idea v2, C/D → Video idea v3, unrated → none');
  const v = brandVerdict({ name: 'X', country: 'GB', admin_countries: ['Viet Nam'], page_created_at: daysAgo(30) }, NOW);
  ok(v.dropship.includes('foreign_admins') && v.dropship.includes('new_page') && v.hidden, 'dropshipping signs: new page + admins abroad → hidden');
  ok(!brandVerdict({ name: 'X', country: 'GB' }, NOW).hidden, 'unknown facts flag nothing');
  ok(!brandVerdict({ name: 'Cafe', text: 'book your time slots' }, NOW).hidden, '"time slots" is not gambling');
}

console.log('\n── contact order ──');
{
  const named = [{ name: 'Amy Lee', title: 'Partnerships Manager', email: 'amy@brand.com', email_status: 'ok', linkedin: null, phone: null }];
  const b = { emails: ['hello@brand.com', 'marketing@brand.com', 'partnerships@brand.com'], instagram_url: 'https://www.instagram.com/brand/', named_contacts: named };
  ok(contactOptions(b).map((c) => c.kind).join(',') === 'named,partnerships,marketing,generic,instagram', 'named > partnerships@ > marketing@ > generic / IG DM');
  ok(bestContact({ ...b, named_contacts: [{ ...named[0], email_status: 'catch_all' }] }).kind === 'partnerships', 'an unverified named email does not jump the queue');
  ok(bestContact({ emails: ['info@brand.com'] }).variant === 'generic_inbox', 'a generic inbox switches to the generic template');
  ok(['creators@x.com', 'collabs@x.com', 'influencers@x.com', 'press@x.com'].every((e) => emailKind(e) === 'partnerships'), 'creators@ / collabs@ / influencers@ / press@ rank with partnerships@');
  ok(bestContact({}).kind === 'none', 'no contact → none');
  ok(addBusinessDays(new Date('2026-10-30T09:00:00Z'), 5).toISOString().slice(0, 10) === '2026-11-06', '+5 business days skips the weekend (Fri → next Fri)');
  const fu = followUps({ track: 'brand', first_contacted_at: '2026-10-30T09:00:00Z', follow_ups_sent: 0, status: 'contacted' }, NOW);
  ok(fu.fu1 === '2026-11-06' && fu.fu2 === '2026-11-17' && fu.next === 'follow_up_1', 'follow-ups at +5 and +12 business days');
  ok(followUps({ track: 'local', first_contacted_at: '2026-10-30T09:00:00Z', status: 'contacted' }, NOW).next === null, 'the local track has no follow-ups');
  ok(followUps({ track: 'brand', first_contacted_at: '2026-10-30T09:00:00Z', status: 'replied' }, NOW).next === null, 'a reply ends follow-ups');
  ok(followUps({ track: 'brand', first_contacted_at: null, status: 'contacted' }, NOW).fu1 === null, 'no first contact → no made-up date');
}

console.log('\n── pitch pipeline ──');
{
  const sys: PitchSystem = { content: 'Her system: concept recipe, concept gate, hook test.', about_jess: 'British UGC creator and former lawyer. Paid Hume Health campaign. 200k views in 30 days.', templates: { ad_idea_v2: 'Template text', generic_inbox_v2: 'Generic text', ig_dm_ad_idea_v2: 'DM', cm_collab_dm_v4: 'CM' } };
  const plan: PitchPlan = { track: 'brand', template: 'ad_idea_v2', variant: 'standard' };
  const research: ResearchFields = { brand: 'Glow Lab', product: 'Barrier Serum', product_detail: 'ceramide serum', detail_url: null, pays_for_ugc_evidence: null, niche: 'beauty', website: 'https://glowlab.com', ads_summary: null, creators_seen: [], snippets: [] };
  const good: WriteOut = { concept: { name: 'Glass skin test' }, concept_gate: { pass: true }, hook_test: { chosen: 'x', pass: true }, subject: 'Glow Lab: Barrier Serum ad idea', body: `Hi team, an idea for Barrier Serum. ${'The serum goes on before the moisturiser and the video shows that moment clearly. '.repeat(6)}Portfolio: https://www.jesscousin.com/` };
  ok(pitchProblems({ subject: 's', body: 'Too short. https://www.jesscousin.com/' }, { plan, aboutJess: '', research }).some((p) => p.startsWith('too_short')), 'an email under 80 words is refused (her 80 to 140 rule)');
  ok(pitchProblems({ subject: 's', body: `${'word '.repeat(141)}https://www.jesscousin.com/` }, { plan, aboutJess: '', research }).some((p) => p.startsWith('too_long')), 'an email over 140 words is refused');
  ok(pitchProblems({ body: `${'word '.repeat(66)}` }, { plan: { track: 'brand', template: 'ig_dm_ad_idea_v2', variant: 'ig_dm' }, aboutJess: '', research }).some((p) => p.startsWith('too_long')), 'an IG DM over 65 words is refused');
  const passReview = async () => ({ concept_gate_pass: true, hook_test_pass: true, follows_template: true, problems: [] });
  const r1 = await runPitchPipeline({ write: async () => good, review: passReview }, sys, plan, research);
  ok(r1.outcome === 'drafted' && r1.attempts.length === 1, 'a clean draft that passes both passes is drafted on attempt 1');
  let n = 0;
  const r2 = await runPitchPipeline({ write: async () => (++n < 3 ? { ...good, concept_gate: { pass: false } } : good), review: passReview }, sys, plan, research);
  ok(r2.outcome === 'drafted' && r2.attempts.length === 3, 'a failed concept gate retries — drafted on attempt 3');
  let reviews = 0;
  const r3 = await runPitchPipeline({ write: async () => good, review: async () => { reviews++; return { concept_gate_pass: true, hook_test_pass: false, follows_template: true }; } }, sys, plan, research);
  ok(r3.outcome === 'needs_jess' && r3.attempts.length === MAX_PITCH_ATTEMPTS && reviews === 3, 'the independent hook test failing 3 times → Needs Jess (no draft)');
  const r4 = await runPitchPipeline({ write: async () => ({ ...good, hook_test: { chosen: 'x' } }), review: passReview }, sys, plan, research);
  ok(r4.outcome === 'needs_jess', 'an absent hook-test verdict is a fail, never a pass');
  const r5 = await runPitchPipeline({ write: async () => good, review: passReview }, { ...sys, content: '' }, plan, research);
  ok(r5.outcome === 'needs_jess' && r5.attempts.length === 0, 'no pitch system loaded → Needs Jess, no model call');
  const chk = (body: string) => pitchProblems({ subject: 's', body }, { plan, aboutJess: sys.about_jess, research });
  ok(chk('I live in Chiang Mai. https://www.jesscousin.com/').includes('mentions_thailand'), 'Thailand is refused in a brand pitch');
  ok(pitchProblems({ subject: 'x', body: "I'm based in Thailand. https://www.jesscousin.com/" }, { plan: { track: 'brand', template: 'agency_roster_v1', variant: 'standard' }, aboutJess: '', research }).includes('mentions_thailand'), '…and in an agency pitch (her line removed 27.10.26)');
  const cm = "Hi [Business]! I'm Jess, a British creator living in Chiang Mai. My Instagram content has reached over 200k views in the last 30 days.";
  ok(pitchProblems({ body: "Hi Nimman Slow Bar! I'm Jess, a British creator living in Chiang Mai. My Instagram content has reached over 200k views in the last 30 days." }, { plan: { track: 'local', template: 'cm_collab_dm_v4', variant: 'ig_dm' }, aboutJess: '', research, templateText: cm }).length === 0, 'the local track uses CM v4 as written: "living in Chiang Mai" and its reach figures pass (Paul, 2026-10-29)');
  ok(chk('My rate is £150 per video. https://www.jesscousin.com/').includes('mentions_a_rate'), 'a rate is refused');
  ok(chk('This got 3x sales. https://www.jesscousin.com/').some((p) => p.startsWith('unverified_figures')), 'a figure not in About Jess / research is refused');
  ok(!chk('My videos reached 200k views in 30 days. https://www.jesscousin.com/').some((p) => p.startsWith('unverified_figures')), 'a figure from About Jess is fine');
  ok(chk('Hi [Name]. https://www.jesscousin.com/').includes('placeholder_left'), 'a placeholder left in is refused');
  ok(chk('No link here').includes('no_portfolio_link'), 'the portfolio link is required where her template has one');
  ok(!pitchProblems({ subject: 's', body: 'No link here' }, { plan, aboutJess: '', research, signoffHtml: '<a href="https://www.jesscousin.com/">Portfolio</a>' }).includes('no_portfolio_link'), '…satisfied by her formatted sign-off');
  ok(unverifiedFigures('a 60k video', 'one video 60k+').length === 0, 'figure matching is literal against her own words');
  ok(chooseTemplate({ track: 'brand', tierFamily: 'ad_idea_v2', variant: 'generic_inbox' }) === 'generic_inbox_v2' && chooseTemplate({ track: 'brand', tierFamily: 'video_idea_v3', variant: 'ig_dm' }) === 'ig_dm_ad_idea_v2' && chooseTemplate({ track: 'local', tierFamily: null, variant: 'standard' }) === 'cm_collab_dm_v4', 'template by route and track');
  ok(WHATSAPP_ASK_DRAFT === "Hi [Brand] team! I'm Jess, a British UGC creator (and former lawyer). I have a paid UGC ad idea for [Product]. Who's the best person to send it to? Happy to email it over.", 'the WhatsApp draft is exactly as Paul wrote it');
  ok(!/thailand/i.test(fillWhatsAppAsk(WHATSAPP_ASK_DRAFT, 'Glow Lab', 'Barrier Serum')) && fillWhatsAppAsk(WHATSAPP_ASK_DRAFT, 'Glow Lab', null).includes('ad idea for Glow Lab'), 'WhatsApp draft fills brand/product, never mentions Thailand');
  const g = gmailComposeUrl({ to: 'amy@brand.com', subject: 'Glow Lab: idea', from: 'jess@gmail.com' });
  ok(g.includes('to=amy%40brand.com') && g.includes('su=Glow+Lab') && !g.includes('body='), 'Gmail compose: To and Subject only (body is pasted, formatting kept)');
  const c = copyEmailPayload('Hi\n\nSee https://www.jesscousin.com/', '<p>Jess<br><a href="https://www.jesscousin.com/" onclick="x()">Portfolio</a><script>bad()</script></p>');
  ok(c.html.includes('<a href="https://www.jesscousin.com/">') && !c.html.includes('onclick') && !c.html.includes('script'), 'Copy email keeps live links, drops scripts and handlers');
  ok(safeSignoffHtml('<a href="javascript:alert(1)">x</a>') === '<a>x</a>', 'a javascript: link is dropped');
  ok(whatsappChatUrl('447700900123', 'hi') === 'https://wa.me/447700900123?text=hi' && whatsappChatUrl('123', 'hi') === null, 'wa.me link from stored digits');
}

console.log('\n── actor inputs / outputs ──');
{
  const ad = fromFbAd({ pageName: 'Glow Lab', pageID: '1', startDate: Math.floor(Date.parse(daysAgo(3)) / 1000), snapshot: { linkUrl: 'https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.glowlab.com%2Fshop', body: { text: 'Barrier serum' } } }, 'beauty', 'GB');
  ok(ad?.domain === 'glowlab.com' && ad?.ad_start_dates[0] === daysAgo(3), "an ad's link is unwrapped to the brand's domain; its start date is kept");
  const merged = candidatesFrom('fb_ads', [{ pageName: 'Glow Lab', pageID: '1', snapshot: { linkUrl: 'https://glowlab.com' } }, { pageName: 'Glow Lab', pageID: '1', snapshot: { linkUrl: 'https://glowlab.com/x' } }], { niche: 'beauty', country: 'GB' });
  ok(merged.length === 1 && merged[0].live_ads_count === 2, 'two ads from one brand merge into one row');
  ok(brandWebsite('https://www.instagram.com/x') === null && brandWebsite('https://linktr.ee/x') === null, 'a platform / link page is never a brand website');
  ok(waDigits('https://wa.me/447700900123') === '447700900123' && waDigits('+66 81 234 5678') === '66812345678' && waDigits('081 234 5678') === null, 'WhatsApp digits only with a country code');
  const ci = fromContactItem({ originalStartUrl: 'https://glowlab.com', domain: 'glowlab.com', emails: ['hello@glowlab.com', 'x@sentry.io'], whatsapps: ['https://wa.me/447700900123'], scrapedUrls: ['https://glowlab.com/about'],
    leadsEnrichment: [{ fullName: 'Amy Lee', jobTitle: 'Partnerships Manager', email: 'amy@glowlab.com', emailVerification: { result: 'ok' } }, { fullName: 'Bob', jobTitle: 'CFO', email: 'bob@glowlab.com' }] });
  ok(ci?.wa_numbers[0]?.source === 'website_button' && ci?.hasAboutPage && ci?.emails.length === 1, 'website chat button tagged; junk emails dropped');
  ok(ci?.named.length === 1 && ci?.named[0].name === 'Amy Lee', 'named contacts kept only for marketing / partnerships roles (CFO dropped)');
  ok(primaryNamedContact(namedContactsFrom([{ fullName: 'A', jobTitle: 'Brand Manager', email: 'a@x.com', emailVerification: { result: 'unknown' } }])) === null, 'Open in Gmail uses a named person only with a verified email');
  const ci2 = contactsInput(['https://a.com'], true) as Record<string, unknown>;
  ok(ci2.maximumLeadsEnrichmentRecords === ENRICH_LEADS_PER_BRAND && ci2.verifyLeadsEnrichmentEmails === true && ci2.maxRequestsPerStartUrl === 3, 'named contacts: enrichment on, emails verified, max 3 pages per site');
}

console.log('\n── pitch log ──');
{
  ok(parseSheetDate('23.09.26') === '2026-09-23' && parseSheetDate('2026-10-16') === '2026-10-16' && parseSheetDate('45900') === '2025-08-31', 'her date formats');
  const rows = rowsFromWorkbook({
    'Previously Pitched': [['#', 'Brand', 'Channel used', 'Date sent', 'Status', 'Outcome'], ['1', 'Glow Lab', 'Email', '2026-10-01', 'Sent', '']],
    'Brands & Contacts': [['Brand', 'Status', 'Instagram'], ['Ready Co', 'Ready', ''], ['Sent Co', 'Pitched', '@sentco']],
    'Creator Watchlist': [['Brand', 'First pitched', 'Re-pitch OK from (est.)'], ['Old Co', '2026-01-01', '2026-06-01']],
  });
  ok(rows.some((r) => r.brand_name === 'Glow Lab') && rows.some((r) => r.brand_name === 'Sent Co') && !rows.some((r) => r.brand_name === 'Ready Co'), 'only brands she actually contacted are logged');
  const keys = pitchedKeySet(rows, NOW);
  ok(keys.has('n:glow lab') && !keys.has('n:old co'), 'a re-pitch date in the past frees the brand');
  ok(rowsFromCsv('Brand,Website\n"Acme, Inc",acme.com\n').some((r) => r.domain === 'acme.com'), 'CSV import (quoted commas)');
}

console.log('\n── importing her pitch-system.md ──');
{
  /* A made-up export in HER format: numbered plain-text headings, numbered rule lists inside sections. */
  const md = [
    'Sample Pitch System Export', '1. Instructions', '1d. Hard rules', '• Blocked: Acme (commission-only), Beta Co (already pitched). Hard no: gambling.',
    '2. Inputs per brand', 'Fields.', '3. Research', '3a. Research steps', '1. Previously pitched check. Not in the log.', '2. Legitimacy. Drop dropship stores.',
    '3c. The concept gate (every concept, before drafting)', '3. Five questions, all must be yes:', 'Sells: yes.',
    '4. Pitch rules', '4b. Structure of the email, in order', '1. Greeting. "Hi [Brand] team,"', '4c. Ad wording vs video wording', 'Tier A/B get ad framing.',
    '5. Channels', '5a. Email subject lines', '• Tier A/B: [Brand]: [Product] ad idea',
    '5b. Generic inbox vs named person vs partnerships inbox', '• Generic = hello@.',
    '5c. Instagram DM (word for word template)', '"Hi [Brand] team! DM text."',
    '5d. Email follow-ups', '• Follow-up 1 (+5 business days): FU1 shape.', '• Follow-up 2 (+12 business days): FU2 words.', '• Same channel as the original.',
    '5f. Agency pitch ("Agency roster v1")', '• Subject: [Agency]: UGC creator for your client briefs',
    '5h. Chiang Mai local collabs (separate track, Instagram DM)', '"Hi [Business]! I\'m Sam, living in Chiang Mai."',
    '6. About me', '6a. Identity', '• Sample creator. Former lawyer.', '6c. Rates', '£999 per video', '6d. Personal facts', '• Rides a bike.',
    '7. Examples', 'Example text.', '8. Output', '8a. Email: a Gmail draft', 'View my portfolio   ← linked to https://example.com/portfolio', '', 'Many thanks,', 'Sam',
    '@SampleHandle   ← linked to https://example.com/links', '• No attachments.', '8b. Instagram DM, X or LinkedIn: written in the chat', 'Headed with the platform.',
  ].join('\n');
  const r = parsePitchSystem(md);
  ok(r.content.startsWith('Sample Pitch System Export') && r.content.includes('Previously pitched check'), 'the whole export becomes her system text');
  ok(r.placed.every((p) => !/^\d\. (Previously|Legitimacy|Greeting)|Five questions/.test(p.heading)), 'her numbered rule lists are never read as headings');
  ok(r.about_jess.includes('Former lawyer') && r.about_jess.includes('Rides a bike') && !r.about_jess.includes('£999'), 'About me → About Jess, its Rates sub-section kept out');
  ok(r.rates.includes('£999') && !Object.values(r.templates).some((t) => t?.includes('£999')), 'rates kept apart, never in a template');
  ok(!!r.templates.ad_idea_v2?.includes('Greeting') && r.templates.ad_idea_v2.includes('ad idea') && !!r.templates.video_idea_v3?.includes('video wording'), 'email templates carry her structure, subjects and tier wording');
  ok(!!r.templates.generic_inbox_v2?.includes('Generic = hello@'), 'Generic inbox rules');
  ok(r.templates.ig_dm_ad_idea_v2?.includes('DM text') === true && !r.templates.ig_dm_ad_idea_v2.includes('Headed with the platform'), 'IG DM template, not the output rule for DMs');
  ok(r.templates.follow_up_1?.includes('FU1 shape') === true && !r.templates.follow_up_1.includes('FU2') && r.templates.follow_up_2?.includes('FU2 words') === true, 'follow-ups split into 1 and 2');
  ok(r.templates.cm_collab_dm_v4?.includes('living in Chiang Mai') === true, 'CM collab DM v4 taken as written');
  ok(r.blocked_list.join() === 'Acme,Beta Co', 'blocked brands from her "Blocked:" rule');
  ok(r.signoff_html === '<a href="https://example.com/portfolio">View my portfolio</a><br><br>Many thanks,<br>Sam<br><a href="https://example.com/links">@SampleHandle</a>', 'her sign-off rebuilt with live links');
  ok(r.missing.length === 0, 'every template found');
  ok(parsePitchSystem('# Title\n## About Jess\nFacts.\n## Rates\n£1').about_jess === 'Facts.', 'markdown headings still read');
}

console.log('\n── money ──');
{
  ok(clampCap(10_000) === UGC_MAX_ITEM_CAP && clampCap('x') > 0, 'the item cap is clamped server-side');
  ok(estimateRunUsd('fb_ads', 50) > 0 && estimateRunUsd('named_contacts', 1, { sites: 50 }) > estimateRunUsd('contacts', 1, { sites: 50 }), 'named contacts show their extra cost over a plain contacts run');
  ok(ugcSpendRefusal({ estUsd: 1, spentThisMonthUsd: 0, budgetUsd: 15, apifyPct: null }) === 'apify_usage_unknown', 'no Apify reading → refused (fail closed)');
  ok(ugcSpendRefusal({ estUsd: 1, spentThisMonthUsd: 0, budgetUsd: 15, apifyPct: UGC_APIFY_STOP_PCT }) === 'apify_account_near_cap', 'shared Apify account near its cap → refused');
  ok(ugcSpendRefusal({ estUsd: 5, spentThisMonthUsd: 12, budgetUsd: 15, apifyPct: 0.2 }) === 'over_monthly_budget', 'over her own budget → refused');
  ok(ugcSpendRefusal({ estUsd: 1, spentThisMonthUsd: 0, budgetUsd: 15, apifyPct: 0.2 }) === null, 'within everything → allowed');
}

console.log('\n── separation and access ──');
{
  const MIG = read('supabase/migrations/20261129090000_ugc_brand_finder.sql');
  for (const t of ['ugc_members', 'ugc_settings', 'ugc_brands', 'ugc_brand_events', 'ugc_runs', 'ugc_pitch_system', 'ugc_pitch_log']) {
    ok(new RegExp(`alter table public\\.${t} enable row level security`).test(MIG), `${t}: RLS on`);
  }
  const ps = MIG.slice(MIG.indexOf('create policy ugc_pitch_system_owner'), MIG.indexOf(';', MIG.indexOf('create policy ugc_pitch_system_owner')));
  ok(/owner_user_id = \(select auth\.uid\(\)\) and \(select public\.is_ugc_member\(\)\)/.test(ps) && !/my_role|ugc_can_access/.test(ps), 'her pitch system: owner-only, NOT the admin');
  const pl = MIG.slice(MIG.indexOf('create policy ugc_pitch_log_owner'), MIG.indexOf(';', MIG.indexOf('create policy ugc_pitch_log_owner')));
  ok(!/my_role|ugc_can_access/.test(pl), 'her pitch log: owner-only, NOT the admin');
  ok(!/create policy[^;]*on public\.ugc_runs for (insert|update|all)/.test(MIG) && !/create policy[^;]*on public\.ugc_members for (insert|update|all)/.test(MIG), 'runs and membership: no browser write policy');
  ok(/raise exception 'ugc_other_channel_active'/.test(MIG) && /b\.active_channel is not null and b\.active_channel <> _via/.test(MIG), 'one active channel per brand: refused in SQL (trigger + log function)');
  ok(/if b\.track = 'brand' and b\.first_contacted_at is null\s+and \(b\.checked_sent_mail_at is null or b\.checked_linkedin_at is null\) then\s+return jsonb_build_object\('ok', false, 'error', 'jess_checks_missing'\)/.test(MIG),
    "a paid brand's first contact is refused in SQL until Jess ticks both manual checks (sent mail 180 days, LinkedIn)");
  const SHEET = read('src/components/ugc/UgcBrandSheet.tsx');
  ok(/blockedByChecks/.test(SHEET) && (SHEET.match(/\|\| blockedByChecks\}/g) ?? []).length === 3, 'the sheet disables all three send buttons until both boxes are ticked');
  ok(/ugc_webhook_admin_only/.test(MIG) && /whatsapp_api_enabled/.test(MIG.slice(MIG.indexOf('ugc_settings_guard'))), 'the webhook slot, WhatsApp API switch and budget are the admin\'s only');
  ok(/whatsapp_api_enabled\s+boolean not null default false/.test(MIG) && /whatsapp_daily_cap\s+integer not null default 25 check \(whatsapp_daily_cap between 25 and 100\)/.test(MIG), 'WhatsApp API sending: off by default, cap 25–100');
  ok(!/user_roles/.test(MIG.replace(/--.*$/gm, '')) || !/insert into public\.user_roles|update public\.user_roles/.test(MIG), 'the migration never writes user_roles');
  ok(!/outreach_leads|campaigns|api_usage_log|whatsapp_messages|sms_/.test(MIG.replace(/--.*$/gm, '')), 'the migration touches no Findable table');

  const FN = read('supabase/functions/ugc-brands/index.ts');
  ok(/resolveUgcCaller\(req, service\)/.test(FN), 'ugc-brands admits only a UGC member or the admin');
  ok((FN.match(/allStopRefusal\(service, corsHeaders\)/g) ?? []).length >= 4, "every paid action honours Paul's emergency stop");
  ok(!/send-whatsapp|graph\.facebook\.com|twilio|resend|sendgrid|smtp/i.test(FN), 'ugc-brands sends nothing (no WhatsApp, SMS or email sender)');
  ok(!/user_roles['"]\)\.(insert|upsert|update)|team_members/.test(FN), 'ugc-brands never writes a team role');
  ok(/maxTotalChargeUsd/.test(FN) && /maxItems/.test(FN), 'Apify itself is told the ceiling (maxTotalChargeUsd + maxItems)');
  ok(/pitch_system_private/.test(FN) && !/select\("[^"]*rates/.test(FN), 'pitches: member only; rates never selected for the writer');
  ok(/\[functions\.ugc-brands\]\nverify_jwt = true/.test(read('supabase/config.toml')), 'config.toml: ugc-brands verify_jwt = true');
  ok(/docs\/ugc\/jess-pitch-system\//.test(read('.gitignore')), "Jess's folder is gitignored");
  const tracked = execSync('git ls-files docs/ugc', { cwd: new URL('..', import.meta.url) }).toString().trim();
  ok(!/jess-pitch-system/.test(tracked), 'none of her files are tracked by git');
  ok(!/'\/ugc'/.test(read('src/lib/access.ts')), 'sales can never open /ugc (not in SALES_ROUTE_PATTERNS)');

  const store: string[] = [];
  const r = await createUgcMember({
    createAuthUser: async () => ({ id: 'u1', error: null }),
    deleteAuthUser: async () => { store.push('deleted'); },
    writeMember: async (id) => { store.push(`member:${id}`); return null; },
  }, 'admin1', { name: 'Jess', email: 'jess@example.com', password: 'Abcdefgh1234xyz' });
  ok(r.ok && store.join() === 'member:u1', 'create login: a ugc_members row only');
  const r2 = await createUgcMember({ createAuthUser: async () => ({ id: 'u2', error: null }), deleteAuthUser: async () => { store.push('deleted'); }, writeMember: async () => 'boom' }, 'a', { name: 'J', email: 'j@example.com', password: 'Abcdefgh1234xyz' });
  ok(!r2.ok && store.includes('deleted'), 'create login: all-or-nothing (account removed if the member row fails)');
  ok(!JSON.stringify(r2).includes('Abcdefgh1234xyz'), 'the password never appears in a result');
}

console.log(f ? `\n${f} FAILED` : '\nall passed');
if (f) process.exit(1);
