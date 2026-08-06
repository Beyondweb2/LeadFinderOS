import { DOC_CSS, docBand, esc, pdfTitle, printHtmlAsPdf } from './playbookDocStyle';
import { FINDABLE_GUARANTEE } from './findableOffer';
import { DELIVERY_ASKS } from './clientRequestAsks';

/* ============================================================
   THE CLIENT REQUEST FORM — the only client-facing document in the system.

   ⚠️ THIS FILE DELIBERATELY DOES NOT IMPORT buildPlaybook, directoryFacts, OR ANYTHING THAT CARRIES
   THE CITATION RANKING. It cannot leak the product because it is never handed the product. Its only
   input is ClientRequestInput below: the already-selected asks and the already-resolved held fields.
   Selection happens in clientRequestSelect.ts, on the other side of that type.

   That separation is the point, and it is structural rather than a matter of care. The operator sheet
   contains the full per-trade citation ranking, every cited host, the competitor list, thin markers
   and URL-UNVERIFIED flags. A client who received it would have everything needed to do the work
   without us. So the boundary is a type with no field capable of expressing a ranking — someone
   editing this renderer later has nothing to accidentally print.

   WHAT THIS IS NOT. It is not a summary of the audit, not a report, and not a plan. It asks for the
   handful of things only the client can supply or do, states the evidence for each ask, says what
   each one costs, and stops. Everything else stays on the operator sheet.

   NO MODEL, ANYWHERE. Template plus values, like the operator document — so it cannot drift into a
   promise the Stripe line-item does not make.
   ============================================================ */

/** How many client-only asks the document will ever print. THREE is a judgement, not a measurement:
 *  each one costs the client money or time, and burying the strongest ask among five weakens it.
 *  Named so it can be changed in one place with the reasoning visible. */
export const CLIENT_ASK_LIMIT = 3;

export type AskCost = 'free' | 'paid' | 'pay-per-lead' | 'membership' | 'n/a';

/** One thing only the client can do. Carries its OWN evidence — never the list it came from. */
export interface ClientAsk {
  /** Human name, e.g. "Checkatrade". */
  label: string;
  /** How many audits of this trade it appeared in, and out of how many. The justification for the
   *  ask, and safe to print: it says this source matters without saying what else does.
   *  OPTIONAL because not every ask is justified by our citation data — see evidenceNote. */
  audits?: number;
  tradeAudits?: number;
  /* WHERE THE JUSTIFICATION COMES FROM, when it is not our own measurement. Overrides the
     measured-breadth line entirely.

     THIS EXISTS SO WE CANNOT ACCIDENTALLY CLAIM TO HAVE MEASURED SOMETHING WE HAVEN'T. Google
     Business Profile is the case it was added for: Google publishes guidance that a complete profile
     helps a business appear in AI-powered results, and that is a perfectly good reason to ask a client
     to do a free thing they own. But in OUR data google.com is cited twice across 2 of 62 plumber
     audits out of 10,672 citations — nowhere near a measured lever. So the ask is made on Google's
     authority, attributed to Google, and the note says which it is. Anything put here must name its
     source. */
  evidenceNote?: string;
  cost: AskCost;
  /** Hand-written client-facing wording, {trade}/{town} already substituted. Null is allowed but
   *  the selector will not choose a host without one — see the note there. */
  clientParagraph: string | null;
  /** Why we cannot do it for them, in operator words. Rewritten for the client if absent. */
  blockedReason: string | null;
}

/** One business detail, and whether we already hold it. */
export interface ClientHeldField {
  name: string;
  /** The value we hold, or '' when we do not. */
  value: string;
  held: boolean;
  /** Shown under a MISSING field to explain why it is needed. Held fields do not need one. */
  why?: string;
}

/* THE SCAN, NARROWED FOR A CLIENT. Deliberately NOT the full AiAuditSeo: the per-category grades and
   the numeric scores behind the radar are operator furniture and say nothing a client can act on.
   What comes across is the overall grade and the findings — the two things that are concrete. */
export interface ClientSeoFinding { title: string; detail: string; severity: 'high' | 'med' | 'low' }
export interface ClientSeo { grade: string; findings: ClientSeoFinding[] }

export interface ClientRequestInput {
  businessName: string;
  trade: string | null;
  town: string | null;
  fields: ClientHeldField[];
  /* ⛔ NO `asks` FIELD ANY MORE. Step two used to be derived from the per-trade citation fold and
     listed directory signups. The asks are now FIXED (DELIVERY_ASKS in clientRequestAsks.ts) because
     what we need from a client does not vary by trade — which means this document no longer touches
     the evidence at all, and the old "never pass the Playbook through" boundary is now structural
     rather than a rule someone has to remember. */
  /** Their services and towns, from the questionnaire. The page list IS the product, so the document
   *  prints it back and asks for the facts that make each page specific. Empty when they paid
   *  without completing the questionnaire (the founder-offer Stripe link bypasses it), and the
   *  document then asks for the list itself rather than pretending to know it. */
  services: string[];
  areas: string[];
  /** The real Apify scan of THEIR OWN SITE, when one completed. Null when there is no website or the
   *  scan failed — the section then does not render at all rather than showing an empty grade. */
  seo: ClientSeo | null;
  naming: { named: number; total: number } | null;
}

/** "plumber" -> "a plumber"; "accountant" -> "an accountant". Lifted from the deleted
 *  buildClientDoc: "a accountant" reads as carelessness in a document a client pays for. */
export function aOrAn(word: string): string {
  return /^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`;
}

const COST_SENTENCE: Record<AskCost, string> = {
  membership: 'This one is a paid membership. We are not going to pretend otherwise, and we will not commit you to the cost — that decision is yours.',
  'pay-per-lead': 'Listing is free, but you pay for each enquiry you choose to respond to. You control that spend, not us.',
  paid: 'This one is paid. We will not commit you to the cost — that decision is yours.',
  free: 'This one is free.',
  'n/a': '',
};

/** Extra rules on top of DOC_CSS. The shared stylesheet stays untouched so the operator document and
 *  the audit report cannot shift when this one changes. */
const EXTRA_CSS = `
  /* CLIENT COPY marker: a green positive banner in the same slot the internal document uses for its
     red one, so the two are impossible to confuse at a glance or on paper.
     NOTE ON CSS COMMENTS IN THIS FILE: they ship inside the document, so anyone reading the HTML
     source sees them. Keep them about layout. The shared DOC_CSS still carries a couple of harmless
     ones ("Internal-only banner", the skip block) — they name no host and reveal no ranking, and
     rewriting the shared sheet would alter the operator document. */
  .client-flag{ background:#ecfdf5; color:#047857; font-size:11px; font-weight:800; letter-spacing:.08em;
    text-transform:uppercase; padding:8px 40px; border-bottom:1px solid var(--line); }

  /* Held vs missing details. Missing is the actionable state, so it is the one that shouts. */
  .details{ list-style:none; margin:0; padding:0; }
  /* ⛔ flex-wrap IS LOAD-BEARING. .det-why asks for flex:0 0 100% — a full-width row of its own —
     and without wrapping it became a FOURTH item on the same line. Everything then compressed: .det-v
     (flex-shrink 1) collapsed to a few pixels and word-break:break-word rendered it one character per
     line, and .det-why overflowed the page and was cut mid-word at the paper edge.
     That is the "M IS SI N G - pl e a s e p r o vi d e" and the "so witho" truncation, both from this
     one missing declaration. Its own margin-left:162px only makes sense on a wrapped line, which is
     what the rule always assumed. */
  .det{ display:flex; flex-wrap:wrap; align-items:baseline; gap:12px; padding:8px 0; border-bottom:1px solid var(--line); }
  .det:last-child{ border-bottom:0; }
  .det-k{ flex:0 0 150px; font-size:11px; letter-spacing:.06em; text-transform:uppercase;
    color:var(--faint); font-weight:800; }
  .det-v{ flex:1 1 auto; font-size:14px; color:var(--ink); font-weight:600; word-break:break-word; }
  .det-have{ flex:0 0 auto; font-size:9.5px; font-weight:900; letter-spacing:.06em; text-transform:uppercase;
    border-radius:999px; padding:2px 9px; background:#eef1f6; color:var(--muted); white-space:nowrap; }
  .det.miss .det-v{ color:var(--red); font-weight:900; }
  .det.miss .det-have{ background:var(--red); color:#fff; }
  .det-why{ flex:0 0 100%; margin:4px 0 0 162px; font-size:12.5px; line-height:1.5; color:var(--muted);
    overflow-wrap:anywhere; }

  /* One ask per block: what it is, why we are asking, what it costs. */
  .asks{ list-style:none; margin:0; padding:0; }
  .ask{ padding:14px 0; border-bottom:1px solid var(--line); }
  .ask:last-child{ border-bottom:0; }
  .ask-h{ display:flex; align-items:baseline; justify-content:space-between; gap:10px; }
  .ask-name{ font-size:16px; font-weight:850; color:var(--ink); letter-spacing:-.01em; }
  .ask-cost{ flex:0 0 auto; font-size:9.5px; font-weight:800; letter-spacing:.05em; text-transform:uppercase;
    border-radius:999px; padding:2px 9px; white-space:nowrap; background:var(--blue); color:#fff; }
  .ask-cost.free{ background:var(--green); }
  /* The two that stop the work, and the one that never does. A client skimming the pills alone must
     be able to tell which is which — that is the whole point of marking them. */
  .ask-cost.blocking{ background:var(--red); }
  .ask-cost.optional{ background:var(--page); color:var(--muted); border:1px solid var(--line); }
  /* THE PAGE LIST — the product, printed back. One row per service, the towns beside it, so the
     client can see exactly what they are getting before they send the details for it. */
  .pages{ list-style:none; margin:0; padding:0; border-top:1px solid var(--line); }
  .pg{ display:flex; align-items:baseline; gap:12px; padding:7px 0; border-bottom:1px solid var(--line); }
  .pg-s{ flex:1 1 auto; font-size:14px; font-weight:750; color:var(--ink); }
  .pg-t{ flex:0 0 auto; font-size:11px; color:var(--muted); text-align:right; }
  /* THE SCAN. One grade, one framing paragraph beside it, then the findings as a plain list. No
     radar and no per-category grades: operator furniture a client cannot act on. */
  .seo-head{ display:flex; flex-wrap:wrap; align-items:flex-start; gap:16px; }
  .seo-grade{ flex:0 0 auto; min-width:118px; padding:10px 14px; background:var(--page);
    border-radius:10px; text-align:center; }
  .seo-grade .k{ font-size:9.5px; letter-spacing:.07em; text-transform:uppercase; color:var(--faint); font-weight:800; }
  .seo-grade .v{ font-size:34px; font-weight:900; color:var(--ink); letter-spacing:-.02em; line-height:1.1; }
  .seo-frame{ flex:1 1 260px; margin:0; font-size:12.5px; line-height:1.55; color:var(--muted); }
  .seo-find{ list-style:none; margin:0; padding:0; }
  .seo-find li{ display:flex; flex-wrap:wrap; align-items:baseline; gap:10px; padding:7px 0;
    border-bottom:1px solid var(--line); }
  .seo-find li:last-child{ border-bottom:0; }
  .sev{ flex:0 0 auto; font-size:9px; font-weight:900; letter-spacing:.05em; text-transform:uppercase;
    border-radius:999px; padding:2px 8px; color:#fff; background:var(--muted); }
  .sev.high{ background:var(--red); }
  .sev.med{ background:var(--amber); }
  .sev.low{ background:var(--muted); }
  .sf-t{ flex:1 1 200px; font-size:13px; font-weight:750; color:var(--ink); }
  .sf-d{ flex:0 0 100%; font-size:12px; line-height:1.5; color:var(--muted); }
  .ask-ev{ margin:6px 0 0; padding:8px 12px; background:var(--page); border-radius:8px;
    font-size:13px; line-height:1.5; color:#334155; font-weight:600; }
  .ask-body{ margin:8px 0 0; font-size:13.5px; line-height:1.55; color:var(--muted); }
  .ask-body p{ margin:0 0 8px; }
  .ask-body p:last-child{ margin-bottom:0; }
  .ask-cost-line{ margin:6px 0 0; font-size:13px; line-height:1.5; color:var(--ink); font-weight:700; }

  @media print{
    .client-flag,.det-have,.ask-cost,.ask-ev{
      -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
    /* Containers flow, atoms stay whole. */
    .block,.plan{ break-inside:auto !important; }
    .det,.ask,.note{ break-inside:avoid; }
    .sec-title{ break-after:avoid; }
  }
`;

/** The evidence for ONE ask, stated so it justifies the request and reveals nothing else. Says how
 *  broadly this source appears; says nothing about what else appears, or in what order.
 *  A hand-written evidenceNote wins, because an ask justified from outside our data must say so
 *  rather than borrow the phrasing of a measurement. */
function askEvidence(a: ClientAsk, trade: string): string {
  if (a.evidenceNote) return a.evidenceNote;
  const t = trade || 'businesses';
  if (a.tradeAudits && a.audits) {
    return `${a.label} appears in ${a.audits} of the ${a.tradeAudits} ${t} businesses we have measured.`;
  }
  return `${a.label} comes up in the answers we measured.`;
}

/* ⛔ THE WEBSITE GRADE IS THE WEBSITE SCORE. IT IS NEVER AI VISIBILITY, AND NOTHING IN THE DOCUMENT
   MAY IMPLY IT IS. Our own measurement says site quality does not decide whether AI names anyone —
   firms the engines name have WORSE sites than our clients do. So "B to A" is honest as "we fixed
   your site" and dishonest as "we made AI name you". The copy states the separation outright rather
   than leaving it to be inferred, and a test asserts the phrase "get you named" only ever appears
   negated.
   THE GRADE IS IN BECAUSE BEING JUDGED ON IT IS THE POINT: it is the one number in the engagement
   that is mechanically ours. Fixing H1s, alt text and meta descriptions raises it. That is work, not
   a prediction — which is exactly why it can carry a promise when the naming cannot.

   ⚠️ AND THIS IS A TEMPLATE LITERAL, NOT JSX. A brace-slash-star comment inside the returned string
   PRINTS — the first version of this note rendered in full on the client's document, internal
   warnings and all. Comments about the markup belong out here, and never write the closing
   star-slash sequence inside one or it terminates itself. */
export function renderClientRequestDoc(input: ClientRequestInput): string {
  const trade = (input.trade ?? '').trim().toLowerCase();
  const town = (input.town ?? '').trim();
  const vert = [input.trade, input.town].filter(Boolean).join(' · ');
  const missing = input.fields.filter((f) => !f.held);

  /* ONE LINE OF CONTEXT. Omitted entirely when nothing has completed — asked for explicitly, because
     the address request is valid whether or not a run finished, and refusing to produce the document
     would block the one field that is holding up every other piece of work. No borrowed figure, no
     invented one. */
  const context = input.naming
    ? `We asked AI assistants ${input.naming.total} question${input.naming.total === 1 ? '' : 's'} a customer might`
      + ` ask when looking for ${trade ? aOrAn(trade) : 'a business like yours'}${town ? ` in ${town}` : ''},`
      + ` and you were named in ${input.naming.named} of them.`
    : `We have not completed a measurement for you yet. The requests below do not depend on it —`
      + ` they are the things we cannot do without you, whatever the measurement shows.`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>What we need from you — ${esc(input.businessName)}</title>
<style>${DOC_CSS}${EXTRA_CSS}</style>
</head>
<body>
  <div class="sheet">
${docBand('What we need from you')}
    <div class="client-flag">Client copy &middot; safe to send</div>
    <div class="head">
      <div class="for">Prepared for</div>
      <h1>${esc(input.businessName)}</h1>
      ${vert ? `<div class="vert">${esc(vert)}</div>` : ''}
    </div>
    <div class="summary">${esc(context)}</div>

    <section class="block">
      <div class="sec-eyebrow">Step one</div>
      <div class="sec-title">What we need from you</div>
      <p class="wk-client" style="margin-bottom:12px">Here is everything we hold for you. Please fill in
      anything marked <b>missing</b> and send it back — you do not need to re-send what is already here.</p>
      <ul class="details">${input.fields.map((f) => `
        <li class="det${f.held ? '' : ' miss'}">
          <span class="det-k">${esc(f.name)}</span>
          <span class="det-v">${esc(f.held ? f.value : 'MISSING — please provide')}</span>
          <span class="det-have">${f.held ? 'we have this' : 'we need this'}</span>
          ${!f.held && f.why ? `<span class="det-why">${esc(f.why)}</span>` : ''}
        </li>`).join('')}
      </ul>
    </section>

    <section class="block tint">
      <div class="sec-eyebrow">Step two</div>
      <div class="sec-title">What only you can do</div>
      <p class="wk-client" style="margin-bottom:12px">Everything else on your setup we do ourselves.
      These are the ones we cannot: each needs your access, your property, or your decision. Two of
      them stop the work until they are done, and they are marked.</p>
      <ul class="asks">${DELIVERY_ASKS.map((a) => `
        <li class="ask">
          <div class="ask-h">
            <span class="ask-name">${esc(a.label)}</span>
            ${a.blocking ? '<span class="ask-cost blocking">Holds everything up</span>' : ''}
            ${a.optional ? '<span class="ask-cost optional">Optional</span>' : ''}
            ${a.cost === 'free' ? '<span class="ask-cost free">Free</span>' : ''}
          </div>
          <div class="ask-ev">${esc(a.why)}</div>
          <div class="ask-body"><p>${esc(a.how)}</p></div>
        </li>`).join('')}
      </ul>
    </section>

    ${input.services.length ? `<section class="block">
      <div class="sec-eyebrow">Step three</div>
      <div class="sec-title">Your pages</div>
      <p class="wk-client" style="margin-bottom:12px">This is the page list from your questionnaire:
      one page for each service, in each town. Send us the details for each service and we will
      write them.</p>
      <ul class="pages">${input.services.map((sv) => `
        <li class="pg"><span class="pg-s">${esc(sv)}</span><span class="pg-t">${
          // A LITERAL SEPARATOR, not an entity: esc() escapes the & in &middot; into &amp;middot;, which
          // renders as visible markup. Anything passed through esc() must already be the character.
          input.areas.length ? esc(input.areas.join(' · ')) : esc(input.town ?? 'your area')
        }</span></li>`).join('')}
      </ul>
      <p class="wk-client" style="margin-top:10px">${
        esc(`${input.services.length} service${input.services.length === 1 ? '' : 's'} across ${
          input.areas.length || 1} town${(input.areas.length || 1) === 1 ? '' : 's'}.`)
      }</p>
    </section>` : `<section class="block">
      <div class="sec-eyebrow">Step three</div>
      <div class="sec-title">Your pages</div>
      <p class="wk-client">We do not have your service list yet. Send us the services you want pages
      for and the towns you want work from, and that becomes the page plan.</p>
    </section>`}

    ${input.seo ? `<section class="block">
      <div class="sec-eyebrow">Step four</div>
      <div class="sec-title">What we found on your website</div>
      <div class="seo-head">
        <div class="seo-grade">
          <div class="k">Website score today</div>
          <div class="v">${esc(input.seo.grade)}</div>
        </div>
        <p class="seo-frame">This is a score for <b>your website</b>, not for whether AI names you.
        The two are separate, and we are careful about which one we promise: the site score is work
        we do and you can hold us to it, and we re-score it at week eight alongside the AI
        measurement. Our own research is that a better site does not by itself get you named &mdash;
        it is what gives AI something of yours worth quoting.</p>
      </div>
      ${input.seo.findings.length ? `<p class="wk-client" style="margin:14px 0 8px">Here is what the
      scan actually found. We fix these &mdash; you do not need to do anything with this list.</p>
      <ul class="seo-find">${input.seo.findings.map((fd) => `
        <li>
          <span class="sev ${fd.severity}">${fd.severity === 'high' ? 'Fix first' : fd.severity === 'med' ? 'Worth fixing' : 'Minor'}</span>
          <span class="sf-t">${esc(fd.title)}</span>
          <span class="sf-d">${esc(fd.detail)}</span>
        </li>`).join('')}
      </ul>` : `<p class="wk-client" style="margin-top:12px">The scan did not raise anything
      significant, which is a good result and unusual.</p>`}
    </section>` : ''}

    <section class="notes">
      ${missing.length ? `<p class="note"><b>Why the details matter.</b> The same handful of facts goes
      on every page we write and on your Google Business Profile, and they have to match each other
      exactly — an engine that finds two versions of your phone number trusts neither. We cannot
      finish a page while ${missing.length === 1 ? 'that detail is' : 'those details are'} missing.</p>` : ''}
      <p class="note"><b>What to expect.</b> The two marked items above hold everything up: without
      the Google invite we cannot touch your profile, and without knowing who controls your domain we
      cannot move your site if it turns out we need to. Everything else can start while you gather
      them.</p>
      <p class="note"><b>Being straight with you.</b> We are not going to tell you this guarantees you
      will be named. No client has completed a full eight-week cycle with us yet, so we have no results
      to point at, and we would rather say that than imply otherwise. What we can tell you is what we
      measured, what we did, and what changed when we measured again.</p>
      <p class="note"><b>Our promise.</b> ${FINDABLE_GUARANTEE}</p>
    </section>

    <footer class="site-foot">
      <div class="row">
        <span>Prepared for <b>${esc(input.businessName)}</b></span>
        <span>Findable</span>
      </div>
    </footer>
  </div>
</body>
</html>`;
}

/** Print the client request via the browser's own dialog. No PDF library. */
export function printClientRequestDoc(input: ClientRequestInput): void {
  printHtmlAsPdf(renderClientRequestDoc(input), pdfTitle(input.businessName, 'Client-Request'));
}
