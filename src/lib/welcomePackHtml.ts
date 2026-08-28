import { renderReportHtml, esc, type AiAuditReportData } from './aiAuditReportHtml';

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
  .wp-num{ flex:0 0 auto; width:30px; height:30px; border-radius:8px; background:var(--gold,#f2c14e);
    color:#3a2d05; font-weight:900; font-size:15px; display:flex; align-items:center; justify-content:center; }
  .wp-rowbody{ min-width:0; }
  .wp-rowtitle{ font-size:14px; font-weight:800; color:var(--ink); }
  .wp-rowline{ font-size:13px; color:var(--muted); margin:2px 0 0; line-height:1.5; }

  /* info boxes */
  .wp-box{ border:1px solid var(--line); background:#f8fafc; border-radius:10px; padding:12px 14px; margin:12px 0; }
  .wp-box-navy{ border:1px solid var(--line); border-left:4px solid var(--blue,#16407e); background:#fff;
    border-radius:10px; padding:12px 14px; margin:12px 0; }
  .wp-boxtitle{ font-size:10.5px; font-weight:900; letter-spacing:.07em; text-transform:uppercase;
    color:var(--blue-2); margin:0 0 7px; }
  .wp-ticks{ list-style:none; margin:0; padding:0; }
  .wp-ticks li{ font-size:13px; color:var(--ink); line-height:1.5; padding:3px 0 3px 22px; position:relative; }
  .wp-ticks li:before{ content:"\\2713"; position:absolute; left:0; top:3px; color:var(--green,#1f8a4c); font-weight:900; }

  /* monospace boxes */
  .wp-mono{ font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:12.5px;
    background:#0f2547; color:#eaf1ff; border-radius:8px; padding:11px 13px; margin:8px 0;
    white-space:pre-wrap; word-break:break-word; line-height:1.5; }
  .wp-mono-light{ font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:12.5px;
    background:#f1f5f9; color:#1e293b; border:1px solid var(--line); border-radius:8px;
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
  .wp-do .wp-coltitle{ color:var(--green,#1f8a4c); }
  .wp-dont .wp-coltitle{ color:var(--red,#c0392b); }
  .wp-guar{ font-size:12px; font-weight:800; color:var(--blue-2); margin:16px 0 0; }

  @media (max-width:520px){ .wp-wrap{ padding:14px 18px 18px; } }
`;

const PACK_PRINT_CSS = `
  @media print{
    .wp-row, .wp-box, .wp-box-navy, .wp-mono, .wp-mono-light, .wp-col{ break-inside:avoid; page-break-inside:avoid; }
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
        <path d="M0,14 C220,42 420,-4 640,15 C860,34 1010,4 1200,19 L1200,38 L0,38 Z" fill="#ffffff"/>
      </svg>
    </header>
    <section class="wp-wrap">${inner}</section>
    ${foot}
  </div>`;
}

/* ── page bodies ──────────────────────────────────────────────────────────────────────────────
 * British English, no em dashes (the copy was supplied that way and is reproduced as given). */

function coverPage(name: string): string {
  return `
      <div class="wp-eyebrow">Welcome pack</div>
      <h1 class="wp-h1">Welcome to Findable</h1>
      <p class="wp-sub">Prepared for ${esc(name)}</p>
      <p>Thanks for coming on board. This pack is everything in one place: where your business stands
      with AI today, what we&rsquo;re going to do about it, and the one small part that&rsquo;s yours.
      Nothing here is technical, and you can come back to it any time.</p>
      <h2 class="wp-h2">What&rsquo;s inside</h2>
      <div class="wp-rows">
        <div class="wp-row">
          <div class="wp-num">1</div>
          <div class="wp-rowbody">
            <div class="wp-rowtitle">Your plan</div>
            <p class="wp-rowline">What we do, how long it takes, and our money-back guarantee.</p>
          </div>
        </div>
        <div class="wp-row">
          <div class="wp-num">2</div>
          <div class="wp-rowbody">
            <div class="wp-rowtitle">Get more reviews</div>
            <p class="wp-rowline">A five-minute setup, and the one thing that helps most that only you can do.</p>
          </div>
        </div>
        <div class="wp-row">
          <div class="wp-num">3</div>
          <div class="wp-rowbody">
            <div class="wp-rowtitle">Your baseline report</div>
            <p class="wp-rowline">Where AI names you today, question by question. Your starting point,
            and what we measure the before-and-after against.</p>
          </div>
        </div>
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
          <li>A re-check at 8 weeks that shows your before and after in plain numbers</li>
        </ul>
      </div>

      <div class="wp-box-navy">
        <p class="wp-boxtitle">Timeline &amp; guarantee</p>
        ${lead('Timeline.', 'The work goes live in the first few weeks. AI tools take a little time to re-read the web, so we re-measure at 8 weeks from your starting point and send you a clear before-and-after.')}
        ${lead('Guarantee.', 'If you’re not named in more AI answers at that 8-week re-check than you were at the start, you get your money back. We don’t promise a specific position, and no honest company can promise AI will always name you. What we promise is to move you from where you are now.')}
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
      <p>We make sure you&rsquo;re listed and consistent on the ones that count: the big general
      profiles like Google Business Profile and Bing Places, plus the directories and review sites that
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
      <div class="note">Backed by our money-back guarantee. Any questions, just reply to the email this came with.</div>
    </footer>`;

  const packPages = [
    coverPage(name),
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
<meta name="robots" content="noindex,nofollow"/>
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
