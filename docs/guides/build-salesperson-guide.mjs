// Builds docs/guides/salesperson-guide.html and (with --pdf) the PDF, using headless Edge.
//   node docs/guides/build-salesperson-guide.mjs --pdf
// The screenshots in docs/guides/shots were taken from the real app with made-up demo data
// (no real prospects, no real phone numbers, nothing sent). To retake them, see the notes at the end of the file.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/* one screenshot, cropped: shot(file, nativeW, nativeH, [x, y, w, h], opts) */
const shot = (file, nw, nh, [x, y, w, h], { width = '100%', cap = '' } = {}) => `
  <figure class="fig" style="width:${width}">
    <div class="shot" style="aspect-ratio:${w}/${h}">
      <img src="shots/${file}.png" style="width:${(nw / w) * 100}%;left:${(-x / w) * 100}%;top:${(-y / h) * 100}%" alt="">
    </div>${cap ? `<figcaption>${cap}</figcaption>` : ''}
  </figure>`;

const step = (n, title, why, body) => `
<section class="page step">
  <header class="sh"><span class="num">${n}</span><div><h2>${title}</h2><p class="why">${why}</p></div></header>
  ${body}
  <footer class="pf"><span>Findable<i>.</i> · How to use LeadFinder</span></footer>
</section>`;

const list = (items) => `<ol class="do">${items.map((i) => `<li>${i}</li>`).join('')}</ol>`;
const tip = (t, kind = 'tip') => `<p class="${kind}"><b>${kind === 'warn' ? 'Careful' : 'Good to know'}</b> ${t}</p>`;

const CSS = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font: 13.2px/1.5 system-ui, 'Segoe UI', Roboto, Arial, sans-serif; color: #14151a; background: #fff; }
.page { width: 210mm; height: 297mm; padding: 16mm 15mm 14mm; page-break-after: always; position: relative; overflow: hidden; }
.cover { background: #0A0A0C; color: #F7F7F5; padding: 0; display: flex; flex-direction: column; justify-content: space-between; }
.cover .top { padding: 20mm 18mm 0; }
.brand { font-weight: 900; font-size: 26px; letter-spacing: -.02em; }
.brand i { color: #F5B301; font-style: normal; }
.cover h1 { font-size: 46px; line-height: 1.05; letter-spacing: -.025em; margin: 38mm 0 8mm; font-weight: 900; }
.cover h1 span { color: #F5B301; }
.cover p.lead { font-size: 17px; color: #C9CCD4; max-width: 140mm; margin: 0; }
.cover .bottom { padding: 0 18mm 18mm; color: #8C909A; font-size: 12px; }
.cover .bar { height: 6px; background: #F5B301; }
h2 { font-size: 23px; line-height: 1.15; margin: 0; letter-spacing: -.015em; }
.sh { display: flex; gap: 12px; align-items: flex-start; border-bottom: 2px solid #0A0A0C; padding-bottom: 9px; margin-bottom: 11px; }
.num { flex: 0 0 auto; width: 38px; height: 38px; border-radius: 50%; background: #F5B301; color: #0A0A0C; font-weight: 900; font-size: 19px; display: grid; place-items: center; }
.why { margin: 3px 0 0; color: #50535c; font-size: 13.5px; }
ol.do { margin: 0 0 10px; padding: 0; list-style: none; counter-reset: s; }
ol.do li { counter-increment: s; position: relative; padding: 2px 0 2px 26px; margin: 0 0 3px; }
ol.do li::before { content: counter(s); position: absolute; left: 0; top: 3px; width: 18px; height: 18px; border-radius: 50%; background: #0A0A0C; color: #F5B301; font-weight: 800; font-size: 11px; display: grid; place-items: center; }
.tip, .warn { margin: 8px 0; padding: 8px 11px; border-radius: 8px; font-size: 12.6px; }
.tip { background: #FFF6DB; border-left: 4px solid #F5B301; }
.warn { background: #FDECEC; border-left: 4px solid #D64545; }
.tip > b:first-child, .warn > b:first-child { display: block; font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 1px; }
.fig { margin: 8px 0 6px; }
.shot { position: relative; overflow: hidden; border: 1px solid #1d2030; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,.18); background: #0b0d14; }
.shot img { position: absolute; display: block; }
figcaption { font-size: 11.2px; color: #666a74; margin-top: 3px; }
.row { display: flex; gap: 12px; align-items: flex-start; }
.row > * { min-width: 0; }
.pf { position: absolute; left: 15mm; right: 15mm; bottom: 8mm; font-size: 10px; color: #8a8e98; border-top: 1px solid #e5e6ea; padding-top: 4px; }
.pf i { color: #F5B301; font-style: normal; font-weight: 900; }
table.sec { width: 100%; border-collapse: collapse; font-size: 12.3px; margin: 4px 0 8px; }
table.sec td { border-top: 1px solid #e3e4e8; padding: 5px 6px; vertical-align: top; }
table.sec td:first-child { width: 31mm; font-weight: 800; white-space: nowrap; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.kicker { font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: #8a6a00; font-weight: 800; margin: 10px 0 3px; }
.cheat h2 { font-size: 27px; }
.cheat ol { margin: 6px 0; padding: 0; list-style: none; counter-reset: c; }
.cheat li { counter-increment: c; display: flex; gap: 12px; align-items: flex-start; padding: 9px 12px; margin: 0 0 7px; border: 1.5px solid #14151a; border-radius: 10px; font-size: 14px; }
.cheat li::before { content: counter(c); flex: 0 0 auto; width: 27px; height: 27px; border-radius: 50%; background: #F5B301; font-weight: 900; display: grid; place-items: center; }
.cheat li b { display: block; }
.cheat li span { color: #50535c; font-size: 12.5px; }
`;

const D = 1440; // desktop shot width

const pages = [];

/* ── cover ── */
pages.push(`
<section class="page cover">
  <div class="top"><div class="brand">Findable<i>.</i></div>
    <h1>How to use<br><span>LeadFinder</span></h1>
    <p class="lead">A step-by-step guide for salespeople. Find businesses, reach out, call them and close the sale: one screen at a time.</p>
  </div>
  <div><div class="bottom">Every screenshot in this guide is from the real app, with made-up businesses and phone numbers.<br>Version of the app described: November 2026.</div><div class="bar"></div></div>
</section>`);

/* ── the map ── */
pages.push(`
<section class="page step">
  <header class="sh"><span class="num">0</span><div><h2>Before you start</h2><p class="why">Sign in, and learn the five places you will use.</p></div></header>
  ${list([
    'Open <b>app.leadfinderos.com</b> in Chrome or on your phone, and sign in with the email and password you were given. The first time, you will be asked to choose your own password.',
    'Your menu on the left has everything you need. On a phone it is the bar along the bottom.',
  ])}
  <table class="sec">
    <tr><td>Sales dashboard</td><td>Your landing page. A quick view of where you are today.</td></tr>
    <tr><td>Outreach</td><td>Your own list of businesses. This is where you work every day.</td></tr>
    <tr><td>Inbox</td><td>WhatsApp and text conversations with the businesses that have replied.</td></tr>
    <tr><td>Find Leads</td><td>Search for new businesses and add them to your list.</td></tr>
    <tr><td>Coverage</td><td>Under <b>More</b>. Shows which towns you have already searched for each trade.</td></tr>
  </table>
  ${tip('You only ever see your own businesses. Nobody else can see yours, and you cannot see theirs. Money and commission are not shown to salespeople.')}
  <div class="kicker">The whole job in one picture</div>
  <table class="sec">
    <tr><td>1 · 2 · 3</td><td>Set up a campaign, choose towns on Coverage, find and add businesses.</td></tr>
    <tr><td>4 · 5</td><td>On Outreach, reach them: <b>A)</b> message first on WhatsApp, or <b>B)</b> check them and call.</td></tr>
    <tr><td>6</td><td>On the call, use the prospect page: it tells you what to say.</td></tr>
    <tr><td>7</td><td>If they say yes, send them the sign-up link. They sign and pay on their own phone.</td></tr>
  </table>
  ${tip('Never message or call anyone who has said stop or not interested. The app blocks it for you, so if it says no, accept it.', 'warn')}
  <footer class="pf"><span>Findable<i>.</i> · How to use LeadFinder</span></footer>
</section>`);

/* ── 1 campaign ── */
pages.push(step(1, 'Make a campaign for each niche', 'A campaign keeps one trade together, for example Plumbers. You only do this once per niche.',
  list([
    'Open <b>Campaigns</b> (the button at the top right of Find Leads and Outreach) and press <b>New campaign</b>.',
    'Type the <b>niche</b>, for example <i>Plumbers</i>.',
    'Choose how you will contact them: <b>WhatsApp</b> (you can send the approved opening message) or <b>Call</b> (you ring them, nothing is sent).',
    'Add a town if you like. The name fills itself in. Press <b>Create campaign</b>.',
  ]) + shot('s1-campaigns', D, 900, [256, 30, 1184, 330], { cap: 'Campaigns page, before you have any.' }) +
  `<div style="display:flex;justify-content:center">${shot('s1-campaign-dialog', D, 900, [380, 170, 760, 560], { width: '82%', cap: 'Fill in the box, then Create campaign.' })}</div>` +
  tip('Every business you add later goes into the campaign you have selected, so make the campaign first.')));

/* ── 2 coverage ── */
pages.push(step(2, 'Coverage: choose your towns', 'Coverage lists the towns for a trade and shows how far you have got in each.',
  list([
    'Open <b>Coverage</b> (under <b>More</b>). Choose the <b>Trade</b> at the top, for example Plumbers.',
    'The towns are listed biggest first. Tick the towns you want to search. Start at the top: bigger towns have more businesses.',
    'A bar appears: <b>Find leads in these 3 towns</b>. Press it.',
  ]) + shot('s2-coverage', D, 900, [256, 130, 1184, 640], { cap: 'Pick the trade, tick the towns, press Find leads.' }) +
  tip('Towns you have already worked show how many businesses you found and contacted, so you do not repeat yourself. You can search up to 10 towns at a time. For one town only, the Find leads button on its own row does the search straight away.')));

/* ── 3 find leads ── */
pages.push(step(3, 'Find Leads: add the businesses', 'This is where you search and choose who goes onto your list.',
  list([
    'Find Leads opens with your trade and towns filled in. Check <b>Adding to</b> at the top right shows the right campaign.',
    'Press <b>Find leads</b>. When you come from several towns the search starts only when you press this button. It can take 20 to 30 seconds.',
    'The businesses appear. <b>No Website</b> (green) are your hottest leads.',
  ]) + shot('s3-findleads-form', D, 1000, [256, 0, 1184, 660], { cap: 'Check the campaign, then press Find leads.' }) +
  tip('You can also search by hand: choose <b>One town</b>, type a business type and a town, and press Find Leads.')));

pages.push(step(3, 'Find Leads: choose and add', 'Tick the businesses you want, then add them.',
  list([
    'Some websites are run by an agency (a web company looks after the site). Use <b>Filter</b>, then untick <b>Agency likely</b> to hide them.',
    'Press <b>Select this page</b> to tick everything. Press <b>Add to CRM</b>. They now appear in Outreach, in your campaign.',
  ]) + `<div style="display:flex;justify-content:center">${shot('s3-filter', D, 1000, [520, 180, 680, 480], { width: '78%', cap: 'Filter: untick Agency likely.' })}</div>` +
  shot('s3-results', D, 1000, [256, 200, 1184, 560], { cap: 'Tick the businesses, then press Add to CRM. Anyone already added by a colleague is greyed out.' }) +
  tip('Find Leads never adds the same business twice. If a business is already on someone else\u2019s list it shows <b>Added by …</b> with that person\u2019s name, and you cannot tick it. Select all also leaves out the sites an agency very likely runs; you can still tick those one by one.')));

/* ── 4 outreach ── */
pages.push(step(4, 'Outreach: check your campaign', 'Outreach is your working list. Always check the campaign first.',
  list([
    'Open <b>Outreach</b>. Near the top, next to <b>Campaign</b>, pick the campaign you want to work, for example Plumbers.',
    'Only that campaign\u2019s businesses are shown. Choose <b>All campaigns</b> to see everything.',
    'Tick the businesses you want to work (or press <b>Select this page</b>). A row of buttons appears. This is where you pick your route, on the next pages.',
  ]) + shot('s4-outreach-campaign', D, 1000, [256, 20, 1184, 340], { cap: 'The campaign picker.' }) +
  shot('s5-toolbar', D, 1000, [256, 250, 1184, 360], { cap: 'Tick rows and the buttons appear. Route A: Queue WhatsApp. Route B: Check before calling.' }) +
  tip('There are two ways to reach people. Use either, or both. Route A is quick and light. Route B is better for businesses you want to phone with something specific to say.')));

/* ── 5A ── */
pages.push(step('5A', 'Route A: message first, then answer replies', 'A short WhatsApp goes out first. You talk to the people who reply.',
  list([
    'On Outreach, press <b>Select this page</b> (or tick some rows). Press <b>Queue WhatsApp</b>.',
    'Choose the opener. <b>Initial contact — original opener</b> sends: <i>“Hi, is this [business name]? Cheers”</i>. Press <b>Queue</b>.',
    'The messages go out during the day (7am to 9:30pm UK time). Only businesses you have never contacted are queued.',
    'When someone replies, open <b>Inbox</b>. Their reply and the whole chat are there.',
    'Within 24 hours of their reply you can send a normal free-hand message, a file or a voice note. After 24 hours you need an approved template.',
  ]) + `<div style="display:flex;justify-content:center">${shot('s5a-queue', D, 1000, [500, 300, 590, 400], { width: '62%', cap: 'Choose the opener, then Queue.' })}</div>` +
  shot('s5a-inbox', D, 900, [600, 756, 808, 66], { cap: 'Inbox reply box: type a message, attach a file, or record a voice note.' }) +
  tip('There is also an <b>AI draft reply</b> button that writes a suggested reply for you to check. It is still in beta, so treat it as optional.')));

/* ── 5B ── */
pages.push(step('5B', 'Route B: run audits, then call', 'The app researches your businesses for you, so you can open with something real.',
  list([
    'On Outreach, tick several businesses (up to 20 at a time). Press <b>Check before calling</b>.',
    'It runs an AI audit on every one at once: it asks ChatGPT, Gemini and Google AI who they recommend, and it reads each website to find problems. This takes a few minutes. Keep working.',
    'The bar at the top shows it loading, with counts of how many are ready, checking or waiting. You have <b>50 checks a day</b>; the bar shows how many are left.',
    'Each finished row shows scores like <b>ChatGPT 1/3</b>. <b>Click a business row</b> to open its prospect page.',
    '<b>Ring a business only after its audit has finished</b>, so you have the findings in front of you.',
  ]) + `<div style="display:flex;justify-content:center">${shot('s5b-checks', D, 1000, [295, 330, 385, 48], { width: '70%', cap: 'The bar at the top while the audits run.' })}</div>` +
  shot('s5b-checks', D, 1000, [340, 620, 1060, 290], { cap: 'Finished rows show their scores. Click a row to open the prospect page.' }) +
  tip('A check never sends anything to the business and never changes their status. Results from the last two weeks are reused, so they do not use up your daily checks.')));

/* ── 6 prospect page ── */
pages.push(step(6, 'The prospect page', 'This is the screen you use on the call. Click a business row to open it. Scroll down: each section has a job.',
  `<div class="row"><div style="flex:0 0 94mm">${shot('s6a-call-top', D, 1300, [336, 78, 768, 880], { cap: 'The top of the prospect page.' })}</div>
  <div style="flex:1">
  <table class="sec side">
    <tr><td>Header</td><td>Name, phone, website, status and next action. <b>Call</b> dials from your phone. <b>Log call</b> records what happened. <b>WhatsApp</b> opens the chat.</td></tr>
    <tr><td>Call in browser</td><td>Rings them from your computer. It is not recorded.</td></tr>
    <tr><td>What we found</td><td>Who AI recommended <i>instead</i> of them, their scores, and the top website problems. Open with this: it is real and about them.</td></tr>
    <tr><td>History</td><td>The second tab: every call, message and change on this business.</td></tr>
  </table></div></div>
  <div class="kicker">Further down the same page</div>
  <table class="sec">
    <tr><td>Call script</td><td>What to say, step by step. Use your own words. There is one version for businesses with a website and one for those without.</td></tr>
    <tr><td>Questions</td><td>Type their answers as you talk: the jobs they want, the areas, who decides, who looks after the website. It saves as you type.</td></tr>
    <tr><td>What we offer</td><td>The offer in a few lines, so you can answer “what do I get?”</td></tr>
    <tr><td>Objections</td><td>Ready answers to what people say, such as “too expensive”.</td></tr>
    <tr><td>Close</td><td>Pick the plan and send the sign-up link (Step 7).</td></tr>
  </table>`));

pages.push(step(6, 'The prospect page: script and questions', 'Read the script before you dial. Fill in the questions while you talk.',
  `<div class="two">${shot('s6b-script', D, 1300, [336, 330, 768, 620], { cap: 'Call script: say it in your own words.' })}
  ${shot('s6c-questions', D, 1300, [336, 330, 768, 620], { cap: 'Questions: type their answers. It saves as you type.' })}</div>
  <div class="two">${shot('s6d-offer', D, 1300, [336, 330, 768, 520], { cap: 'What we offer, then Objections, then Close.' })}
  <div>${list(['Open with the line from <b>What we found</b>.', 'Ask the questions in the order shown.', 'If they ask what they get, read <b>What we offer</b>.', 'If they push back, open <b>Objections</b>.'])}</div></div>` +
  tip('Never promise a ranking. Say AI tools <i>may</i> find the business easier to recommend. The page reminds you of this.')));

pages.push(step(6, 'After the call: log it', 'Every call gets an outcome and one next action.',
  list([
    'Press <b>Log this call</b>: the blue bar at the bottom of the prospect page, always there.',
    'Press what happened: <b>Interested, Not interested, Didn’t answer, Call back, Wrong number, Left voicemail</b>. <b>More outcomes</b> has Spoke to owner, Meeting booked and more.',
    'Set <b>one next action</b> with a date, for example Call back on Thursday (the <b>Next</b> line in the header). It then shows up in your day.',
    'Tap the <b>star</b> by the name for businesses that are genuinely interested.',
  ]) + `<div class="two">${shot('s6f-log-call', D, 1000, [480, 280, 480, 440], { cap: 'What happened? One press logs the call.' })}
  <div style="display:flex;justify-content:center">${shot('p2-call-phone', 780, 1688, [0, 0, 780, 1250], { width: '62mm', cap: 'The same prospect page on a phone.' })}</div></div>` +
  tip('Choosing Not interested asks you for the reason. Tell the truth: it helps everyone, and that business will not be contacted again.')));

/* ── 7 closing ── */
pages.push(step(7, 'Closing on the phone', 'When they say yes, the sign-up link does the rest: they read the agreement, sign and pay on their own phone.',
  list([
    'In <b>Close</b>, pick the plan with them. <b>Findable Complete</b> is the recommended one: \u00A399 a month for 12 payments, or \u00A3999 once. <b>Findable Essential</b> is the cheaper one.',
    'Fill in the <b>Questions</b> above first (jobs, areas, who decides). The link will not send until they are answered.',
    'The plan terms and the money-back guarantee appear in plain words. Read them to the customer.',
    'Press <b>WhatsApp</b>, <b>Text</b> or <b>Email</b> to send the link, or <b>Copy link instead</b>. The app checks it is allowed first and asks you to confirm.',
  ]) + `<div class="two">${shot('s7b-close-plan', D, 1300, [336, 330, 768, 800], { cap: 'Choose the plan and how they want to pay.' })}
  ${shot('s7d-send', D, 1300, [336, 330, 768, 800], { cap: 'Send the link. Everything saves as you type.' })}</div>` +
  tip('There is no submit button and no handover form. Everything you type saves on its own. When the customer pays, all of it goes to Paul automatically, and you will see <b>Paid: your part is done</b>.')));

pages.push(step(7, 'What the customer sees', 'You never take payment yourself. The customer does it on their own phone.',
  list([
    'They open your link. <b>Step 1</b>: check the plan. <b>Step 2</b>: read the Client Service Agreement and sign it (name, role, a tick to say they can decide for the business).',
    'After they sign, the button <b>Continue to secure payment</b> unlocks. <b>Step 3</b>: they pay the first \u00A399 on Stripe\u2019s own secure page. You never see their card details.',
    'Paul then makes first contact with the customer within two working days.',
  ]) + `<div class="two">${shot('s7e-agree-sign', D, 1100, [340, 90, 760, 840], { cap: 'The page they open: plan, today\u2019s payment, the agreement to read and sign.' })}
  ${shot('s7f-agree-accepted', D, 1100, [340, 90, 760, 1000], { cap: 'After signing, payment unlocks.' })}</div>` +
  tip('If a customer says they are still in a contract with their current web company, tell Paul. The agreement asks them directly, and while they are tied in we cannot take them on. Nothing is charged.', 'warn')));

/* ── 8 cheat sheet ── */
pages.push(`
<section class="page step cheat">
  <header class="sh"><span class="num">8</span><div><h2>Daily routine: cheat sheet</h2><p class="why">Keep this page open on your phone.</p></div></header>
  <ol>
    <li><div><b>Inbox first.</b><span>Answer anyone who replied: a free-hand message, file or voice note works within 24 hours of their reply.</span></div></li>
    <li><div><b>Open Outreach and check the campaign.</b><span>Pick the niche you are working today. See what is due.</span></div></li>
    <li><div><b>Top up your list.</b><span>Running low? Coverage \u2192 pick towns \u2192 Find leads \u2192 Select \u2192 Add to CRM.</span></div></li>
    <li><div><b>Send openers.</b><span>Select new businesses \u2192 Queue WhatsApp \u2192 choose the opener \u2192 Queue.</span></div></li>
    <li><div><b>Check, then call.</b><span>Select up to 20 \u2192 Check before calling \u2192 Open next ready. Open with \u201CWhat we found\u201D.</span></div></li>
    <li><div><b>Log every call.</b><span>Log this call \u2192 outcome \u2192 one next action with a date. Star the interested ones.</span></div></li>
    <li><div><b>Close.</b><span>Pick the plan, answer the Questions, send the link by WhatsApp, Text or Email. Then move on.</span></div></li>
    <li><div><b>Finish the day.</b><span>Clear every next action that is due today. Check the Inbox once more.</span></div></li>
  </ol>
  ${tip('Stuck, or something looks wrong? Tell Paul. Do not work around a block: if the app will not let you contact someone, there is a reason.')}
  <footer class="pf"><span>Findable<i>.</i> · How to use LeadFinder</span></footer>
</section>`);

const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>How to use LeadFinder: a guide for salespeople</title><style>${CSS}</style></head><body>${pages.join('\n')}</body></html>`;
const out = path.join(here, 'salesperson-guide.html');
fs.writeFileSync(out, html);
console.log('wrote', out);

if (process.argv.includes('--pdf')) {
  const edge = process.env.EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-pdf-'));
  const pdf = path.join(here, 'salesperson-guide.pdf');
  const r = spawnSync(edge, ['--headless=new', `--user-data-dir=${prof}`, '--no-pdf-header-footer', `--print-to-pdf=${pdf}`, 'file:///' + out.replace(/\\/g, '/')], { stdio: 'inherit' });
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch { /* ignore */ }
  console.log('pdf', r.status, fs.existsSync(pdf) ? fs.statSync(pdf).size + ' bytes' : 'missing');
}
/* Retaking screenshots: run the app locally against a faked backend (a throwaway Vite harness with demo data) and capture
   the pages with headless Edge. The harness is deliberately not committed: it faked every network call and contains no real data. */
