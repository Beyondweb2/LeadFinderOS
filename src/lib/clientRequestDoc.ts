import { DOC_CSS, docBand, esc, pdfTitle, printHtmlAsPdf } from './playbookDocStyle';

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
   *  ask, and safe to print: it says this source matters without saying what else does. */
  audits: number;
  tradeAudits: number;
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

export interface ClientRequestInput {
  businessName: string;
  trade: string | null;
  town: string | null;
  fields: ClientHeldField[];
  asks: ClientAsk[];
  /** Named in `named` of `total` AI answers. NULL when no run has completed — the line is then
   *  omitted rather than filled with a borrowed or invented figure. */
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
  .det{ display:flex; align-items:baseline; gap:12px; padding:8px 0; border-bottom:1px solid var(--line); }
  .det:last-child{ border-bottom:0; }
  .det-k{ flex:0 0 150px; font-size:11px; letter-spacing:.06em; text-transform:uppercase;
    color:var(--faint); font-weight:800; }
  .det-v{ flex:1 1 auto; font-size:14px; color:var(--ink); font-weight:600; word-break:break-word; }
  .det-have{ flex:0 0 auto; font-size:9.5px; font-weight:900; letter-spacing:.06em; text-transform:uppercase;
    border-radius:999px; padding:2px 9px; background:#eef1f6; color:var(--muted); white-space:nowrap; }
  .det.miss .det-v{ color:var(--red); font-weight:900; }
  .det.miss .det-have{ background:var(--red); color:#fff; }
  .det-why{ flex:0 0 100%; margin:4px 0 0 162px; font-size:12.5px; line-height:1.5; color:var(--muted); }

  /* One ask per block: what it is, why we are asking, what it costs. */
  .asks{ list-style:none; margin:0; padding:0; }
  .ask{ padding:14px 0; border-bottom:1px solid var(--line); }
  .ask:last-child{ border-bottom:0; }
  .ask-h{ display:flex; align-items:baseline; justify-content:space-between; gap:10px; }
  .ask-name{ font-size:16px; font-weight:850; color:var(--ink); letter-spacing:-.01em; }
  .ask-cost{ flex:0 0 auto; font-size:9.5px; font-weight:800; letter-spacing:.05em; text-transform:uppercase;
    border-radius:999px; padding:2px 9px; white-space:nowrap; background:var(--blue); color:#fff; }
  .ask-cost.free{ background:var(--green); }
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
 *  broadly this source appears; says nothing about what else appears, or in what order. */
function askEvidence(a: ClientAsk, trade: string): string {
  const t = trade || 'businesses';
  if (a.tradeAudits > 0 && a.audits > 0) {
    return `${a.label} appears in ${a.audits} of the ${a.tradeAudits} ${t} businesses we have measured.`;
  }
  return `${a.label} comes up in the answers we measured.`;
}

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

    ${input.asks.length ? `<section class="block tint">
      <div class="sec-eyebrow">Step two</div>
      <div class="sec-title">What only you can do</div>
      <p class="wk-client" style="margin-bottom:12px">These are the ones we cannot complete on your
      behalf, because each needs you personally — your identity, your money, or your decision. For each
      one we have said why we are asking and what it costs.</p>
      <ul class="asks">${input.asks.map((a) => {
        const costLine = COST_SENTENCE[a.cost] ?? '';
        const costLabel = a.cost === 'membership' ? 'Paid membership'
          : a.cost === 'pay-per-lead' ? 'Pay per enquiry'
          : a.cost === 'paid' ? 'Paid'
          : a.cost === 'free' ? 'Free' : '';
        const paras = (a.clientParagraph ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
        return `
        <li class="ask">
          <div class="ask-h">
            <span class="ask-name">${esc(a.label)}</span>
            ${costLabel ? `<span class="ask-cost${a.cost === 'free' ? ' free' : ''}">${esc(costLabel)}</span>` : ''}
          </div>
          <div class="ask-ev">${esc(askEvidence(a, trade))}</div>
          ${paras.length ? `<div class="ask-body">${paras.map((p) => `<p>${esc(p)}</p>`).join('')}</div>` : ''}
          ${!paras.length && a.blockedReason ? `<div class="ask-body"><p>${esc(a.blockedReason)}</p></div>` : ''}
          ${costLine ? `<div class="ask-cost-line">${esc(costLine)}</div>` : ''}
        </li>`;
      }).join('')}
      </ul>
    </section>` : ''}

    <section class="notes">
      ${missing.length ? `<p class="note"><b>Why the details matter.</b> Every directory asks for the
      same handful of facts, and they have to match everywhere or the listings work against each other.
      We cannot complete a single signup while ${missing.length === 1 ? 'that detail is' : 'those details are'} missing.</p>` : ''}
      <p class="note"><b>What to expect.</b> The items above that only you can complete are among the
      strongest signals in everything we have measured. If they are not done, the measurement we take at
      eight weeks is unlikely to move. That is not us stepping back from the work — it is so you can see
      what your part actually decides.</p>
      <p class="note"><b>Being straight with you.</b> We are not going to tell you this guarantees you
      will be named. No client has completed a full eight-week cycle with us yet, so we have no results
      to point at, and we would rather say that than imply otherwise. What we can tell you is what we
      measured, what we did, and what changed when we measured again.</p>
      <p class="note"><b>Our promise.</b> Our promise is to get you named in more AI answers within
      8 weeks, or a full refund.</p>
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
