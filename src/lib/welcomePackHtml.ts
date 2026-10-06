/* ⛔ EXPLICIT .ts ON EVERY RELATIVE IMPORT. This module is now reached from an EDGE FUNCTION
   (render-welcome-pack, via _shared/welcome-pack-render.ts), and Deno cannot resolve an
   extensionless specifier — CLAUDE.md §3. scripts/check-import-graph.mjs fences it. */
import { renderReportHtml, esc, type AiAuditReportData } from './aiAuditReportHtml.ts';
import { FINDABLE_CONTACT_EMAIL, FINDABLE_CONTACT_WHATSAPP, FINDABLE_CONTINUING_GBP, FINDABLE_GUARANTEE, FINDABLE_MONTHLY_GBP,
  FINDABLE_SETUP_PRICE_GBP, MONTHLY_START_V3_WORDS, findableContactPhoneDisplay, serviceRouteForTotal, termMonthsFor, totalPaymentsFor,
  GBP_ACCESS_ASK, GBP_ADD_STEPS, GBP_ACCESS_REASSURANCE, GBP_ACCESS_CONSEQUENCE } from './findableOffer.ts';
import type { BaselineSummary } from './baselineSummary.ts';
import { qrSvg } from './qrSvg.ts';
import { ukDate } from './clientAgreement.ts';
import { storedRemeasureWeeks } from './remeasureFill.ts';

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
  /** The client's contracted payment count (outreach_leads.contract_total_payments: Build 12,
   *  Optimise 6). Absent/unknown → the pack names no count, never a guessed one. */
  totalPayments?: number | null;
  /** outreach_leads.amount_paid — what the client actually paid at sign-up. Absent/unknown → the pack
   *  names no price at all (see agreedCurrentOffer). */
  amountPaid?: number | null;
  /** outreach_leads.remeasure_due_date — the client's RECORDED re-measure date (RG and Ronnie are
   *  pinned at 56 days by hand). Absent → the standard four-week wording. */
  remeasureDueDate?: string | null;
  /** The client's Service Agreement (Paul, 2026-10-02). Absent → no agreement page (a client with no
   *  agreement link: never paid, or refunded). url null → the page says the link comes separately (the
   *  legacy in-browser button cannot read the link). acceptedAtIso set → the button is replaced by
   *  "Agreement accepted on … by …". ⛔ Only an AGREEMENT-PAGE acceptance counts here: the checkout tick
   *  is binding, but Paul still asks every client to sign on the page for the fuller record. */
  agreement?: WelcomePackAgreement | null;
}

export interface WelcomePackAgreement {
  url: string | null;
  /** The route the agreement is on (agreementRoute.resolveAgreementRoute: the paid contract first, else
   *  the link). Decides the ownership key points; null names no ownership terms at all. */
  route?: 'build' | 'optimise' | null;
  /** ⛔ TRUE ONLY WHEN THE RECORD SAYS THE CURRENT AGREEMENT APPLIES (Paul, 2026-10-02, a general rule
   *  for older clients): a route on the client's agreement link (set by today's checkout, or by Paul
   *  choosing Build / Optimise) or a route stamped by today's checkout. Anything else — absent, false —
   *  prints the neutral wording: no £99, no 12-or-6 payments, no button to a v1 agreement. */
  termsKnown?: boolean;
  acceptedAtIso?: string | null;
  acceptedBy?: string | null;
  /** 🔴 v4 (2026-10-06): what follows the minimum term on THIS client's own terms (client_service_terms →
   *  clientTimeline.continuingServiceApplies): 'continues' at FINDABLE_CONTINUING_GBP, or 'stops' (a v4
   *  Optimise fixed term). Absent/null (legacy, or no terms row) names nothing about after the term. */
  afterTerm?: 'continues' | 'stops' | null;
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
  .wp-wrap p{ font-size:13.5px; color:var(--ink); line-height:1.55; margin:0 0 9px; max-width:82ch; }
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

  /* the one-line summaries: the sentence a skimming reader should take away from the page */
  .wp-wrap p.wp-oneline{ font-size:15px; font-weight:800; color:var(--ink); line-height:1.45;
    border-left:3px solid var(--gold-line); padding:2px 0 2px 12px; margin:6px 0 10px; }
  /* a box is already a narrow measure; the body's 70ch cap left a third of every box empty */
  .wp-box p, .wp-box-navy p{ max-width:none; }
  .wp-rows-tight{ gap:4px; }
  /* the cover lists up to eight sections; smaller squares keep it to one printed page */
  .wp-rows-tight .wp-num{ width:26px; height:26px; font-size:13.5px; border-radius:7px; }
  .wp-rows-tight .wp-rowline{ margin-top:0; }
  .wp-rows-tight .wp-row{ align-items:flex-start; }
  .wp-rows-tight .wp-rowtitle, .wp-rows-tight .wp-rowline{ line-height:26px; }
  .wp-rows-tight .wp-rowbody{ display:flex; flex-wrap:wrap; align-items:baseline; column-gap:8px; }
  .wp-points{ margin:4px 0 8px; padding-left:18px; }
  .wp-points li{ font-size:13.5px; color:var(--ink); line-height:1.5; margin:0 0 4px; }
  .wp-ticks li b{ color:var(--ink); }
  /* the time label on each "what happens next" step */
  .wp-when{ display:inline-block; font-size:10.5px; font-weight:900; letter-spacing:.06em; text-transform:uppercase;
    color:var(--blue-2); margin-right:8px; }

  /* the agreement page: the one button in the pack, and its QR code */
  .wp-keys{ margin:6px 0 10px; padding-left:20px; }
  .wp-keys li{ font-size:13.5px; color:var(--ink); line-height:1.5; margin:0 0 7px; }
  .wp-agree{ display:flex; gap:18px; align-items:center; flex-wrap:wrap; margin:16px 0 4px; padding:16px;
    border:1px solid var(--line); border-left:4px solid var(--gold-line); border-radius:0 10px 10px 0; background:var(--gold-tint); }
  .wp-agree-main{ flex:1 1 260px; min-width:0; }
  a.wp-agreebtn{ display:inline-block; background:var(--gold); color:var(--on-gold); font-weight:900; font-size:15px;
    text-decoration:none; padding:12px 18px; border-radius:10px; }
  .wp-agreeurl{ font-size:11px; color:var(--muted); word-break:break-all; margin:8px 0 0; }
  .wp-qr{ flex:0 0 auto; background:#fff; padding:6px; border-radius:8px; border:1px solid var(--line); line-height:0; }
  @media print{ .wp-agree{ break-inside:avoid; page-break-inside:avoid; } }

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
function coverPage(name: string, hasDetails: boolean, hasBaseline: boolean, hasAgreement: boolean, agreementTermsKnown = false): string {
  /* ⚠️ SAME ORDER AS packPages IN buildWelcomePackHtml (Paul, 2026-10-02): what we're doing → why it
     works → where you are now → what happens next → your part → the report. */
  const contents = [
    { title: 'Your plan', line: 'What we do, what you get, the timeline and your guarantee.' },
    { title: 'How it works', line: 'Why many local businesses are hard for AI to read, and what we change.' },
    ...(hasBaseline ? [
      { title: 'Where you stand today', line: 'Your starting result, explained in plain English.' },
      { title: 'What happens next', line: 'The steps from today to your before and after.' },
    ] : []),
    ...(hasAgreement ? [{ title: 'Your agreement', line: agreementTermsKnown ? 'The key points, and where to review and sign it.' : 'How your agreement works from here.' }] : []),
    ...(hasDetails ? [{ title: 'What we have on file', line: 'The details everything is built on. Please check them.' }] : []),
    { title: 'Get more reviews', line: 'A five-minute setup for the part only you can do.' },
    { title: 'Your baseline report', line: 'Every question we asked and what AI said, in full.' },
  ];
  return `
      <div class="wp-eyebrow">Welcome pack</div>
      <h1 class="wp-h1">Welcome to Findable</h1>
      <p class="wp-sub">Prepared for ${esc(name)}</p>
      <p>Thanks for coming on board. This pack has everything in one place: what we&rsquo;re doing,
      where you stand with AI today, and the one small part that&rsquo;s yours.</p>
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
      <div class="wp-rows wp-rows-tight">
        ${contents.map((c, i) => `<div class="wp-row">
          <div class="wp-num">${i + 1}</div>
          <div class="wp-rowbody">
            <div class="wp-rowtitle">${c.title}</div>
            <p class="wp-rowline">${c.line}</p>
          </div>
        </div>`).join('\n        ')}
      </div>
      <p style="margin-top:14px">Any questions at all, just reply to the email this came with.
      <b>Glad to have you with us.</b></p>`;
}

/* 🔴 PER ROUTE (2026-09-29): the client's own count; an unknown one names none. */
/* 🔴 TODAY'S OFFER IS PRINTED ONLY TO A CLIENT WHOSE RECORD PROVES THEY AGREED TO IT (Paul,
   2026-10-02). Proof = a route stamped by today's checkout (contract_total_payments, written only by
   stripe-webhook from the route) AND a £99 first payment. Anything else — an older £19.99 / £49.99
   client, a £99 client from before routes, a pack built with no payment data — gets neutral wording.
   ⛔ Never guessed, never filled in with the standard offer: the guarantee sentence names "£99" and
   the payments line names the monthly, and both would be false for an older client. */
function agreedCurrentOffer(totalPayments: number | null | undefined, amountPaid: number | null | undefined): boolean {
  return serviceRouteForTotal(totalPayments) !== null
    && amountPaid !== null && amountPaid !== undefined && Number(amountPaid) === FINDABLE_SETUP_PRICE_GBP;
}

/* 🔴 THE RE-MEASURE TIMING IS THE CLIENT'S RECORDED DATE, NOT THE DEFAULT (Paul, 2026-10-02). Weeks =
   remeasure_due_date minus the baseline's completed day, in UTC days. Only a whole number of weeks is
   stated as weeks; anything else, or a missing date, returns null and the standard wording is used. */
function recordedRemeasure(dueDate: string | null | undefined, baselineCompletedAt: string | null | undefined): { weeks: number; label: string } | null {
  /* The same stored-interval rule the results email and document use (remeasureFill.ts). */
  const weeks = storedRemeasureWeeks(dueDate, baselineCompletedAt);
  if (weeks === null) return null;
  const label = new Date(String(dueDate).slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return { weeks, label };
}
const WEEK_WORDS: Record<number, string> = { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 10: 'ten', 12: 'twelve' };
function weeksWord(n: number): string { return WEEK_WORDS[n] ?? String(n); }

/* 🔴 WHAT THE MONTHLY PAYS FOR (Paul, 2026-10-02): a new page each month, a monthly AI visibility
   check, adjustments over time, and hosting + maintenance. HOSTING IS PER ROUTE: on Build we host the
   site we built; on Optimise we host it only if they moved it to us, so an unknown or Optimise route
   never claims we host it.
   ⛔ "a monthly check", NEVER "a monthly audit": /terms says the monthly update is not a full
   re-audit, and the pack must not promise more than the terms do. */
function upkeepPhrase(totalPayments: number | null | undefined): string {
  return serviceRouteForTotal(totalPayments) === 'build'
    ? 'hosting and maintenance of your website'
    : 'hosting and maintenance if your site is with us';
}

function termPhrase(totalPayments: number | null | undefined): string {
  const route = serviceRouteForTotal(totalPayments);
  return route
    ? `, for your ${termMonthsFor(route)}-month minimum term (${totalPaymentsFor(route)} payments in total, counting your first)`
    : `, until your agreed payments are complete (counting your first)`;
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
      <p>Reviews help new customers decide whether to trust you, and they strengthen the public evidence
      around your business. The easier you make it for customers to leave one, the more you get.
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
                  <li>Reply to every review you receive. It shows customers you&rsquo;re active and
                  that you care.</li>
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
              <p><b>That&rsquo;s it.</b> We handle the pages and the directories.
              You do the review link once, and ask customers as jobs wrap up. Any questions at all,
              just reply to the email this came with.</p>
            </div>
          </div>
        </div>
      </div>`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   YOUR AGREEMENT: THE KEY POINTS (Paul, 2026-10-02) — his five lines and the ownership line, verbatim,
   then ONE prominent button + a QR code to the client's own agreement page. Not the full text: the
   page itself shows that. ⛔ The link is printed verbatim or not at all; a pack with no link says it
   comes separately rather than printing a dead button.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
/* ⛔ PER ROUTE (pre-sales fix 03, M-024 / B-08). The pack used to print the BUILD ownership lines to every
   client — "We own the website… we can take the site down" — which told an Optimise client the opposite
   of their agreement (9.4: "We will never take your own website offline"; Schedule 1: "Your site is
   always yours"). Each list below says only what that route's agreement says (clauses 3.3, 8, 9.4).
   An unknown route names no ownership or take-down terms at all. */
const GUARANTEE_KEY_POINT = 'If AI names you no more often at your four-week re-check, you can claim your £99 back within 14 days, and the agreement ends.';
/* v3 Option B (final release, 2026-10-05): the first monthly is the day after the Refund Window — never "six weeks
   after your first payment", which contradicted the agreement the client signs (clauses 3.1, 5.6). */
const MONTHLY_KEY_POINT = `Monthly payments start ${MONTHLY_START_V3_WORDS}.`;
export const AGREEMENT_KEY_POINTS: Record<'build' | 'optimise' | 'unknown', readonly string[]> = {
  build: [
    `Your service has a minimum term: ${totalPaymentsFor('build')} payments, counting your first. The remaining payments are owed even if you stop early.`,
    MONTHLY_KEY_POINT,
    'We build, host and manage your new website during the term.',
    'We own the website and our work until your final payment. Then it\u2019s yours.',
    'If a payment is 14 days late, we can take down the website we built until it\u2019s paid. We will tell you first.',
    GUARANTEE_KEY_POINT,
  ],
  optimise: [
    `Your service has a minimum term: ${totalPaymentsFor('optimise')} payments, counting your first. The remaining payments are owed even if you stop early.`,
    MONTHLY_KEY_POINT,
    'Your website is always yours. We will never take it offline.',
    'The pages and content we add become yours on your final payment.',
    'If a payment is 14 days late, we can remove the pages and content we added until it\u2019s paid. We will tell you first.',
    GUARANTEE_KEY_POINT,
  ],
  unknown: [
    'Your service has a minimum term. The remaining payments are owed even if you stop early.',
    MONTHLY_KEY_POINT,
    GUARANTEE_KEY_POINT,
  ],
};
/** 🔴 v4 (2026-10-06): the key point for what follows the minimum term — only when the client's OWN terms say
 *  (afterTerm). A v4 Optimise client is told the payments stop; nobody is told a £29.99 their agreement lacks. */
export function afterTermKeyPoint(route: 'build' | 'optimise' | null | undefined, afterTerm: 'continues' | 'stops' | null | undefined): string | null {
  if (!route || !afterTerm) return null;
  const n = totalPaymentsFor(route);
  if (afterTerm === 'stops') return `Your ${n}th payment is the last. Nothing more is charged: we carry on the monthly work for one final month after it, and then the service ends.`;
  return route === 'build'
    ? `After your ${n}th payment the website is yours, and hosting and monitoring continue at £${FINDABLE_CONTINUING_GBP} a month until you cancel with 30 days’ notice.`
    : `After your ${n}th payment your service continues at £${FINDABLE_CONTINUING_GBP} a month until you cancel with 30 days’ notice.`;
}
const AGREEMENT_ALWAYS_YOURS = 'Your domain, logo and photos are always yours.';

function agreementPage(a: WelcomePackAgreement): string {
  if (!a.termsKnown && !a.acceptedAtIso) {
    return `
      <div class="wp-eyebrow">Your agreement</div>
      <h1 class="wp-h1">Your agreement</h1>
      <p>${esc('Your agreed payment schedule continues under the terms you signed up to.')}</p>
      <p class="wp-note">${esc('Your agreement link will be sent separately.')}</p>`;
  }
  const accepted = a.acceptedAtIso
    ? `<div class="wp-box-navy"><p><b>Agreement accepted on ${esc(ukDate(a.acceptedAtIso))} by ${esc(a.acceptedBy || 'you')}.</b></p></div>`
    : '';
  const action = accepted || (a.url
    ? `<div class="wp-agree">
        <div class="wp-agree-main">
          <a class="wp-agreebtn" href="${esc(a.url)}">Review and agree to your agreement</a>
          <p class="wp-note">Or scan the code with your phone camera. This link is yours alone.</p>
          <p class="wp-agreeurl">${esc(a.url)}</p>
        </div>
        <div class="wp-qr">${qrSvg(a.url, 124, 'QR code for your agreement page')}</div>
      </div>`
    : `<p class="wp-note">Your agreement link will be sent separately.</p>`);
  return `
      <div class="wp-eyebrow">Your agreement</div>
      <h1 class="wp-h1">Your agreement: the key points</h1>
      <p>Your Findable Client Service Agreement sets out exactly what we do and what you pay. In short:</p>
      <ul class="wp-keys">
        ${[...AGREEMENT_KEY_POINTS[a.route ?? 'unknown'], afterTermKeyPoint(a.route, a.afterTerm)].filter((l): l is string => !!l).map((l) => `<li>${esc(l)}</li>`).join('\n        ')}
      </ul>
      <p><b>${esc(AGREEMENT_ALWAYS_YOURS)}</b></p>
      ${action}`;
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

/* ⛔ NO SENTENCE ON THESE PAGES PROMISES A RECOMMENDATION, A CITATION OR A RESULT (Paul,
   2026-10-02). The work improves the public evidence about the business; the measurement says
   whether it is named more often. The engine observations are stated as what OUR MEASUREMENTS have
   often shown, never as a rule about how a model works. */
function planPage1(name: string, totalPayments: number | null | undefined, amountPaid: number | null | undefined,
  remeasure: { weeks: number; label: string } | null): string {
  const n = esc(name);
  const current = agreedCurrentOffer(totalPayments, amountPaid);
  const W = remeasure ? weeksWord(remeasure.weeks) : '';
  /* ⛔ WHAT YOU GET, PER ROUTE (M-024): a Build client's main purchase is the new website, so it is named;
     an Optimise client's pages go on THEIR site. Unknown route: the neutral line. */
  const route = serviceRouteForTotal(totalPayments);
  const pagesLine = route === 'build'
    ? '<li><b>A new website, built and hosted by us.</b> One dedicated page for each key service, answering what customers really ask.</li>'
    : route === 'optimise'
      ? '<li><b>Clearer pages on your own website.</b> One dedicated page for each key service, answering what customers really ask. Your website stays yours.</li>'
      : '<li><b>Clearer website pages.</b> One dedicated page for each key service, answering what customers really ask.</li>';
  return `
      <div class="wp-eyebrow">Your plan</div>
      <h1 class="wp-h1">Your Findable plan</h1>
      <p>More and more customers ask AI tools like ChatGPT and Google&rsquo;s Gemini to recommend a
      local business, and the answer usually names only a handful.</p>
      <p>Findable improves the public evidence about ${n}, on your website and the sites AI reads, so
      AI and search tools can understand you more clearly. Then we measure whether you are named more
      often. Practical, measured work, not vague SEO talk.</p>

      <h2 class="wp-h2">What we do, in one line</h2>
      <p class="wp-oneline">We make the facts about your business clear, consistent and easy to check,
      so you have stronger evidence when customers ask AI who to use.</p>

      <div class="wp-box">
        <p class="wp-boxtitle">What you get</p>
        <ul class="wp-ticks">
          <li><b>Your starting point, measured.</b> Real customer questions, asked several times on ChatGPT and Gemini.</li>
          ${pagesLine}
          <li><b>Your Google Business Profile corrected,</b> so it matches your website.</li>
          <li><b>The right directories for your trade.</b> Added where you are missing, fixed where you are wrong.</li>
          <li><b>A before and after.</b> The same questions asked again, shown side by side.</li>
          <li><b>Every month after that.</b> A new page, a check of your AI visibility, adjustments, and a short update.</li>
        </ul>
      </div>

      <div class="wp-box-navy">
        <p class="wp-boxtitle">Timeline &amp; guarantee</p>
        ${lead('When work starts.', 'Straight away. The first improvements go live within the first few weeks.')}
        ${remeasure
          ? lead('Your first re-measure.', `${W.charAt(0).toUpperCase() + W.slice(1)} weeks after your starting point, due ${remeasure.label}. Same questions, same AI tools. The first check, not the finish line.`)
          : lead('Your first re-measure.', 'Four weeks after your starting point, same questions, same AI tools. The first check, not the finish line.')}
        ${/* ⛔ ESCAPED ONCE, HERE. It used to go through lead(), which escapes its second argument
              again, so the apostrophe in "we'll" reached the PDF as the six characters &#39; . */''}
        ${current
          ? `<p><b>Your guarantee.</b> ${esc(FINDABLE_GUARANTEE)}</p>`
          : lead('Your guarantee.', 'Your money-back guarantee applies on the terms you signed up to.')}
        ${/* ⚠️ lead() ESCAPES ITS SECOND ARGUMENT, so this string uses real characters and never
              HTML entities — "&pound;" here would print those six letters to a paying client. */''}
        ${!current
          ? lead('Payments.', 'Your agreed payment schedule continues under the terms you signed up to.')
          : lead('Payments.', `Your £${FINDABLE_SETUP_PRICE_GBP} covers the measurement, the first round of work and the re-measure. £${FINDABLE_MONTHLY_GBP} a month begins ${MONTHLY_START_V3_WORDS}${termPhrase(totalPayments)}. It pays for the monthly work above, plus ${upkeepPhrase(totalPayments)}. We will email you before it starts.`)}
      </div>`;
}

function planPage2(_name: string): string {
  return `
      <div class="wp-eyebrow">Your plan</div>
      <h1 class="wp-h1">How it works</h1>
      <p class="wp-oneline">AI and search tools can only name a business they can understand and
      check. Our job is to make yours easy to understand and easy to check.</p>
      <p>In our measurements so far, ChatGPT has often used a wider mix of directories and other
      sites, while Gemini has more often used businesses&rsquo; own websites. It varies by trade and
      question, so we measure rather than assume.</p>

      <h3 class="wp-h3">1. Your website pages (the main part of the work)</h3>
      <p><b>Where many local websites fall short.</b> Often one page tries to cover everything, so no
      service has a clear page of its own. Or pages repeat town names and keywords without adding
      anything useful, which makes them harder to make sense of and weaker evidence, for customers
      and AI tools alike.</p>
      <ul class="wp-ticks">
        <li>Each important service gets one clear, dedicated page.</li>
        <li>Location pages only where there is real local information to give. No cloned town pages.</li>
        <li>The questions customers really ask, answered inside the right page. No piles of thin FAQ pages.</li>
        <li>Plain facts that are easy to check: what you do, where you work, how to reach you.</li>
        <li>Any price, qualification or promise is checked with you before it goes live.</li>
      </ul>
      <p style="margin-top:8px"><b>What this means:</b> not more pages, but clearer ones, each with a job to do.</p>

      <h3 class="wp-h3">2. The directories that matter for your trade</h3>
      <p>Which directories matter depends on the trade: one vital for plumbers can be irrelevant for
      accountants. We check which sites AI actually quotes for your trade, then add or correct you there.</p>

      <h3 class="wp-h3">3. Saying the same thing everywhere</h3>
      <p>If your website, Google and a directory each show a different phone number or address, nobody
      can be sure which is right. We make your name, address, phone and services match everywhere.</p>

      <h3 class="wp-h3">4. Your reviews</h3>
      <p>Reviews help customers choose you and add to the public picture of your business. We
      don&rsquo;t claim they decide what AI recommends on their own, but they are well worth having.
      Getting them is the part only you can do, and there is a five-minute setup later in this pack.</p>

      <div class="wp-box-navy">
        <p><b>In short.</b> AI and search tools need clear, consistent, trustworthy information about your
        business. We make your website and listings provide it, and measure whether you are named more often.</p>
      </div>`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   YOUR BASELINE — the measurement result, in a business owner's words.

   ⛔ THE SAME FIGURES THE REPORT SHOWS, FROM THE SAME PAYLOAD. This page reads the folded summary of
   the very report appended below it, so the two can never disagree.
   ⛔ NO PROMISE OF A RECOMMENDATION OR A CITATION, HERE OR ANYWHERE. The wording says the work can
   improve how often AI names them and that AI answers vary between runs. Anything stronger would be
   a promise the engines make, not us.
   ⛔ NO OPERATOR VOCABULARY. "absent", "fragile", "one-engine" and "winnability" do not appear; the
   same facts are stated as sentences a business owner reads once and understands.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** "roughly 1 in every 3 times" — the percentage as a business owner says it. Derived, never typed. */
function oneInPhrase(pct: number): string {
  if (pct >= 60) return 'most times';
  return `roughly 1 in every ${Math.max(2, Math.round(100 / pct))} times`;
}

function baselinePage(name: string, b: BaselineSummary): string {
  const n = esc(name);
  const runs = b.runs || 3;
  const tools = esc(b.engineLabels.join(' and ') || 'each AI tool');
  const engines = b.perEngine.length
    ? b.perEngine.map((e) => `${esc(e.label)} named you in ${e.named} of ${e.total} answers`).join(' &middot; ')
    : '';
  /* Counts, not labels. "Named every time we asked" is the same fact as `strong`, said once. */
  const consistent = b.strong.length;
  const sometimes = b.fragile.length;
  const oneEngineOnly = b.oneEngine.length;
  const never = b.absent.length;
  /* ⚠️ every-time + sometimes + never ARE the whole question set; "only one tool" is a SUBSET of the
     named ones, so it is a separate note, never a fourth line that makes the list add up to more
     questions than were asked (MCLocksmiths read 15 + 14 + 5 of 20). */
  const namedQs = consistent + sometimes;
  const qs = (k: number) => `${k} question${k === 1 ? '' : 's'}`;

  if (b.nameNotJudgeable) {
    return `
      <div class="wp-eyebrow">Your baseline</div>
      <h1 class="wp-h1">Where you stand today</h1>
      <p class="wp-sub">Measured ${esc(b.completedLabel || 'on the date shown in your report')}</p>
      <p>Your business name is close enough to the words people search for that an automatic check
      can&rsquo;t reliably tell a mention of <b>you</b> from a mention of the trade itself. So we
      have not put a score on it. Everything else in this pack still applies, and we read your
      results by hand.</p>
      <p>We asked ${b.questionCount} questions a real customer in your area might ask, ${runs} times each
      on ${tools}. The full detail is in the report at the back of this pack.</p>`;
  }

  const meaning = b.named > 0
    ? `${b.named} of those ${b.total} answers named ${n}. That&rsquo;s ${b.pct}%: ${oneInPhrase(b.pct)} a customer asks, AI mentions you.`
    : `None of those ${b.total} answers named ${n} yet. That is the starting point we work from.`;

  return `
      <div class="wp-eyebrow">Your baseline</div>
      <h1 class="wp-h1">Where you stand today</h1>
      <p class="wp-sub">Measured ${esc(b.completedLabel || 'on the date shown in your report')}</p>
      <p>Before we change anything, we measure. This is your starting point, and the number we compare
      against when we measure again.</p>
      <div class="wp-stats">
        <div class="wp-stat"><div class="wp-statnum">${b.named} of ${b.total}</div><div class="wp-statlab">Answers that named you</div></div>
        <div class="wp-stat"><div class="wp-statnum">${b.pct}%</div><div class="wp-statlab">Of all answers</div></div>
        <div class="wp-stat"><div class="wp-statnum">${b.questionCount}</div><div class="wp-statlab">Questions, asked ${runs}&times; each</div></div>
      </div>

      <h2 class="wp-h2">What the numbers mean</h2>
      <ul class="wp-points">
        <li>We asked <b>${b.questionCount} questions</b> a real customer near you might ask.</li>
        <li>We asked each one <b>${runs} times on ${tools}</b>. That makes <b>${b.total} answers</b> in total.</li>
        <li>${meaning}</li>
        ${engines ? `<li>${engines}.</li>` : ''}
      </ul>

      <h3 class="wp-h3">Why ask everything ${runs} times?</h3>
      <p>AI doesn&rsquo;t give the same answer every time. Ask the same question twice and you can get
      different names. One answer on its own could be luck, good or bad. Asking every question
      several times, on more than one tool, gives a fair average and a starting point you can rely on.</p>

      <h2 class="wp-h2">Where your openings are</h2>
      <ul class="wp-ticks">
        ${consistent ? `<li><b>${qs(consistent)} where AI named you every time.</b> These are already working for you, and we protect them.</li>` : ''}
        ${sometimes ? `<li><b>${qs(sometimes)} where AI named you sometimes, not every time.</b> You are on the edge of the answer, and these can tip either way.</li>` : ''}
        ${never ? `<li><b>${qs(never)} where you were not named at all.</b> The biggest openings, and where clearer pages and listings have the most room to help.</li>` : ''}
      </ul>
      ${oneEngineOnly ? `<p style="margin-top:8px"><b>Worth knowing:</b> on ${oneEngineOnly} of the ${namedQs} question${namedQs === 1 ? '' : 's'} where you were named, only one of the two AI tools named you. One already finds you, so the work is to make the same facts clear to the other.</p>` : ''}

      <div class="wp-box-navy">
        <p class="wp-boxtitle">How we measured it</p>
        <p>${b.questionCount} questions &middot; asked ${runs} times each &middot; on ${tools} &middot;
        the same questions are used again when we re-measure. Every question and answer is in the
        report at the back of this pack.</p>
      </div>`;
}

/* ⛔ THE STEPS NAME THE REAL ORDER: frozen baseline → work → the same questions again → before and
   after. "same frozen questions, the same AI tools, the same method" is pinned by
   welcome-pack-content.test.ts. The guarantee itself is printed once, on the plan page. */
function nextPage(totalPayments: number | null | undefined, remeasure: { weeks: number; label: string } | null): string {
  const W = remeasure ? weeksWord(remeasure.weeks) : 'four';
  const step = (i: number, when: string, title: string, line: string) => `
        <div class="wp-row"><div class="wp-num">${i}</div><div class="wp-rowbody">
          <div class="wp-rowtitle"><span class="wp-when">${when}</span>${title}</div>
          <p class="wp-rowline">${line}</p></div></div>`;
  return `
      <div class="wp-eyebrow">What happens next</div>
      <h1 class="wp-h1">From today to your before and after</h1>
      <p>Week ${W} is your first check, not the end. Nothing about the test changes along the way.</p>
      <div class="wp-rows">
        ${step(1, 'Today', 'Your baseline is locked', 'These exact questions are frozen, so the before and after is like for like. No moved goalposts.')}
        ${step(2, 'The next few weeks', 'We do the work', 'Clearer pages on your website, your Google Business Profile corrected, and your directory listings added and fixed.')}
        ${step(3, `At ${W} weeks`, 'Your first re-measure', remeasure
          ? `The same frozen questions, the same AI tools, the same method, the same towns. Due ${remeasure.label}.`
          : 'The same frozen questions, the same AI tools, the same method, the same towns.')}
        ${step(4, 'Then', 'You get your before and after', 'Side by side, with every answer shown. If the number has not gone up, your guarantee applies.')}
        ${step(5, 'Every month after', 'We keep building', `A new page each month, giving customers and AI another clear answer about what you do. We check your AI visibility monthly and adjust as we learn, plus ${upkeepPhrase(totalPayments)}. A short update tells you what changed.`)}
      </div>
      <div class="wp-box">
        <p class="wp-boxtitle">Why the answers vary</p>
        <p>AI answers are not fixed. Ask the same question twice and the names can change, which is why
        we ask everything several times and compare like for like. Our work makes your business easier
        to find, understand and describe correctly; the re-measure shows whether the number has moved.
        What nobody can do is guarantee that a particular AI tool will recommend you or quote your
        website on a particular day.</p>
      </div>
      <div class="wp-box">
        <p class="wp-boxtitle">Your domain and your current website</p>
        <p>If we are building you a new website, your business needs to own or control its web address
        (its domain). If an agency or developer runs your current site, that agreement stays yours to
        manage, and we only reuse material your business owns or is allowed to use. If anything changes
        with your domain or your provider, tell us straight away. Full terms: findable.live/terms.</p>
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

  /* ⛔ THE SEO GRADE STAYS IN THE PACK — AS A SEPARATE WEBSITE MEASURE (Paul's ruling, wave 1 integration,
     2026-10-04; fix 03 had removed it pending that ruling). 'pack' prints the measured grade as BEFORE, an
     AFTER only when one was genuinely measured, and says the guarantee is judged on AI visibility alone —
     never a projected or promised grade, never the money-back number. */
  const reportHtml = renderReportHtml({ ...input.report, hidePitch: true, seoStyle: 'pack' });
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
  const remeasure = recordedRemeasure(input.remeasureDueDate, input.baseline?.completedAt ?? null);
  const packPages = [
    coverPage(name, !!input.facts, !!input.baseline, !!input.agreement, !!(input.agreement?.termsKnown || input.agreement?.acceptedAtIso)),
    planPage1(name, input.totalPayments, input.amountPaid, remeasure),
    planPage2(name),
    ...(input.baseline ? [baselinePage(name, input.baseline), nextPage(input.totalPayments, remeasure)] : []),
    ...(input.agreement ? [agreementPage(input.agreement)] : []),
    ...(input.facts ? [detailsPage(name, input.facts)] : []),
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
