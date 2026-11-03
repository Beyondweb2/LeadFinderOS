/* THE SIMPLE PROSPECT POPUP (Paul, 2026-11-03): three tabs, the two short scripts, one issue list with no repeats, the offer, and the
   website check that starts when a website is added. Run: npx tsx scripts/simple-call-screen.test.ts */
import { readFileSync } from 'node:fs';
import { buildSimpleScript, contactFirstNameOf, dedupeIssues, foundIssues, greetingLine, offerLines, simpleScriptSpoken, FOUND_ISSUES_SHOWN, OFFER_UNDER_LINE, SAY_IT_LINE } from '../src/lib/simpleCallScript.ts';
import { websiteWasAdded } from '../src/lib/newWebsiteCheck.ts';
import type { WebsiteIssue } from '../src/lib/websiteCheck.ts';

let f = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? '  PASS' : '  FAIL'} ${m}`); if (!c) f++; };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const issue = (id: string, title: string): WebsiteIssue => ({ id, severity: 'medium', title, saw: 'saw ' + title, meaning: '', count: 0, pages: [] });

const base = { contactFirstName: 'Dave', businessName: 'Smith Plumbing', searchFor: 'a plumber in Rugby', competitors: ['A Ltd', 'B Ltd', 'C Ltd', 'D Ltd'] };
const site = buildSimpleScript({ ...base, hasWebsite: true });
const none = buildSimpleScript({ ...base, hasWebsite: false });
const said = (l: ReturnType<typeof buildSimpleScript>) => simpleScriptSpoken(l);

console.log('── the scripts ──');
ok(said(site).startsWith('Hi, is this Dave?\nHi mate, I was looking for a plumber in Rugby, so I asked AI and it recommended A Ltd, B Ltd and C Ltd.'), 'WEBSITE: greeting, then the search with the first three rivals only');
ok(greetingLine({ contactFirstName: null, businessName: 'Smith Plumbing' }) === 'Hi, is that Smith Plumbing?', 'no contact name → "Hi, is that [business name]?"');
ok(contactFirstNameOf('dave smith') === 'dave' && contactFirstNameOf('  ') === null && contactFirstNameOf('J.R.') === null, 'a contact name is its first word, only when it is a plain name');
ok(/I found a few issues with the way your website is set up, which I think are the reasons why AI doesn't name you\./.test(said(site)) && /Do you look after the website yourself, or does someone do it for you\?$/.test(said(site)), 'WEBSITE: the issues line and the closing question');
ok(site.some((l) => l.kind === 'prompt' && l.text === '[read 2 or 3 issues]') && site.some((l) => l.kind === 'prompt' && l.text === '[let them talk]'), 'WEBSITE: [read 2 or 3 issues] and [let them talk] are grey prompts, not said');
ok(!said(site).includes('[') && !said(none).includes('[') && !/Pick one|If no|If yes/.test(said(site) + said(none)), 'a [ ] note, "Pick one", "If no" and "If yes" are never in the spoken text');
ok(/Have you got a website at the moment\?/.test(said(none)) && /Ah, that'll be why then\./.test(said(none)) && /Oh right, what's the address\?/.test(said(none)) && /How do most of your jobs come in at the moment\?$/.test(said(none)), 'NO WEBSITE: the question, If no, If yes and the closing question');
const yes = none.find((l) => l.kind === 'branch' && l.label === 'If yes');
ok(!!yes && yes.kind === 'branch' && yes.addWebsite === true && yes.note === '[add it to the lead, then carry on]', 'NO WEBSITE: "If yes" carries the add-the-address box and its grey note');
ok(none.some((l) => l.kind === 'branch' && l.label === 'If no') && !site.some((l) => l.kind === 'branch'), 'the branches exist only in the NO WEBSITE script');
for (const [what, s] of [['WEBSITE', site], ['NO WEBSITE', none]] as const) {
  const stat = s.find((l) => l.kind === 'stat');
  ok(!!stat && stat.kind === 'stat' && stat.text === '45% of people have now used AI to find a local business, and a year ago it was 6%.' && stat.source === 'Source: BrightLocal 2026 survey.', `${what}: the 45% line with its source note`);
  const pick = s.find((l) => l.kind === 'pick');
  ok(!!pick && pick.kind === 'pick' && pick.options.length === 3, `${what}: Pick one — three questions`);
}
ok(!/More people are using AI|crawl|may make it harder|You've been in touch/i.test(said(site) + said(none)), 'nothing else from the old script: no bridge paragraph, no crawl text, no "been in touch" note');
const noRivals = buildSimpleScript({ ...base, hasWebsite: true, competitors: [] });
ok(!/and it recommended/.test(simpleScriptSpoken(noRivals)) && noRivals.some((l) => l.kind === 'prompt' && /No rival names/.test(l.text)), 'no rival names on file → no invented firm; the rep is told');

console.log('── What we found ──');
const dup = [issue('a', 'The sitemap points at a different website'), issue('b', 'the sitemap points at a different  website'), issue('c', 'Service pages are thin'), issue('d', 'No town on the homepage'), issue('e', 'A page names another site')];
ok(dedupeIssues(dup).length === 4 && dedupeIssues(dup)[0].id === 'a', 'the same issue twice shows once (case and spacing blind), first kept');
const fi = foundIssues(dup);
ok(FOUND_ISSUES_SHOWN === 3 && fi.shown.length === 3 && fi.all.length === 4 && fi.hidden === 1, 'the top 3, with the rest behind Show all');
ok(SAY_IT_LINE === "Say it may make it harder. Never say it's the reason.", 'the one reminder line');

console.log('── What we offer ──');
const offer = offerLines();
ok(offer.length === 9 && offer[0].startsWith('Money-back guarantee') && offer[1] === '£99 up front, then £99 a month' && offer[8] === 'We host the site. They own it after the final payment.', 'nine lines, the price read from the plan constants');
ok(OFFER_UNDER_LINE === 'Price an issue? Offer Essential in Quick Close.', 'the Essential line under it');

console.log('── a website added to a lead that had none ──');
ok(websiteWasAdded(null, 'smith.co.uk') && websiteWasAdded('', 'https://smith.co.uk') && websiteWasAdded('  ', 'smith.co.uk'), 'blank → a site is an add');
ok(!websiteWasAdded('smith.co.uk', 'smith2.co.uk') && !websiteWasAdded('smith.co.uk', null) && !websiteWasAdded(null, ''), 'a change of site, a removal and a still-blank lead are not adds');
ok(!websiteWasAdded(null, 'https://www.facebook.com/smithplumbing'), 'a social / directory page is not a website of their own');

console.log('── the popup ──');
const dlg = read('src/components/LeadDetailDialog.tsx');
const tab = read('src/components/SimpleCallTab.tsx');
ok(/<TabsTrigger value="call"[^>]*>Call<\/TabsTrigger>\s*<TabsTrigger value="close"[^>]*>Close<\/TabsTrigger>\s*<TabsTrigger value="history"[^>]*>History<\/TabsTrigger>/.test(dlg) && !/<TabsTrigger value="details"/.test(dlg), 'tabs: Call, Close, History — no Details');
ok(/\{showClientTab && <TabsTrigger value="client"/.test(dlg) && /const showClientTab = permsForTab\.clientDelivery && isPaidLead\(lead\);/.test(dlg), 'Client appears only once they have paid (and only for the admin)');
ok(dlg.includes("if (t === 'prospect' || t === 'details') return 'history';"), 'an old link to Details opens History, where its content now sits');
ok(/useCheckNewWebsite\(isDemoLead\(lead\.id\) \? '' : lead\.id, lead\.website\)/.test(dlg), 'the popup watches the website: blank → a site starts the existing check');
ok(/startFullLeadCrawl\(leadId, 'lead_detail'\)/.test(read('src/hooks/useCheckNewWebsite.ts')) && !/fetch\(|new Worker|crawlSite/.test(read('src/hooks/useCheckNewWebsite.ts')), 'it starts the app\'s own website check — no new crawler');
ok(/checkNewWebsite\(qc, leadId, w\)/.test(tab) && /useAddWebsite\(leadId\)/.test(tab), 'the "what\'s the address?" box saves through the profile write, then starts that check');
ok(/data-testid="touched-before-tag"/.test(tab) && /<TouchedBeforeTag leadId=\{lead\.id\} \/>/.test(dlg) && !/been in touch/i.test(simpleScriptSpoken(none)), '"in touch before" is a small tag by the name, not script text');
ok(tab.indexOf('<WhatWeFound') < tab.indexOf('<Script p=') && tab.indexOf('<Script p=') < tab.indexOf('<Offer />') && tab.indexOf('<Offer />') < tab.indexOf('<Objections') && tab.indexOf('<Objections') < tab.indexOf('<LogCallBar'), 'order: What we found → script → offer → objections → sticky Log / Quick Close');
ok(/<Objections p=\{q\.data\} startOpen=\{false\} \/>/.test(tab), 'objections start collapsed');
ok(/const kind = useRef<ScriptKind \| null>\(null\);/.test(tab) && /kind\.current === null && q\.data/.test(tab), 'the script is chosen once, so adding the website mid-call does not swap it');
ok(/VoiceNoteScriptBody/.test(tab) && /Voice note/.test(tab), 'the Voice note toggle is kept');
ok(/<LeadHookPanel leadId=\{leadId\} variant="call" \/>/.test(tab) && /open=\{noResult\}/.test(tab), 'run / re-run and the full audit stay, folded (open when there is no result)');
ok(/<CallPanel leadId=\{lead\.id\}/.test(dlg) && /onClick=\{logThisCall\}[^>]*data-testid="workspace-log"/.test(dlg) && /data-testid="workspace-call"/.test(dlg) && /<HeaderNextAction/.test(dlg) && /<LeadHistoryPanel/.test(dlg), 'kept: call button, Log call, next action, history');

if (f) { console.log(`\n${f} FAILURE(S)`); process.exit(1); }
console.log('\nALL PASS');
