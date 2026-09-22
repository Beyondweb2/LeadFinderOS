/* ⛔ EXPLICIT .ts ON EVERY RELATIVE IMPORT. This module is now reached from an EDGE FUNCTION
   (render-welcome-pack, via _shared/welcome-pack-render.ts), and Deno cannot resolve an
   extensionless specifier — CLAUDE.md §3. scripts/check-import-graph.mjs fences it. */
import { renderReportHtml, esc, type AiAuditReportData } from './aiAuditReportHtml.ts';
import { FINDABLE_CONTACT_EMAIL, FINDABLE_CONTACT_WHATSAPP, FINDABLE_GUARANTEE, FINDABLE_MONTHLY_GBP,
  FINDABLE_SETUP_PRICE_GBP, findableContactPhoneDisplay,
  GBP_ACCESS_ASK, GBP_ADD_STEPS, GBP_ACCESS_REASSURANCE, GBP_ACCESS_CONSEQUENCE } from './findableOffer.ts';
import type { BaselineSummary } from './baselineSummary.ts';

/* ════════════════════════════════════════════════════════════════════════════════════════════
   WELCOME PACK — ONE printable document for a client who has just paid:
   [cover] + [plan] + [how it works] + [get more reviews] + [their audit report, pitch hidden].

   ⛔ THE CHROME IS THE AUDIT REPORT'S, TAKEN FROM ITS OWN OUTPUT — NOT REBUILT. This module renders
   the real report once (with hidePitch), then LIFTS its <style> block and its <body> and wraps both
   in one document. That is deliberately different from pagePlanReportHtml.ts, which imports the
   REPORT_CHROME_CSS_* constants: those constants are only the SHARED chrome, while the report's
   <style> also carries every box, band, grade-circle and print rule the report body needs. Since the
   report body is appended verbatim here, it must travel with the CSS that styles it — reassembling a
   subset by hand is how the pack would render the report unstyled, and nobody would notice until a
   client opened the PDF.

   ⚠️ SO THERE IS EXACTLY ONE <head>, ONE @page rule and ONE footer system in the output. The pack's
   own pages reuse the report's `.sheet` / `renderWaveBand` / `renderSiteFooter` structure, so the
   navy header with the wave and the "Prepared for" footer repeat across pages in print by the same
   mechanism the report already uses. No second header/footer system is introduced.

   ⚠️ EXTRACTION FAILS LOUDLY. If the report's document shape ever changes so the <style> or <body>
   cannot be found, this throws rather than silently emitting a pack with no styling or no report.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

export interface WelcomePackInput {
  /** The client, as it should read on the cover and in the copy. */
  businessName: string;
  /** Their Google review link. EMPTY IS A SUPPORTED STATE — the reviews page then explains how to
   *  find it, rather than printing a broken box. Never invented. */
  reviewLink?: string | null;
  /** Everything the audit report needs. `hidePitch` is forced on below, so a caller cannot
   *  accidentally send a paying client the "Ready to get started?" CTA. */
  report: AiAuditReportData;
  /** The verified client facts, ALREADY RESOLVED (src/lib/clientFacts.ts) and already reduced to
   *  what a client may see. Every field is optional and a blank one is simply not printed — this
   *  document never prints a label with a hole in it, and never guesses a value. */
  facts?: WelcomePackFacts | null;
  /** The completed paid baseline, folded (src/lib/baselineSummary.ts). Absent → the baseline page
   *  is omitted entirely rather than rendered with an empty result. */
  baseline?: BaselineSummary | null;
}

/** Client-safe business facts. ⛔ NOTHING OPERATOR-ONLY BELONGS IN THIS SHAPE — no notes, no
 *  workflow state, no database ids, no winnability, no internal classifications. The public route
 *  builds it from an explicit column list and scripts/welcome-pack-public-safety.test.ts pins that. */
export interface WelcomePackFacts {
  website?: string | null;
  primaryLocation?: string | null;
  category?: string | null;
  services?: string[];
  areas?: string[];
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
}

/** Small helper: a bold lead-in then the rest of a sentence, as the copy uses repeatedly. */
function lead(boldPart: string, rest: string): string {
  return `<p><b>${esc(boldPart)}</b> ${esc(rest)}</p>`;
}

/* ── the pack's own styles ─────────────────────────────────────────────────────────────────────
 * ONLY what the report does not already provide: gold number squares, a monospace "ready to send"
 * box, a two-column Do/Don't, and grey / navy-left-border info boxes. Everything else (fonts,
 * colours, .sheet, .band, .wave, .wordmark, .site-foot, @page) comes from the report's CSS.
 * Prefixed `wp-` so it can never collide with a report class. */
const PACK_CSS = `
  .wp-wrap{ padding:18px 28px 24px; }
  .wp-eyebrow{ font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--blue-2); font-weight:800; }
  .wp-h1{ font-size:26px; font-weight:900; color:var(--ink); margin:2px 0 4px; line-height:1.15; }
  .wp-sub{ font-size:13.5px; color:var(--muted); font-weight:700; margin:0 0 12px; }
  .wp-h2{ font-size:17px; font-weight:900; color:var(--ink); margin:18px 0 6px; }
  .wp-h3{ font-size:14.5px; font-weight:800; color:var(--blue-2); margin:16px 0 4px; }
  .wp-wrap p{ font-size:13.5px; color:var(--ink); line-height:1.55; margin:0 0 9px; max-width:70ch; }
  .wp-wrap p.muted{ color:var(--muted); }
  .wp-note{ font-size:12.5px; color:var(--muted); font-style:italic; margin:6px 0 0; }

  /* gold rounded number squares */
  .wp-rows{ display:flex; flex-direction:column; gap:12px; margin:10px 0 0; }
  .wp-row{ display:flex; gap:12px; align-items:flex-start; }
  .wp-num{ flex:0 0 auto; width:30px; height:30px; border-radius:8px; background:var(--gold);
    color:var(--on-gold); font-weight:900; font-size:15px; display:flex; align-items:center; justify-content:center; }
  .wp-rowbody{ min-width:0; }
  .wp-rowtitle{ font-size:14px; font-weight:800; color:var(--ink); }
  /* The one block in the pack that asks the reader to do something, so it is the one block that
     does not look like body copy. Gold rule on the left, matching the report's own band accent. */
  /* ⚠️ --gold-line / --gold-tint / --on-gold-tint, NOT invented names. The pack renders inside the
     report's stylesheet (see this file's header) and a --tint token does not exist there. A token
     that
     does not resolve leaves the block transparent and the text on the page ground, which is exactly
     the "it rendered, therefore it is right" trap. Checked against the token block before use. */
  .wp-ask{ margin:18px 0 6px; padding:14px 16px; border-left:3px solid var(--gold-line); background:var(--gold-tint); border-radius:0 8px 8px 0; }
  .wp-asklabel{ font-size:11px; font-weight:800; letter-spacing:.10em; text-transform:uppercase; color:var(--on-gold-tint); }
  .wp-askline{ margin:6px 0 0; font-size:14px; font-weight:800; color:var(--ink); }
  .wp-asksteps{ margin:6px 0 0; font-size:13px; line-height:1.5; color:var(--on-gold-tint-2); }
  .wp-rowline{ font-size:13px; color:var(--muted); margin:2px 0 0; line-height:1.5; }

  /* info boxes */
  .wp-box{ border:1px solid var(--line); background:var(--panel-tint); border-radius:10px; padding:12px 14px; margin:12px 0; }
  .wp-box-navy{ border:1px solid var(--line); border-left:4px solid var(--blue); background:var(--paper);
    border-radius:10px; padding:12px 14px; margin:12px 0; }
  .wp-boxtitle{ font-size:10.5px; font-weight:900; letter-spacing:.07em; text-transform:uppercase;
    color:var(--blue-2); margin:0 0 7px; }
  .wp-ticks{ list-style:none; margin:0; padding:0; }
  .wp-ticks li{ font-size:13px; color:var(--ink); line-height:1.5; padding:3px 0 3px 22px; position:relative; }
  .wp-ticks li:before{ content:"\\2713"; position:absolute; left:0; top:3px; color:var(--green); font-weight:900; }

  /* monospace boxes */
  .wp-mono{ font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:12.5px;
    background:var(--mono-bg); color:var(--mono-text); border-radius:8px; padding:11px 13px; margin:8px 0;
    white-space:pre-wrap; word-break:break-word; line-height:1.5; }
  .wp-mono-light{ font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:12.5px;
    background:var(--panel-tint-2); color:var(--mono-light-text); border:1px solid var(--line); border-radius:8px;
    padding:10px 12px; margin:8px 0; white-space:pre-wrap; word-break:break-word; }
  .wp-monolabel{ font-size:10px; font-weight:900; letter-spacing:.07em; text-transform:uppercase;
    color:var(--blue-2); margin:10px 0 0; }

  /* two columns (Gmail/Outlook, Do/Don't) */
  .wp-cols{ display:flex; gap:14px; margin:10px 0; flex-wrap:wrap; }
  .wp-col{ flex:1 1 220px; min-width:200px; border:1px solid var(--line); border-radius:10px; padding:11px 13px; }
  .wp-coltitle{ font-size:12.5px; font-weight:900; color:var(--ink); margin:0 0 6px; }
  .wp-col ol{ margin:0; padding-left:18px; }
  .wp-col ol li{ font-size:12.5px; color:var(--ink); line-height:1.5; margin:2px 0; }
  .wp-col ul{ list-style:none; margin:0; padding:0; }
  .wp-col ul li{ font-size:12.5px; color:var(--ink); line-height:1.5; margin:0 0 7px; }
  .wp-do .wp-coltitle{ color:var(--green); }
  .wp-dont .wp-coltitle{ color:var(--red); }
  .wp-guar{ font-size:12px; font-weight:800; color:var(--blue-2); margin:16px 0 0; }

  /* the facts grid on "your details" — a label/value pair per cell, never a table */
  .wp-dl{ display:flex; flex-wrap:wrap; gap:10px 18px; margin:8px 0 0; }
  .wp-dl > div{ flex:1 1 210px; min-width:190px; }
  .wp-dt{ font-size:10.5px; font-weight:900; letter-spacing:.06em; text-transform:uppercase; color:var(--blue-2); }
  .wp-dd{ font-size:13.5px; color:var(--ink); line-height:1.45; word-break:break-word; margin:1px 0 0; }
  /* the three headline numbers on the baseline page */
  .wp-stats{ display:flex; gap:12px; flex-wrap:wrap; margin:10px 0 4px; }
  .wp-stat{ flex:1 1 150px; min-width:140px; border:1px solid var(--line); border-radius:10px;
    padding:11px 13px; background:var(--panel-tint); }
  .wp-statnum{ font-size:24px; font-weight:900; color:var(--ink); line-height:1.1; }
  .wp-statlab{ font-size:11px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; color:var(--blue-2); margin:3px 0 0; }

  @media (max-width:520px){ .wp-wrap{ padding:14px 18px 18px; } }
`;

const PACK_PRINT_CSS = `
  @media print{
    .wp-row, .wp-box, .wp-box-navy, .wp-mono, .wp-mono-light, .wp-col, .wp-stat, .wp-dl > div{ break-inside:avoid; page-break-inside:avoid; }
  }
`;

/** One pack sheet: the report's own band + footer, so print repeats them exactly as the report does. */
function sheet(bandMeta: string, inner: string, foot: string): string {
  return `
  <div class="sheet">
    <header class="band">
      <div class="band-row">
        <div class="wordmark">Findable<span class="dot">.</span></div>
        <div class="band-meta">${bandMeta}</div>
      </div>
      <svg class="wave" viewBox="0 0 1200 38" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M0,14 C220,42 420,-4 640,15 C860,34 1010,4 1200,19 L1200,38 L0,38 Z" style="fill:var(--paper)"/>
      </svg>
    </header>
    <section class="wp-wrap">${inner}</section>
    ${foot}
  </div>`;
}

/* ── page bodies ──────────────────────────────────────────────────────────────────────────────
 * British English, no em dashes (the copy was supplied that way and is reproduced as given). */

/* ⚠️ THE CONTENTS LIST IS DERIVED FROM THE PAGES THAT ARE ACTUALLY IN THE PACK, and numbered by
   position. A hardcoded list was fine while the pack had one shape; it now has two (with and
   without the client's own details and baseline result), and a contents page that promises a
   section the document does not contain is a worse fault than no contents page at all. */
function coverPage(name: string, hasDetails: boolean, hasBaseline: boolean): string {
  const contents = [
    ...(hasDetails ? [{ title: 'What we have on file', line: 'The details everything is built on. Please check them.' }] : []),
    ...(hasBaseline ? [{ title: 'Where you stand today', line: 'Your baseline result, how we measured it, and what happens next.' }] : []),
    { title: 'Your plan', line: 'What we do, how long it takes, and our money-back guarantee.' },
    { title: 'Get more reviews', line: 'A five-minute setup, and the one thing that helps most that only you can do.' },
    { title: 'Your baseline report', line: 'Where AI names you today, question by question. Your starting point, and what we measure the before-and-after against.' },
  ];
  return `
      <div class="wp-eyebrow">Welcome pack</div>
      <h1 class="wp-h1">Welcome to Findable</h1>
      <p class="wp-sub">Prepared for ${esc(name)}</p>
      <p>Thanks for coming on board. This pack is everything in one place: where your business stands
      with AI today, what we&rsquo;re going to do about it, and the one small part that&rsquo;s yours.
      Nothing here is technical, and you can come back to it any time.</p>
      <!-- ⛔ THE ASK COMES FIRST, ABOVE THE CONTENTS. The pack already promised "the one small part
           that's yours" in its opening line and then never said what it was — the address appeared
           nowhere in this document. Placed before the timeline so it cannot read as a later step:
           the profile work waits on it, and a customer who reads to the end and stops has still
           read this.
           ⚠️ Every sentence is a shared constant (findableOffer.ts), byte-identical to the
           confirmation screens in findable-site. An instruction somebody is expected to FOLLOW must
           not exist in three slightly different versions, and the address least of all. -->
      <div class="wp-ask">
        <div class="wp-asklabel">${esc('One thing we need from you')}</div>
        <p class="wp-askline">${esc(GBP_ACCESS_ASK)}</p>
        <p class="wp-asksteps">${esc(GBP_ADD_STEPS)}</p>
        <p class="wp-asksteps">${esc(GBP_ACCESS_REASSURANCE)} ${esc(GBP_ACCESS_CONSEQUENCE)}</p>
      </div>
      <h2 class="wp-h2">What&rsquo;s inside</h2>
      <div class="wp-rows">
        ${contents.map((c, i) => `<div class="wp-row">
          <div class="wp-num">${i + 1}</div>
          <div class="wp-rowbody">
            <div class="wp-rowtitle">${c.title}</div>
            <p class="wp-rowline">${c.line}</p>
          </div>
        </div>`).join('\n        ')}
      </div>
      <p style="margin-top:16px">Any questions at all, just reply to the email this came with.
      <b>Glad to have you with us.</b></p>
      <p class="wp-guar">Backed by our money-back guarantee</p>`;
}

function planPage1(name: string): string {
  const n = esc(name);
  return `
      <div class="wp-eyebrow">Your plan</div>
      <h1 class="wp-h1">Your Findable plan</h1>
      <p class="wp-sub">Prepared for ${n}</p>
      <p>This is your plan for getting ${n} named when people ask AI tools like ChatGPT, Google AI and
      Gemini to recommend a business like yours. It explains what we do, why it works, what
      you&rsquo;ll get, and the couple of small things we&rsquo;d like you to do at your end. Nothing
      here is technical. If anything&rsquo;s unclear, just reply to the email this came with.</p>

      <h2 class="wp-h2">What we do, in one line</h2>
      <p>AI assistants recommend businesses by reading two things: your own website, and the big
      directories and review sites. We make sure both are clean, accurate and easy for AI to read, so
      your business shows up when a customer asks.</p>

      <div class="wp-box">
        <p class="wp-boxtitle">What you get</p>
        <ul class="wp-ticks">
          <li>A full check of whether AI names you right now, and exactly where it doesn&rsquo;t</li>
          <li>Clean, purpose-built pages on your website that AI can actually read and quote</li>
          <li>Your listings on the directories AI checks, made consistent and correct</li>
          <li>We reply to your Google reviews for you, to keep your profile active</li>
          <li>A re-check at four weeks that shows your before and after in plain numbers</li>
        </ul>
      </div>

      <div class="wp-box-navy">
        <p class="wp-boxtitle">Timeline &amp; guarantee</p>
        ${lead('Timeline.', 'The work goes live in the first few weeks. AI tools take a little time to re-read the web, so we re-measure at four weeks from your starting point, on the same questions and the same engines, and send you a clear before-and-after.')}
        ${lead('Guarantee.', esc(FINDABLE_GUARANTEE))}
        ${/* ⚠️ lead() ESCAPES ITS SECOND ARGUMENT, so this string uses real characters and never
              HTML entities — "&pound;" here would print those six letters to a paying client. */''}
        ${lead('What happens next.', `Your £${FINDABLE_SETUP_PRICE_GBP} covers the measurement, the pages and the work to get you named. Fourteen days after we send your four week results, £${FINDABLE_MONTHLY_GBP} a month begins — that is the work that keeps you there: more pages every month, your reviews replied to, and an eye on the technical side of your site. We will email you before it starts, and you can stop it any time.`)}
      </div>`;
}

function planPage2(name: string): string {
  const n = esc(name);
  return `
      <div class="wp-eyebrow">Your plan</div>
      <h1 class="wp-h1">How it works</h1>

      <h3 class="wp-h3">The pages we build (this is the main lever)</h3>
      <p>AI reads business websites directly. The problem is that most local business pages are either
      too thin for AI to bother with, or stuffed with the same keywords and town names repeated over
      and over. AI treats those stuffed pages as spam and skips straight past them.</p>
      <p>We build the opposite. Clean, natural pages that actually answer the questions your customers
      ask AI, written the way AI expects to see a real, trustworthy business: clear facts, honest
      wording about the areas you cover, and your name, address and phone kept consistent everywhere.
      That&rsquo;s the difference. Not more pages, better ones that AI can read, trust, and quote back
      to a customer.</p>

      <h3 class="wp-h3">The directories AI checks</h3>
      <p>When AI can&rsquo;t answer from a website, it leans on the big directories and review sites.
      If you&rsquo;re missing from the ones that matter for your trade, or your details don&rsquo;t line
      up across them, AI has less reason to trust you and name you.</p>
      <p>We make sure you&rsquo;re listed and consistent on the ones that count: your Google
      Business Profile, plus the directories and review sites that
      matter specifically for your trade. If you&rsquo;re already on them, we tidy them up. If
      you&rsquo;re not, we get you on.</p>

      <h3 class="wp-h3">Your reviews</h3>
      <p>Reviews are one of the strongest signals AI and search engines use to decide who to recommend,
      and AI even reads the replies you leave on them. We&rsquo;ll reply to your Google reviews for you,
      so your profile stays active and looks after itself. Getting more reviews in is the single thing
      that helps most, and it&rsquo;s the one part only you can do. There&rsquo;s a simple five-minute
      setup for that on the next page.</p>

      <div class="wp-box-navy">
        <p><b>In short.</b> We make ${n} the clean, clear answer AI can actually read and quote, and we
        keep your website, listings and reviews all saying the same thing. That&rsquo;s what turns being
        named occasionally into being named regularly.</p>
      </div>`;
}

function reviewsPage1(reviewLink: string): string {
  /* ⛔ THE LINK IS PRINTED VERBATIM OR NOT AT ALL. With no link we explain how to find it rather than
     printing an empty box or a guessed URL — a wrong review link on a client's pack sends their
     customers somewhere that is not their listing. */
  const linkBlock = reviewLink
    ? `<p>Here&rsquo;s your review link. Use it anywhere you ask a customer to leave a review.</p>
           <div class="wp-mono-light">${esc(reviewLink)}</div>
           <p class="wp-note">Keep this handy. It&rsquo;s the same link every time.</p>`
    : `<p>Search your business name on Google, signed in with the account that looks after your
           listing, and click <b>Ask for reviews</b> in your business panel. Copy the short link it
           gives you.</p>
           <p class="wp-note">No Business Profile access yet? Open your listing on Google Maps and copy
           the address from your browser. Customers can still leave a review from it in one extra tap.</p>`;
  return `
      <div class="wp-eyebrow">Your part</div>
      <h1 class="wp-h1">Get more Google reviews</h1>
      <p>Reviews are one of the strongest signals AI assistants and search engines use when they decide
      which business to recommend. The easier you make it for customers to leave one, the more you get.
      This takes about five minutes to set up, once.</p>

      <div class="wp-rows">
        <div class="wp-row">
          <div class="wp-num">1</div>
          <div class="wp-rowbody">
            <div class="wp-rowtitle">Your review link</div>
            ${linkBlock}
          </div>
        </div>
        <div class="wp-row">
          <div class="wp-num">2</div>
          <div class="wp-rowbody">
            <div class="wp-rowtitle">Add it to your email signature</div>
            <p>Put one line under your name, so every email you send carries it:</p>
            <div class="wp-mono-light">Happy with our work? <u>Leave us a quick review</u></div>
            <div class="wp-cols">
              <div class="wp-col">
                <p class="wp-coltitle">In Gmail</p>
                <ol>
                  <li>Click the gear icon, top right</li>
                  <li>See all settings</li>
                  <li>On the General tab, scroll to Signature</li>
                  <li>Click your signature to edit, or Create new</li>
                  <li>Add the line, then Save changes at the bottom</li>
                </ol>
              </div>
              <div class="wp-col">
                <p class="wp-coltitle">In Outlook</p>
                <ol>
                  <li>Click the gear icon, top right</li>
                  <li>Mail, then Compose and reply</li>
                  <li>Add the line to your signature box</li>
                  <li>Click Save</li>
                </ol>
                <p class="wp-note">Desktop app: File &gt; Options &gt; Mail &gt; Signatures</p>
              </div>
            </div>
            <p class="wp-note">Tip: don&rsquo;t paste the raw web address. Type the words
            &ldquo;Leave us a quick review&rdquo;, highlight them, then use the link button (the chain
            icon) to attach your link. It looks tidier and gets clicked more.</p>
          </div>
        </div>
      </div>`;
}

function reviewsPage2(): string {
  return `
      <div class="wp-eyebrow">Your part</div>
      <div class="wp-rows">
        <div class="wp-row">
          <div class="wp-num">3</div>
          <div class="wp-rowbody">
            <div class="wp-rowtitle">Ask at the right moment</div>
            <p>The signature works quietly in the background. A direct ask, sent just after a job wraps
            up, is what really moves the number. Copy the message below.</p>
            <p class="wp-monolabel">Ready to send &middot; copy, fill the brackets, send</p>
            <div class="wp-mono">Subject: A quick favour

Hi [first name],

Now [the work] is wrapped up, would you mind leaving us a quick Google review? It takes about a minute and makes a real difference to a small business like ours.

[your review link]

Thanks,
[your name]</div>
            <div class="wp-cols">
              <div class="wp-col wp-do">
                <p class="wp-coltitle">Do</p>
                <ul>
                  <li>Ask every customer, a few at a time, while the work is fresh in their mind.</li>
                  <li>Reply to every review you receive. It shows you&rsquo;re active, and AI reads
                  owner replies too.</li>
                </ul>
              </div>
              <div class="wp-col wp-dont">
                <p class="wp-coltitle">Don&rsquo;t</p>
                <ul>
                  <li>Offer discounts or gifts for reviews. It&rsquo;s against Google&rsquo;s rules and
                  can get reviews removed.</li>
                  <li>Only ask customers you think were happy. Filtering is against the rules too. Ask
                  everyone.</li>
                </ul>
              </div>
            </div>
            <div class="wp-box-navy">
              <p><b>That&rsquo;s it.</b> We handle the pages, the directories and your review replies.
              You do the review link once, and ask customers as jobs wrap up. Any questions at all,
              just reply to the email this came with.</p>
            </div>
          </div>
        </div>
      </div>`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   YOUR DETAILS — what Findable holds about the business, so the client can correct it early rather
   than discover it wrong in a rebuilt website.

   ⛔ ONLY VERIFIED VALUES, AND ONLY THE ONES THAT EXIST. Each row is emitted only when it has a
   value: a blank row would either read as "we have nothing" (true, but the label alone does not say
   so) or invite a guess. Nothing is defaulted, nothing is inferred from a neighbouring field.
   ⛔ NOTHING OPERATOR-ONLY REACHES THIS PAGE. Its input is WelcomePackFacts, which has no field for
   notes, workflow state or an internal classification, so there is no route for one to arrive.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
function detailsPage(name: string, facts: WelcomePackFacts): string {
  const row = (label: string, value: string | null | undefined) => {
    const v = String(value ?? '').trim();
    return v ? `<div><div class="wp-dt">${esc(label)}</div><div class="wp-dd">${esc(v)}</div></div>` : '';
  };
  const list = (label: string, values: string[] | undefined) => row(label, (values ?? []).filter(Boolean).join(', '));
  const rows = [
    row('Business', name),
    row('Website', facts.website),
    row('Main location', facts.primaryLocation),
    row('What you do', facts.category),
    list('Services we measure you on', facts.services),
    list('Areas you serve', facts.areas),
    row('Main contact', facts.contactName),
    row('Email', facts.email),
    row('Phone', facts.phone),
  ].filter(Boolean).join('\n        ');
  return `
      <div class="wp-eyebrow">Your details</div>
      <h1 class="wp-h1">What we have on file</h1>
      <p class="wp-sub">Please check this over</p>
      <p>These are the details we hold for you, taken from what you told us when you signed up and
      from your own website. Everything we do is built on them &mdash; the questions we test, the pages
      we write, the profiles we tidy up. <b>If anything here is wrong or out of date, just reply and
      tell us.</b></p>
      <div class="wp-dl">
        ${rows}
      </div>
      <p class="wp-note">Anything we don&rsquo;t have, we&rsquo;ve left out rather than guessed.</p>`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   YOUR BASELINE — the measurement result, in a business owner's words, and what happens next.

   ⛔ THE SAME FIGURES THE REPORT SHOWS, FROM THE SAME PAYLOAD. This page reads the folded summary of
   the very report appended below it, so the two can never disagree.
   ⛔ NO PROMISE OF A RECOMMENDATION OR A CITATION, HERE OR ANYWHERE. The wording says the work can
   improve how often AI names them and that AI answers vary between runs. Anything stronger would be
   a promise the engines make, not us.
   ⛔ NO OPERATOR VOCABULARY. "absent", "fragile", "one-engine" and "winnability" do not appear; the
   same facts are stated as sentences a business owner reads once and understands.
   ⚠️ THE GUARANTEE SENTENCE IS THE SHARED CONSTANT, unhedged (CLAUDE.md §1).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
function baselinePage(name: string, b: BaselineSummary): string {
  const engines = b.perEngine.length
    ? b.perEngine.map((e) => `${esc(e.label)} named you in ${e.named} of ${e.total} answers`).join(' &middot; ')
    : '';
  /* Counts, not labels. "Named every time we asked" is the same fact as `strong`, said once. */
  const consistent = b.strong.length;
  const sometimes = b.fragile.length;
  const oneEngineOnly = b.oneEngine.length;
  const never = b.absent.length;

  const headline = b.nameNotJudgeable
    ? `<p>Your business name is close enough to the words people search for that an automatic check
       can&rsquo;t reliably tell a mention of <b>you</b> from a mention of the trade itself. So we
       have not put a score on it. Everything else in this pack still applies, and we read your
       results by hand.</p>`
    : `<div class="wp-stats">
        <div class="wp-stat"><div class="wp-statnum">${b.named} of ${b.total}</div><div class="wp-statlab">Answers that named you</div></div>
        <div class="wp-stat"><div class="wp-statnum">${b.pct}%</div><div class="wp-statlab">Of everything we asked</div></div>
        <div class="wp-stat"><div class="wp-statnum">${b.questionCount}</div><div class="wp-statlab">Questions, asked ${b.runs || 3}&times; each</div></div>
      </div>
      ${engines ? `<p>${engines}.</p>` : ''}`;

  const shape = b.nameNotJudgeable ? '' : `
      <h2 class="wp-h2">What that looks like question by question</h2>
      <ul class="wp-ticks">
        ${consistent ? `<li>${consistent} question${consistent === 1 ? '' : 's'} where AI named you every time we asked.</li>` : ''}
        ${sometimes ? `<li>${sometimes} question${sometimes === 1 ? '' : 's'} where AI named you sometimes but not every time &mdash; you are on the edge of the answer there.</li>` : ''}
        ${oneEngineOnly ? `<li>${oneEngineOnly} question${oneEngineOnly === 1 ? '' : 's'} where only one of the two AI tools named you.</li>` : ''}
        ${never ? `<li>${never} question${never === 1 ? '' : 's'} where you were not named at all. These are the openings.</li>` : ''}
      </ul>`;

  return `
      <div class="wp-eyebrow">Your baseline</div>
      <h1 class="wp-h1">Where you stand today</h1>
      <p class="wp-sub">Measured ${esc(b.completedLabel || 'on the date shown in your report')}</p>
      <p>We asked ${b.questionCount} questions a real customer in your area might type, and we asked
      each one ${b.runs || 3} times on each AI tool, so a single lucky or unlucky answer can&rsquo;t
      move the number. This is your starting point.</p>
      ${headline}
      ${shape}
      <div class="wp-box-navy">
        <p class="wp-boxtitle">How we measured it</p>
        <p>${b.questionCount} questions &middot; asked ${b.runs || 3} times each &middot; scored on
        ${esc(b.engineLabels.join(' and ') || 'the AI tools named in your report')} &middot; judged in
        your home town. The full question-by-question detail is in the report at the back of this pack.</p>
      </div>
      <h2 class="wp-h2">What happens next</h2>
      <div class="wp-rows">
        <div class="wp-row"><div class="wp-num">1</div><div class="wp-rowbody">
          <div class="wp-rowtitle">Your baseline is locked</div>
          <p class="wp-rowline">These exact questions are frozen. They are what we compare against later,
          so the before-and-after is a like-for-like comparison and not a moved goalpost.</p></div></div>
        <div class="wp-row"><div class="wp-num">2</div><div class="wp-rowbody">
          <div class="wp-rowtitle">We do the work</div>
          <p class="wp-rowline">Your website and the places AI actually reads, so your business is easy to
          find, easy to understand and easy to describe correctly.</p></div></div>
        <div class="wp-row"><div class="wp-num">3</div><div class="wp-rowbody">
          <div class="wp-rowtitle">We measure again at four weeks</div>
          <p class="wp-rowline">The same frozen questions, the same AI tools, the same method, the same
          home town. Nothing about the test changes.</p></div></div>
        <div class="wp-row"><div class="wp-num">4</div><div class="wp-rowbody">
          <div class="wp-rowtitle">You get the before-and-after</div>
          <p class="wp-rowline">Side by side, with the same working shown.</p></div></div>
      </div>
      <div class="wp-box">
        <p class="wp-boxtitle">Being straight with you</p>
        <p>AI answers are not fixed &mdash; ask the same question twice and the wording can change, which
        is exactly why we ask everything several times and compare like for like. We can make your
        business far easier for AI to find, read and describe correctly, and that is what moves the
        number. What nobody can do is guarantee that a particular AI tool will recommend you or quote
        your website on a particular day. We don&rsquo;t promise it, and we&rsquo;d be careful of
        anyone who does.</p>
      </div>
      <p class="wp-guar">${esc(FINDABLE_GUARANTEE)}</p>`;
}

/** Pull one delimited block out of the report's own output, or throw. */
function slice(html: string, open: RegExp, close: string, what: string): string {
  const m = html.match(open);
  if (!m || m.index === undefined) throw new Error(`welcomePack: could not find the report's ${what} opening tag`);
  const start = m.index + m[0].length;
  const end = html.indexOf(close, start);
  if (end < 0) throw new Error(`welcomePack: could not find the report's ${what} closing tag`);
  return html.slice(start, end);
}

/**
 * ONE printable HTML document: cover, plan, how it works, reviews, then the audit report last.
 *
 * ⛔ hidePitch IS FORCED, not merely defaulted. This document only exists for a client who has paid,
 * so the caller is not trusted to remember.
 */
export function buildWelcomePackHtml(input: WelcomePackInput): string {
  const name = (input.businessName || 'your business').trim();
  const reviewLink = (input.reviewLink ?? '').trim();

  const reportHtml = renderReportHtml({ ...input.report, hidePitch: true });
  const reportCss = slice(reportHtml, /<style>/i, '</style>', 'stylesheet');
  const reportBody = slice(reportHtml, /<body>/i, '</body>', 'body');

  const tag = `Welcome pack &middot; ${esc(name.toUpperCase())}`;
  const foot = `<footer class="site-foot">
      <div class="row">
        <span>Prepared for <b>${esc(name)}</b></span>
        <span>Findable &middot; Welcome pack</span>
      </div>
      <div class="note">Backed by our money-back guarantee. Any questions, message or email me
        &mdash; <a href="https://wa.me/${FINDABLE_CONTACT_WHATSAPP}">${esc(findableContactPhoneDisplay())}</a>
        or <a href="mailto:${esc(FINDABLE_CONTACT_EMAIL)}?subject=${encodeURIComponent(`Findable - ${name}`)}">${esc(FINDABLE_CONTACT_EMAIL)}</a>.</div>
    </footer>`;

  /* ⛔ A PAGE WITH NO DATA IS OMITTED, NEVER RENDERED EMPTY. `facts` and `baseline` are optional
     because the legacy Outreach/Inbox button still builds a pack from a report alone; when they are
     absent the pack is exactly the document it has always been. */
  const packPages = [
    coverPage(name, !!input.facts, !!input.baseline),
    ...(input.facts ? [detailsPage(name, input.facts)] : []),
    ...(input.baseline ? [baselinePage(name, input.baseline)] : []),
    planPage1(name),
    planPage2(name),
    reviewsPage1(reviewLink),
    reviewsPage2(),
  ].map((inner) => sheet(tag, inner, foot)).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<!-- 🔴 THE META IS THE ONLY PROTECTION THAT ACTUALLY TRAVELS. Both this route and /r/ set an
     x-robots-tag header upstream and Cloudflare STRIPS it (measured on production 2026-09-22: the
     header is absent from findable.live/w/ AND findable.live/r/, on both of which upstream sets
     it). So the document's own meta is doing the whole job, and it now matches the report's —
     noarchive and nosnippet included, because a cached copy or a search snippet naming a client's
     measured invisibility and their rivals is the same disclosure by another name. -->
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet"/>
<title>Findable Welcome Pack - ${esc(name)}</title>
<style>
${reportCss}
${PACK_CSS}
${PACK_PRINT_CSS}
</style>
</head>
<body>
${packPages}
${reportBody}
</body>
</html>`;
}
